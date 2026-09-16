#!/usr/bin/env python3
"""
Genera web/data.js desde data/*.json.

Se emite como asignacion a window.CORPUS en lugar de servir los JSON por fetch
para que las paginas funcionen tambien abiertas con file:// (fetch de un archivo
local lo bloquea el navegador). En GitHub Pages ambas vias funcionan; esta ademas
sirve para revisar sin servidor.
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
DST = os.path.join(BASE, "web", "data.js")

ARCHIVOS = ["normas", "restricciones", "competencias", "cantones", "rutas", "parametros"]


def main():
    corpus = {}
    for nombre in ARCHIVOS:
        with open(os.path.join(DATA, nombre + ".json"), encoding="utf-8") as fh:
            corpus[nombre] = json.load(fh)

    cuerpo = json.dumps(corpus, ensure_ascii=False, indent=1)
    with open(DST, "w", encoding="utf-8") as fh:
        fh.write("/* Generado por tools/generar_web.py — no editar a mano.\n")
        fh.write("   Fuente de verdad: normativa/data/*.json */\n")
        fh.write("window.CORPUS = " + cuerpo + ";\n")

    kb = os.path.getsize(DST) / 1024.0
    print("web/data.js  %.1f KB  |  %d normas, %d restricciones, %d cantones"
          % (kb, len(corpus["normas"]["normas"]),
             len(corpus["restricciones"]["restricciones"]),
             len(corpus["cantones"]["cantones"])))


if __name__ == "__main__":
    main()
