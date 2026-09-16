#!/usr/bin/env python3
"""Genera docs/02-matriz-competencias.md desde data/competencias.json.

El dato es la fuente de verdad; el documento es una vista. No editar el .md a mano.
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "data", "competencias.json")
DST = os.path.join(BASE, "docs", "02-matriz-competencias.md")

ICONO = {"si": "SI", "no": "NO", "condicionado": "COND."}
RIESGO = {"alto": "alto", "medio": "medio", "bajo": "bajo"}


def main():
    with open(SRC, encoding="utf-8") as fh:
        d = json.load(fh)

    L = []
    L.append("# Matriz de competencias — quién puede regular qué\n")
    L.append("> Generado por `tools/generar_matriz.py` desde `data/competencias.json`. "
             "No editar a mano: editar el JSON y regenerar.\n")
    L.append("Uso: ante cualquier norma local, localizar la función en esta tabla antes "
             "de discutir jerarquía. Si el emisor no es competente, la norma es inválida, "
             "no solo desplazada (Regla 1 de `01-jerarquia-y-antinomias.md`).\n")
    L.append("| ID | Función regulatoria | Nivel | Órgano | ¿GAD puede? | Riesgo |")
    L.append("|---|---|---|---|---|---|")
    for c in d["competencias"]:
        L.append("| %s | %s | %s | %s | **%s** | %s |" % (
            c["id"], c["funcion"], c["nivel_competente"], c["organo"],
            ICONO[c["gad_puede"]], RIESGO[c["riesgo_conflicto"]]))

    altos = [c for c in d["competencias"] if c["riesgo_conflicto"] == "alto"]
    L.append("\n## Puntos de colisión (riesgo alto): %d de %d funciones\n"
             % (len(altos), len(d["competencias"])))
    for c in altos:
        L.append("### %s — %s\n" % (c["id"], c["funcion"]))
        L.append("- **Nivel competente:** %s (%s)" % (c["nivel_competente"], c["organo"]))
        L.append("- **Base legal:** %s" % "; ".join(c["base_legal"]))
        L.append("- **¿GAD puede?** %s" % c["gad_puede"])
        if c.get("condicion"):
            L.append("- **Condición:** %s" % c["condicion"])
        if c.get("nota"):
            L.append("- **Nota:** %s" % c["nota"])
        L.append("")

    cond = [c for c in d["competencias"] if c["gad_puede"] == "condicionado"]
    L.append("## Funciones condicionadas: %d\n" % len(cond))
    L.append("Son las que se negocian. En todas, el GAD tiene competencia pero sujeta a un "
             "requisito que rara vez se documenta (sustento técnico, estudio de costos, "
             "modelo de gestión, piso nacional). Exigir el cumplimiento del requisito es "
             "más eficaz que disputar la competencia.\n")
    for c in cond:
        L.append("- **%s %s** — %s" % (c["id"], c["funcion"], c.get("condicion", "")))

    with open(DST, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print("generado %s (%d competencias, %d de riesgo alto)"
          % (os.path.relpath(DST, BASE), len(d["competencias"]), len(altos)))


if __name__ == "__main__":
    main()
