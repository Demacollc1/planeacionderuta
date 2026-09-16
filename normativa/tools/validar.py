#!/usr/bin/env python3
"""
Valida data/normas.json y data/restricciones.json contra los esquemas de schema/.

Usa jsonschema si esta disponible; si no, aplica un validador minimo propio que cubre
el subconjunto del vocabulario efectivamente usado (type, enum, required, pattern,
minimum, maximum, minItems, items, properties). Sin dependencias obligatorias.

Salida: codigo 0 si el corpus valida, 1 si hay errores.
"""
from __future__ import annotations

import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TIPOS = {"string": str, "integer": int, "number": (int, float),
         "boolean": bool, "object": dict, "array": list, "null": type(None)}


def tipo_ok(valor, esperado):
    if isinstance(esperado, list):
        return any(tipo_ok(valor, t) for t in esperado)
    if esperado == "integer":
        return isinstance(valor, int) and not isinstance(valor, bool)
    if esperado == "number":
        return isinstance(valor, (int, float)) and not isinstance(valor, bool)
    if esperado == "boolean":
        return isinstance(valor, bool)
    return isinstance(valor, TIPOS[esperado])


def validar_nodo(valor, esquema, ruta, errores):
    if "type" in esquema and not tipo_ok(valor, esquema["type"]):
        errores.append("%s: se esperaba tipo %s, llego %s" % (ruta, esquema["type"], type(valor).__name__))
        return
    if "enum" in esquema and valor not in esquema["enum"]:
        errores.append("%s: valor %r fuera del enum %s" % (ruta, valor, esquema["enum"]))
    if "pattern" in esquema and isinstance(valor, str) and not re.match(esquema["pattern"], valor):
        errores.append("%s: %r no coincide con el patron %s" % (ruta, valor, esquema["pattern"]))
    if "minimum" in esquema and isinstance(valor, (int, float)) and valor < esquema["minimum"]:
        errores.append("%s: %s < minimo %s" % (ruta, valor, esquema["minimum"]))
    if "maximum" in esquema and isinstance(valor, (int, float)) and valor > esquema["maximum"]:
        errores.append("%s: %s > maximo %s" % (ruta, valor, esquema["maximum"]))
    if isinstance(valor, dict):
        for req in esquema.get("required", []):
            if req not in valor:
                errores.append("%s: falta la propiedad obligatoria '%s'" % (ruta, req))
        for k, sub in esquema.get("properties", {}).items():
            if k in valor:
                validar_nodo(valor[k], sub, "%s.%s" % (ruta, k), errores)
    if isinstance(valor, list):
        if "minItems" in esquema and len(valor) < esquema["minItems"]:
            errores.append("%s: %d elementos, minimo %d" % (ruta, len(valor), esquema["minItems"]))
        if "items" in esquema:
            for i, el in enumerate(valor):
                validar_nodo(el, esquema["items"], "%s[%d]" % (ruta, i), errores)


def con_jsonschema(datos, esquema, etiqueta, errores):
    import jsonschema  # noqa
    val = jsonschema.Draft7Validator(esquema)
    for i, item in enumerate(datos):
        for e in val.iter_errors(item):
            errores.append("%s[%d].%s: %s" % (etiqueta, i, ".".join(str(p) for p in e.path), e.message))


def main():
    pares = [("data/normas.json", "normas", "schema/norma.schema.json"),
             ("data/restricciones.json", "restricciones", "schema/restriccion.schema.json")]
    errores = []
    try:
        import jsonschema  # noqa: F401
        motor = "jsonschema"
    except ImportError:
        motor = "validador minimo interno"

    for archivo, clave, esquema_path in pares:
        with open(os.path.join(BASE, archivo), encoding="utf-8") as fh:
            datos = json.load(fh)[clave]
        with open(os.path.join(BASE, esquema_path), encoding="utf-8") as fh:
            esquema = json.load(fh)
        if motor == "jsonschema":
            con_jsonschema(datos, esquema, clave, errores)
        else:
            for i, item in enumerate(datos):
                validar_nodo(item, esquema, "%s[%d]" % (clave, i), errores)
        print("%-28s %3d registros" % (archivo, len(datos)))

    print("motor: %s" % motor)
    if errores:
        print("\n%d errores:" % len(errores))
        for e in errores:
            print("  ! " + e)
        return 1
    print("corpus valido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
