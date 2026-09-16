#!/usr/bin/env python3
"""
Control de plazos de las solicitudes de acceso a la informacion publica.

Lee peticiones/destinatarios.csv y calcula, por destinatario:
  - fecha de vencimiento del termino de 10 dias,
  - fecha de vencimiento con la prorroga de 5 dias,
  - si el termino ya vencio sin respuesta, lo que configura NEGATIVA TACITA y
    habilita la accion de acceso a la informacion publica.

Uso:
    python3 tools/seguimiento.py                 # estado a la fecha de hoy
    python3 tools/seguimiento.py --fecha 2026-10-01
    python3 tools/seguimiento.py --modo plazo    # cuenta dias calendario
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "peticiones", "destinatarios.csv")
FERIADOS = os.path.join(BASE, "data", "feriados.json")

TERMINO_BASE = 10
TERMINO_PRORROGA = 5


def cargar_feriados():
    with open(FERIADOS, encoding="utf-8") as fh:
        return json.load(fh)


def es_feriado(fecha, cfg):
    for f in cfg["fijos_anuales"]:
        if fecha.month == f["mes"] and fecha.day == f["dia"]:
            return True
    extras = cfg["moviles_y_traslados"].get(str(fecha.year), [])
    return fecha.isoformat() in extras


def sumar(fecha, dias, modo, cfg):
    """Suma dias habiles (termino) o corridos (plazo) a partir del dia siguiente."""
    if modo == "plazo":
        return fecha + dt.timedelta(days=dias)
    restantes, cur = dias, fecha
    while restantes > 0:
        cur += dt.timedelta(days=1)
        if cur.weekday() < 5 and not es_feriado(cur, cfg):
            restantes -= 1
    return cur


def parse(valor):
    valor = (valor or "").strip()
    return dt.date.fromisoformat(valor) if valor else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", help="fecha de evaluacion YYYY-MM-DD (por defecto hoy)")
    ap.add_argument("--modo", choices=["termino", "plazo"], help="conteo de dias")
    args = ap.parse_args()

    cfg = cargar_feriados()
    modo = args.modo or cfg["modo_conteo_por_defecto"]
    hoy = dt.date.fromisoformat(args.fecha) if args.fecha else dt.date.today()

    with open(CSV_PATH, encoding="utf-8") as fh:
        filas = list(csv.DictReader(fh))

    faltan_moviles = not cfg["moviles_y_traslados"].get(str(hoy.year))

    print("=" * 96)
    print("CONTROL DE PLAZOS - solicitudes de acceso a la informacion publica")
    print("fecha de evaluacion: %s | modo de conteo: %s | termino %d + %d dias"
          % (hoy, modo, TERMINO_BASE, TERMINO_PRORROGA))
    print("=" * 96)
    if modo == "termino" and faltan_moviles:
        print("! Feriados moviles de %d sin cargar en data/feriados.json: las fechas de" % hoy.year)
        print("  vencimiento son una COTA INFERIOR. Completar antes de invocar negativa tacita.")
    print("! %s" % cfg["advertencia_legal"])
    print()

    resumen = {"pendiente_envio": 0, "en_plazo": 0, "en_prorroga": 0,
               "negativa_tacita": 0, "respondido": 0}
    print("%-5s %-38s %-12s %-12s %-12s %s" %
          ("ID", "ENTIDAD", "ENVIO", "VENCE", "C/PRORROGA", "ESTADO"))
    print("-" * 96)

    accionables = []
    for f in filas:
        envio, resp = parse(f["fecha_envio"]), parse(f["fecha_respuesta"])
        if resp:
            estado, vence, vence_p = "respondido", None, None
        elif not envio:
            estado, vence, vence_p = "pendiente_envio", None, None
        else:
            vence = sumar(envio, TERMINO_BASE, modo, cfg)
            vence_p = sumar(vence, TERMINO_PRORROGA, modo, cfg)
            if hoy <= vence:
                estado = "en_plazo"
            elif hoy <= vence_p:
                estado = "en_prorroga"
            else:
                estado = "negativa_tacita"
                accionables.append((f, vence_p))
        resumen[estado] += 1
        print("%-5s %-38s %-12s %-12s %-12s %s" % (
            f["id"], f["entidad"][:38], envio or "-", vence or "-", vence_p or "-",
            estado.upper() if estado == "negativa_tacita" else estado))

    print("-" * 96)
    print("resumen: " + " | ".join("%s=%d" % kv for kv in resumen.items()))
    total_env = sum(resumen[k] for k in ("en_plazo", "en_prorroga", "negativa_tacita", "respondido"))
    if total_env:
        print("tasa de respuesta sobre enviadas: %d/%d = %.1f%%"
              % (resumen["respondido"], total_env, 100.0 * resumen["respondido"] / total_env))

    if accionables:
        print("\nNEGATIVA TACITA CONFIGURADA - habilita accion de acceso a la informacion")
        print("publica (art. 91 CRE; arts. 47-49 LOGJCC). Verificar antes de accionar que")
        print("no exista prorroga comunicada ni feriado no cargado que corra la fecha.\n")
        for f, vp in accionables:
            print("  %s %s" % (f["id"], f["entidad"]))
            print("      vencio el %s, hace %d dias corridos" % (vp, (hoy - vp).days))

    print("\nRecordatorio: la ausencia de respuesta NO es un vacio del expediente. Un")
    print("consolidado de silencios acredita que el umbral no tiene sustento tecnico, que")
    print("la excepcion no tiene criterio reglado y que la tasa no tiene estudio de costos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
