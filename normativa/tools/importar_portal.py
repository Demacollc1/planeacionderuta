#!/usr/bin/env python3
"""
Fusiona un export del Registro Cantonal de Normativa (el portal) en el corpus.

El portal captura; el corpus interpreta. Este script es el puente: toma el JSON
que exporta el portal y lo integra en data/normas.json y data/cantones.json,
fusionando por id y sin pisar los campos analiticos que el portal no conoce
(disposiciones_clave, relevancia, brechas).

Uso:
    python3 tools/importar_portal.py corpus-normativa.json            # simulacion
    python3 tools/importar_portal.py corpus-normativa.json --aplicar  # escribe
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

# Campos que solo existen en el corpus: nunca se sobrescriben desde el portal.
PRESERVAR = ("disposiciones_clave", "brecha", "rango_art425", "emisor", "notas_analiticas")

MEDIO_A_PUBLICACION = {
    "registro_oficial": "Registro Oficial",
    "gaceta_municipal": "gaceta_municipal",
    "portal_institucional": "portal_institucional",
    "otro": "otro",
    "": None,
}


def cargar(nombre):
    with open(os.path.join(DATA, nombre), encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=collections.OrderedDict)


def norma_portal_a_corpus(n, regimen_por_dpa):
    dpa = n.get("codigo_dpa", "")
    distrital = regimen_por_dpa.get(dpa) == "distrito_metropolitano"
    return collections.OrderedDict([
        ("id", n["id"]),
        ("tipo", n.get("tipo") or "ordenanza"),
        ("nivel", "cantonal"),
        ("codigo_dpa", dpa),
        ("canton", n.get("canton", "")),
        ("rango_art425", 5 if distrital else 7),
        ("emisor", n.get("emisor") or ""),
        ("numero", n.get("numero") or None),
        ("titulo", n.get("titulo", "")),
        ("publicacion", collections.OrderedDict([
            ("registro_oficial", MEDIO_A_PUBLICACION.get(n.get("medio_publicacion", ""), n.get("medio_publicacion"))),
            ("fecha", n.get("fecha_publicacion") or None),
        ])),
        ("fecha_sancion", n.get("fecha_sancion") or None),
        ("estado", n.get("estado") or "por_verificar"),
        ("url_fuente", n.get("url_oficial") or None),
        ("asset_id", n.get("asset_id") or None),
        ("verificacion", n.get("verificacion") or "por_verificar"),
        ("requiere_cotejo", bool(n.get("requiere_cotejo", True))),
        ("citabilidad", n.get("citabilidad")),
        ("campos_faltantes", n.get("campos_faltantes", [])),
        ("materias", n.get("materias", [])),
        ("notas", n.get("notas") or ""),
        ("disposiciones_clave", []),
    ])


def fusionar(destino, entrante):
    """Entrante manda, salvo en los campos analiticos y en los que llegan vacios."""
    salida = collections.OrderedDict(destino)
    for k, v in entrante.items():
        if k in PRESERVAR and destino.get(k):
            continue
        if v in (None, "", [], {}) and destino.get(k):
            continue
        salida[k] = v
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export", help="JSON exportado por el portal")
    ap.add_argument("--aplicar", action="store_true", help="escribe los cambios en data/")
    args = ap.parse_args()

    with open(args.export, encoding="utf-8") as fh:
        ex = json.load(fh)

    normas_doc, cantones_doc = cargar("normas.json"), cargar("cantones.json")
    idx_norma = {n["id"]: i for i, n in enumerate(normas_doc["normas"])}
    # Clave secundaria de negocio: el portal genera ids propios, el corpus trae
    # los suyos. Sin esto, la misma norma entra dos veces con nombres distintos.
    idx_negocio = {}
    for i, n in enumerate(normas_doc["normas"]):
        if n.get("numero") and n.get("numero") != "por_verificar":
            idx_negocio[(n.get("codigo_dpa") or "", str(n["numero"]).strip().lower())] = i
    idx_canton = {c["codigo_dpa"]: i for i, c in enumerate(cantones_doc["cantones"])}
    regimen = {c.get("codigo_dpa"): c.get("regimen") for c in ex.get("cantones", [])}

    nuevos_c = act_c = nuevos_n = act_n = 0

    for c in ex.get("cantones", []):
        fila = collections.OrderedDict([
            ("codigo_dpa", c["codigo_dpa"]),
            ("canton", c.get("canton", "")),
            ("provincia", c.get("provincia", "")),
            ("regimen", c.get("regimen", "municipal")),
            ("rango_ordenanza_art425", c.get("rango_ordenanza_art425", 7)),
            ("autoridad_transito", c.get("autoridad_transito", "")),
            ("modelo_gestion", c.get("modelo_gestion") or "por_verificar"),
        ])
        if c["codigo_dpa"] in idx_canton:
            i = idx_canton[c["codigo_dpa"]]
            fusion = fusionar(cantones_doc["cantones"][i], fila)
            if fusion != cantones_doc["cantones"][i]:
                cantones_doc["cantones"][i] = fusion
                act_c += 1
        else:
            cantones_doc["cantones"].append(fila)
            nuevos_c += 1

    por_negocio = []
    for n in ex.get("normas", []):
        fila = norma_portal_a_corpus(n, regimen)
        i = idx_norma.get(n["id"])
        if i is None and n.get("numero"):
            clave = (n.get("codigo_dpa") or "", str(n["numero"]).strip().lower())
            i = idx_negocio.get(clave)
            if i is not None:
                # Conservar el id del corpus: puede estar citado en otros archivos.
                por_negocio.append((n["id"], normas_doc["normas"][i]["id"]))
                fila["id"] = normas_doc["normas"][i]["id"]
                fila["id_portal"] = n["id"]
        if i is not None:
            fusion = fusionar(normas_doc["normas"][i], fila)
            if fusion != normas_doc["normas"][i]:
                normas_doc["normas"][i] = fusion
                act_n += 1
        else:
            normas_doc["normas"].append(fila)
            nuevos_n += 1

    total = len(normas_doc["normas"])
    citables = sum(1 for n in normas_doc["normas"] if n.get("citabilidad") == 6)
    primarias = sum(1 for n in normas_doc["normas"] if n.get("verificacion") == "primaria")

    print("export: %s (%d cantones, %d normas)"
          % (os.path.basename(args.export), len(ex.get("cantones", [])), len(ex.get("normas", []))))
    print("cantones: %d nuevos, %d actualizados" % (nuevos_c, act_c))
    print("normas:   %d nuevas, %d actualizadas" % (nuevos_n, act_n))
    for id_portal, id_corpus in por_negocio:
        print("  fusion por canton+numero: portal %s -> corpus %s (se conserva el id del corpus)"
              % (id_portal, id_corpus))
    print("corpus resultante: %d normas | %d citables (6/6) | %d en verificacion primaria"
          % (total, citables, primarias))
    cob = len(cantones_doc["cantones"])
    print("cobertura: %d de %d GAD = %.1f%%"
          % (cob, cantones_doc["universo"]["gad_municipales_con_competencia_asumida"],
             100.0 * cob / cantones_doc["universo"]["gad_municipales_con_competencia_asumida"]))

    if not args.aplicar:
        print("\nSIMULACION: no se escribio nada. Repetir con --aplicar.")
        return 0

    cantones_doc["universo"]["cobertura_actual_corpus"] = cob
    for nombre, doc in (("normas.json", normas_doc), ("cantones.json", cantones_doc)):
        with open(os.path.join(DATA, nombre), "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    print("\nEscrito en data/. Correr: python3 tools/validar.py && python3 tools/analizar.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
