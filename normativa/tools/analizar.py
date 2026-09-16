#!/usr/bin/env python3
"""
Motor de analisis del corpus normativo de transito (Ecuador).

Hace tres cosas:
  1. Valida la integridad referencial del corpus y reporta el nivel de verificacion.
  2. Calcula la ventana de circulacion efectiva por escenario (interseccion de las
     ventanas permitidas de todos los cantones atravesados).
  3. Aplica reglas de deteccion de conflictos normativos (R1..R6).

Uso:
    python3 tools/analizar.py              # informe en consola
    python3 tools/analizar.py --csv        # ademas exporta CSV a salidas/
    python3 tools/analizar.py --json       # ademas exporta informe.json a salidas/
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import OrderedDict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(BASE, "salidas")

MIN_DIA = 1440
MIN_SEMANA = 7 * MIN_DIA

# Parametros tecnicos nacionales contra los que se contrasta toda definicion local.
UMBRALES_NACIONALES_T = {3.5, 48.0, 60.0}


# --------------------------------------------------------------------------- IO
def cargar(nombre):
    with open(os.path.join(DATA, nombre), encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=OrderedDict)


# ------------------------------------------------------------------- ventanas
def hhmm(valor):
    """'06:00' -> 360 ; '24:00' -> 1440."""
    h, m = valor.split(":")
    return int(h) * 60 + int(m)


def mascara_prohibida(restriccion):
    """Devuelve un bytearray de 7*1440 con 1 en cada minuto prohibido de la semana."""
    mask = bytearray(MIN_SEMANA)
    for v in restriccion["ventanas_prohibidas"]:
        ini, fin = hhmm(v["inicio"]), hhmm(v["fin"])
        for dia in v["dias"]:
            base = (dia - 1) * MIN_DIA
            if fin > ini:                      # ventana dentro del mismo dia
                for t in range(base + ini, base + fin):
                    mask[t % MIN_SEMANA] = 1
            else:                              # ventana que cruza la medianoche
                for t in range(base + ini, base + MIN_DIA):
                    mask[t % MIN_SEMANA] = 1
                for t in range(base + MIN_DIA, base + MIN_DIA + fin):
                    mask[t % MIN_SEMANA] = 1
    return mask


def permitida(masks):
    """Interseccion de ventanas permitidas = complemento de la union de prohibidas."""
    libre = bytearray(b"\x01" * MIN_SEMANA)
    for m in masks:
        for t in range(MIN_SEMANA):
            if m[t]:
                libre[t] = 0
    return libre


def horas(mask):
    return sum(mask) / 60.0


def mascara_jornada(jornada):
    mask = bytearray(MIN_SEMANA)
    ini, fin = hhmm(jornada["inicio"]), hhmm(jornada["fin"])
    for dia in jornada["dias"]:
        base = (dia - 1) * MIN_DIA
        for t in range(base + ini, base + fin):
            mask[t] = 1
    return mask


def tramos_legibles(mask, dia):
    """Lista de intervalos continuos permitidos de un dia, en formato HH:MM-HH:MM."""
    base = (dia - 1) * MIN_DIA
    out, ini = [], None
    for t in range(MIN_DIA + 1):
        activo = mask[base + t] if t < MIN_DIA else 0
        if activo and ini is None:
            ini = t
        elif not activo and ini is not None:
            out.append("%02d:%02d-%02d:%02d" % (ini // 60, ini % 60, t // 60, t % 60))
            ini = None
    return out or ["sin ventana"]


# --------------------------------------------------------------- aplicabilidad
def aplica(perfil, restriccion):
    a = restriccion["aplica_a"]
    cats = set(a.get("categorias") or [])
    if cats and not (cats & set(perfil["categorias"])):
        return False
    pbv, largo = a.get("pbv_min_t"), a.get("largo_min_m")
    op = a.get("operador_umbral")
    if pbv is None and largo is None:
        return True                                   # aplica por categoria pura
    cmp_ = (lambda x, y: x > y) if op == ">" else (lambda x, y: x >= y)
    if pbv is not None and cmp_(perfil["pbv_t"], pbv):
        return True
    if largo is not None and cmp_(perfil["largo_m"], largo):
        return True
    return False


# -------------------------------------------------------------------- validacion
def validar(normas, restricciones, cantones):
    errores = []
    ids_norma = {n["id"] for n in normas["normas"]}
    ids_canton = {c["canton"] for c in cantones["cantones"]}
    ids_restr = {r["id"] for r in restricciones["restricciones"]}
    for r in restricciones["restricciones"]:
        for nid in r["norma_ids"]:
            if nid not in ids_norma:
                errores.append("restriccion %s referencia norma inexistente %s" % (r["id"], nid))
        if r["canton"] not in ids_canton:
            errores.append("restriccion %s referencia canton no catalogado %s" % (r["id"], r["canton"]))
    for c in cantones["cantones"]:
        for rid in c.get("restricciones_en_corpus", []):
            if rid not in ids_restr:
                errores.append("canton %s referencia restriccion inexistente %s" % (c["canton"], rid))
    return errores


# ---------------------------------------------------------------------- reglas
def detectar_conflictos(normas, restricciones, competencias):
    """R1..R6. Cada hallazgo es una hipotesis jurdica que requiere cotejo documental."""
    hallazgos = []
    idx_norma = {n["id"]: n for n in normas["normas"]}

    for r in restricciones["restricciones"]:
        a = r["aplica_a"]

        # R2 - divergencia parametrica frente a los umbrales tecnicos nacionales
        pbv = a.get("pbv_min_t")
        if pbv is not None and pbv not in UMBRALES_NACIONALES_T:
            hallazgos.append(dict(
                regla="R2", tipo="divergencia_parametrica", severidad="alta",
                objeto=r["id"], canton=r["canton"],
                detalle="Umbral local de %.1f t sin correspondencia con los parametros nacionales %s."
                        % (pbv, sorted(UMBRALES_NACIONALES_T)),
                implicacion="Un mismo vehiculo cambia de categoria juridica al cruzar el limite cantonal.",
                base_contraste="AM-MTOP-028-2022 / AM-MTOP-018-2016"))

        # R2b - umbral indeterminado: la norma restringe una categoria que no define
        if pbv is None and a.get("largo_min_m") is None and r["tipo"] == "restriccion_circulacion":
            hallazgos.append(dict(
                regla="R2b", tipo="indeterminacion_del_supuesto", severidad="alta",
                objeto=r["id"], canton=r["canton"],
                detalle="Restringe la categoria %s sin umbral numerico verificable de peso o dimension."
                        % ", ".join(a.get("categorias") or ["(sin categoria)"]),
                implicacion="El alcance subjetivo depende del criterio del agente en via. Inseguridad juridica medible como riesgo de detencion.",
                base_contraste="CRE art. 76.3 (tipicidad)"))

        # R4 - regulacion local de dimensiones, materia tecnica nacional
        if a.get("largo_min_m") is not None:
            hallazgos.append(dict(
                regla="R4", tipo="posible_exceso_competencial", severidad="alta",
                objeto=r["id"], canton=r["canton"],
                detalle="Fija un limite de longitud vehicular (%.1f m) como condicion de acceso." % a["largo_min_m"],
                implicacion="Pesos y dimensiones es materia reglada a nivel nacional por el MTOP (competencia C08).",
                base_contraste="AM-MTOP-018-2016; LOTTTSV art. 30.4 (deber de observar disposiciones nacionales)"))

        # R5 - excepcion discrecional sin criterios publicados
        for e in r.get("excepciones", []):
            if e.get("discrecional") and not e.get("criterios_publicados"):
                tasa = e.get("tasa_negacion_observada")
                hallazgos.append(dict(
                    regla="R5", tipo="discrecionalidad_sin_criterio", severidad="alta",
                    objeto=r["id"], canton=r["canton"],
                    detalle="Excepcion via %s emitida por %s sin criterios de resolucion publicados%s."
                            % (e["tipo"], e["emisor"],
                               "; tasa de negacion observada %.1f%%" % (tasa * 100) if tasa else ""),
                    implicacion="Sin criterio reglado no hay control de legalidad ni previsibilidad para planificar rutas.",
                    base_contraste="CRE art. 76.7.l (motivacion); COOTAD art. 566 si media tasa"))

        # R3 - barrera absoluta: prohibicion permanente sobre enlace sin alternativa vial
        esp = r.get("ambito_espacial", {})
        permanente = sum(mascara_prohibida(r)) == MIN_SEMANA
        if permanente and esp.get("alcance") in ("enlace", "zona") and esp.get("alternativa_vial") == "ninguna":
            hallazgos.append(dict(
                regla="R3", tipo="barrera_absoluta_de_acceso", severidad="alta",
                objeto=r["id"], canton=r["canton"],
                detalle="Prohibicion permanente (168 h/semana) sobre un enlace sin alternativa vial.",
                implicacion="No es una medida de gestion de trafico sino una supresion de accesibilidad: "
                            "ningun reprogramado horario la resuelve. Exige prueba de proporcionalidad y medida alternativa.",
                base_contraste="CRE art. 66.14 (libertad de transito); principio de proporcionalidad"))

        # R1 - sancion local sin ley habilitante identificada
        s = r.get("sancion") or {}
        if s.get("tipo") not in (None, "por_verificar") and s.get("base_legal") in (None, "por_verificar"):
            hallazgos.append(dict(
                regla="R1", tipo="reserva_de_ley_sancionadora", severidad="alta",
                objeto=r["id"], canton=r["canton"],
                detalle="Aplica sancion de tipo %s sin norma legal de respaldo identificada." % s["tipo"],
                implicacion="Las contravenciones de transito y sus multas son reserva de ley. Una ordenanza no puede crearlas.",
                base_contraste="CRE art. 76.3; LOTTTSV; COIP"))

        # R6 - deficit de publicidad en la norma que da soporte a la restriccion
        for nid in r["norma_ids"]:
            n = idx_norma.get(nid, {})
            pub = (n.get("publicacion") or {}).get("registro_oficial")
            if pub in (None, "por_verificar", "gaceta_municipal") or n.get("numero") == "por_verificar":
                hallazgos.append(dict(
                    regla="R6", tipo="deficit_de_publicidad", severidad="media",
                    objeto=nid, canton=r["canton"],
                    detalle="Norma sin referencia de publicacion oficial verificable (numero o Registro Oficial).",
                    implicacion="Una norma que el obligado no puede localizar ni citar es inexigible en la practica y no auditable.",
                    base_contraste="Principio de publicidad normativa"))

    # deduplicar hallazgos identicos
    vistos, unicos = set(), []
    for h in hallazgos:
        k = (h["regla"], h["objeto"], h["detalle"])
        if k not in vistos:
            vistos.add(k)
            unicos.append(h)
    return unicos


def indice_fragmentacion(restricciones):
    """Cuenta cuantas definiciones operativas distintas del mismo concepto coexisten."""
    defs_umbral, defs_ventana, cantones = set(), set(), set()
    for r in restricciones["restricciones"]:
        if r["tipo"] != "restriccion_circulacion":
            continue
        cantones.add(r["canton"])
        a = r["aplica_a"]
        defs_umbral.add((a.get("pbv_min_t"), a.get("operador_umbral"), a.get("largo_min_m")))
        defs_ventana.add(tuple(sorted((v["inicio"], v["fin"], tuple(v["dias"]))
                                      for v in r["ventanas_prohibidas"])))
    return dict(cantones=len(cantones),
                definiciones_de_vehiculo_pesado=len(defs_umbral),
                definiciones_de_ventana=len(defs_ventana))


# --------------------------------------------------------------------- informe
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", action="store_true", help="exporta CSV a salidas/")
    ap.add_argument("--json", action="store_true", help="exporta informe.json a salidas/")
    args = ap.parse_args()

    normas = cargar("normas.json")
    restricciones = cargar("restricciones.json")
    competencias = cargar("competencias.json")
    cantones = cargar("cantones.json")
    rutas = cargar("rutas.json")
    parametros = cargar("parametros.json")

    idx_restr = {r["id"]: r for r in restricciones["restricciones"]}
    perfiles = {p["id"]: p for p in rutas["perfiles_vehiculo"]}
    jornada = mascara_jornada(rutas["jornada_comercial_referencia"])
    horas_jornada = horas(jornada)

    print("=" * 78)
    print("COMPENDIO NORMATIVO DE TRANSITO - ECUADOR | informe v%s | corte %s"
          % (normas["version_corpus"], parametros["fecha_corte"]))
    print("=" * 78)

    # --- 1. integridad y verificacion
    errores = validar(normas, restricciones, cantones)
    niveles = {}
    for n in normas["normas"]:
        niveles[n["verificacion"]] = niveles.get(n["verificacion"], 0) + 1
    print("\n[1] INTEGRIDAD DEL CORPUS")
    print("    normas catalogadas ......... %d" % len(normas["normas"]))
    print("    restricciones operativas ... %d" % len(restricciones["restricciones"]))
    print("    cantones cubiertos ......... %d de %d GAD con competencia asumida (%.1f%%)"
          % (cantones["universo"]["cobertura_actual_corpus"],
             cantones["universo"]["gad_municipales_con_competencia_asumida"],
             100.0 * cantones["universo"]["cobertura_actual_corpus"]
             / cantones["universo"]["gad_municipales_con_competencia_asumida"]))
    print("    errores referenciales ...... %d" % len(errores))
    for e in errores:
        print("      ! " + e)
    print("    nivel de verificacion: " + ", ".join("%s=%d" % kv for kv in sorted(niveles.items())))
    print("    NINGUN registro esta verificado contra fuente primaria en esta version.")

    # --- 2. fragmentacion
    frag = indice_fragmentacion(restricciones)
    print("\n[2] INDICE DE FRAGMENTACION")
    print("    sobre %d cantones coexisten %d definiciones operativas distintas de 'vehiculo pesado'"
          % (frag["cantones"], frag["definiciones_de_vehiculo_pesado"]))
    print("    y %d configuraciones distintas de ventana horaria." % frag["definiciones_de_ventana"])
    print("    Extrapolacion lineal a 221 GAD: del orden de %d definiciones potenciales."
          % (frag["definiciones_de_vehiculo_pesado"] * 221 // max(frag["cantones"], 1)))

    # --- 3. escenarios
    print("\n[3] VENTANA DE CIRCULACION EFECTIVA POR ESCENARIO")
    print("    Plano temporal y plano de red se calculan por separado: una prohibicion de enlace")
    print("    elimina un trazado, no una franja horaria. Ver rutas.json > nota_modelo.")
    filas_escenario = []
    for esc in rutas["escenarios"]:
        perfil = perfiles[esc["perfil_vehiculo"]]
        declaradas = set(esc.get("restricciones_vinculantes_declaradas", []))
        en_ruta = [r for r in restricciones["restricciones"]
                   if r["canton"] in esc["cantones"] and aplica(perfil, r)]
        # vinculantes: alcance cantonal (inevitable) o declaradas por el escenario
        aplicables = [r for r in en_ruta
                      if r["ambito_espacial"].get("alcance") == "cantonal" or r["id"] in declaradas]
        de_red = [r for r in en_ruta if r not in aplicables]
        masks = [mascara_prohibida(r) for r in aplicables]
        libre = permitida(masks)
        h_sem = horas(libre)
        util = bytearray(MIN_SEMANA)
        for t in range(MIN_SEMANA):
            util[t] = 1 if (libre[t] and jornada[t]) else 0
        h_util = horas(util)
        print("\n    %s | %s" % (esc["id"], esc["nombre"]))
        print("      perfil: %s (%.1f t, %.1f m)" % (perfil["id"], perfil["pbv_t"], perfil["largo_m"]))
        print("      supuesto: %s" % esc.get("supuesto", "-"))
        print("      vinculantes en el tiempo: %s" % (", ".join(r["id"] for r in aplicables) or "ninguna"))
        print("      restricciones de red (afectan trazado, no horario): %s"
              % (", ".join("%s[alternativa:%s]" % (r["id"], r["ambito_espacial"].get("alternativa_vial"))
                           for r in de_red) or "ninguna"))
        print("      horas permitidas/semana: %.1f de 168 (%.1f%%)" % (h_sem, 100.0 * h_sem / 168))
        print("      horas permitidas dentro de jornada comercial %s-%s L-V: %.1f de %.1f (%.1f%%)"
              % (rutas["jornada_comercial_referencia"]["inicio"],
                 rutas["jornada_comercial_referencia"]["fin"],
                 h_util, horas_jornada, 100.0 * h_util / horas_jornada))
        print("      ventana comun del lunes: %s" % " | ".join(tramos_legibles(libre, 1)))
        filas_escenario.append(dict(
            escenario=esc["id"], nombre=esc["nombre"], perfil=perfil["id"],
            pbv_t=perfil["pbv_t"], cantones="|".join(esc["cantones"]),
            restricciones="|".join(r["id"] for r in aplicables),
            restricciones_red="|".join(r["id"] for r in de_red),
            horas_semana=round(h_sem, 1), pct_semana=round(100.0 * h_sem / 168, 1),
            horas_jornada_util=round(h_util, 1),
            pct_jornada_util=round(100.0 * h_util / horas_jornada, 1),
            ventana_lunes=" | ".join(tramos_legibles(libre, 1))))

    # --- 4. conflictos
    hallazgos = detectar_conflictos(normas, restricciones, competencias)
    print("\n[4] HALLAZGOS DE CONFLICTO NORMATIVO (hipotesis, requieren cotejo documental)")
    por_regla = {}
    for h in hallazgos:
        por_regla.setdefault(h["regla"], []).append(h)
    for regla in sorted(por_regla):
        print("\n    %s - %s (%d casos)" % (regla, por_regla[regla][0]["tipo"], len(por_regla[regla])))
        for h in por_regla[regla]:
            print("      [%s] %s :: %s" % (h["canton"], h["objeto"], h["detalle"]))
            print("           implicacion: %s" % h["implicacion"])

    # --- 5. competencias en riesgo
    print("\n[5] COMPETENCIAS CON RIESGO ALTO DE COLISION")
    for c in competencias["competencias"]:
        if c["riesgo_conflicto"] == "alto":
            print("    %s %s" % (c["id"], c["funcion"]))
            print("        nivel: %s | GAD puede: %s" % (c["nivel_competente"], c["gad_puede"]))

    # --- exportes
    if args.csv or args.json:
        os.makedirs(OUT, exist_ok=True)
    if args.csv:
        with open(os.path.join(OUT, "escenarios.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(filas_escenario[0].keys()))
            w.writeheader()
            w.writerows(filas_escenario)
        with open(os.path.join(OUT, "conflictos.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["regla", "tipo", "severidad", "canton",
                                               "objeto", "detalle", "implicacion", "base_contraste"])
            w.writeheader()
            w.writerows(hallazgos)
        filas_r = []
        for r in restricciones["restricciones"]:
            libre = permitida([mascara_prohibida(r)])
            for dia in range(1, 8):
                filas_r.append(dict(
                    restriccion=r["id"], canton=r["canton"], autoridad=r["autoridad"],
                    tipo=r["tipo"], dia=dia,
                    horas_permitidas=round(sum(libre[(dia - 1) * MIN_DIA:dia * MIN_DIA]) / 60.0, 2),
                    pbv_min_t=r["aplica_a"].get("pbv_min_t"),
                    operador=r["aplica_a"].get("operador_umbral"),
                    verificacion=r["verificacion"]))
        with open(os.path.join(OUT, "restricciones_dia.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(filas_r[0].keys()))
            w.writeheader()
            w.writerows(filas_r)
        print("\n[6] CSV exportados a salidas/: escenarios.csv, conflictos.csv, restricciones_dia.csv")
    if args.json:
        informe = dict(version=normas["version_corpus"], fecha_corte=parametros["fecha_corte"],
                       integridad=dict(errores=errores, niveles_verificacion=niveles),
                       fragmentacion=frag, escenarios=filas_escenario, hallazgos=hallazgos)
        with open(os.path.join(OUT, "informe.json"), "w", encoding="utf-8") as fh:
            json.dump(informe, fh, ensure_ascii=False, indent=2)
        print("[6] informe.json exportado a salidas/")

    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
