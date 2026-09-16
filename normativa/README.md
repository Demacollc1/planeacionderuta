# Compendio normativo de tránsito — Ecuador

Base de información **legible por máquina** de la normativa de tránsito ecuatoriana
—nacional y municipal— construida para interpretar la ley, medir su efecto agregado
sobre una operación de transporte y sustentar una propuesta de armonización con números.

No es un repositorio de PDFs. Cada restricción está codificada con sus parámetros, de
modo que una consulta produce una cifra reproducible, no una opinión.

## Estado

| | |
|---|---|
| Versión | 0.1.0 (corte 2026-09-16) |
| Normas catalogadas | 14 |
| Restricciones operativas | 6 |
| Cantones | 3 de 221 GAD con competencia asumida (**1,4 %**) |
| Registros verificados en fuente primaria | **0** |

**Advertencia de uso.** Ningún registro está cotejado contra Registro Oficial ni gaceta
municipal: la sesión que construyó el corpus no tuvo acceso de red a los repositorios
oficiales y toda la evidencia proviene de búsqueda web. En este estado el corpus sirve
para **priorizar y dimensionar**, no para litigar ni para presentar formalmente. Cerrar
esa brecha es el paso 2, detallado en `docs/04-brechas-y-verificacion.md`.

## Uso

```bash
python3 tools/validar.py             # valida el corpus contra los esquemas
python3 tools/analizar.py            # informe completo en consola
python3 tools/analizar.py --csv      # exporta CSV a salidas/ (consumible por Tableau)
python3 tools/analizar.py --json     # exporta salidas/informe.json
python3 tools/generar_matriz.py      # regenera docs/02-matriz-competencias.md
```

Sin dependencias externas: Python 3.8+ de la biblioteca estándar. Si `jsonschema` está
instalado, `validar.py` lo usa; si no, aplica un validador mínimo propio.

## Estructura

```
data/          fuente de verdad (JSON)
  normas.json          catálogo de normas y disposiciones clave
  restricciones.json   restricciones operativas parametrizadas
  competencias.json    matriz de 14 funciones regulatorias
  cantones.json        cantones, autoridad de tránsito, rango art. 425
  rutas.json           perfiles de vehículo y escenarios de prueba
  parametros.json      constantes nacionales (SBU, umbrales técnicos)
schema/        esquemas JSON Schema de norma y restricción
tools/         validador, motor de análisis, generador de documentos
docs/          metodología, reglas de interpretación, hallazgos, brechas
salidas/       artefactos generados (CSV, informe.json) — no editar
```

## Documentos

| Documento | Contenido |
|---|---|
| `docs/00-metodologia.md` | Modelo de datos, niveles de verificación, cómo agregar un cantón |
| `docs/01-jerarquia-y-antinomias.md` | **Clave de interpretación**: 8 reglas ordenadas para resolver un conflicto normativo |
| `docs/02-matriz-competencias.md` | Quién puede regular qué (generado desde el dato) |
| `docs/03-hallazgos-v0.1.md` | Resultados cuantitativos |
| `docs/04-brechas-y-verificacion.md` | Plan de verificación priorizado y método para escalar a 221 GAD |

## Resultados de la versión 0.1

**Fragmentación.** Sobre 3 cantones coexisten **4 definiciones operativas distintas de
"vehículo pesado"** y 4 configuraciones de ventana horaria. El mismo número —3,5 t— se
aplica con operadores distintos: Guayaquil restringe al que *supere* 3,5 t, Cuenca al
que sea *igual o superior*. Un vehículo de exactamente 3,5 t es legal en una ciudad e
ilegal en la otra.

**Ventana efectiva.** Un tráiler de 32 t que toque Quito, Guayaquil y Cuenca conserva
63 h semanales de circulación legal (37,5 %), pero **0 de esas horas caen dentro del
horario comercial 08:00–18:00 L–V**. El sistema no prohíbe operar: obliga a operar de
noche, con recargos de personal, desajuste con los horarios de recepción del cliente y
mayor siniestralidad nocturna — el efecto contrario al objetivo de seguridad vial que
esas mismas ordenanzas declaran.

**Barrera absoluta.** La prohibición de 24 h sobre los puentes a Samborondón y Daule
para vehículos sobre 3,5 t no admite reprogramación horaria: ninguna hora del año es
válida. Alcanza incluso a un camión de 4 t, que la norma nacional no clasifica como
gran carga.

**Discrecionalidad.** Salvoconductos de la AMT en Quito hasta el 30-dic-2025: 248
emitidos, 344 negados sobre 592 solicitudes — **58,1 % de negación, sin criterios de
resolución publicados**.

**Referencia citable.** 4 de 4 normas municipales del corpus carecen del par número +
fecha y medio de publicación. Los GAD normalmente sí publican sus ordenanzas en sus
portales de transparencia: el déficit es de consolidación y de acceso, no necesariamente
de publicación. Es la brecha que ataca el portal de carga.

## Tesis de trabajo

El problema dominante **no es ilegalidad municipal: es fragmentación**. Cada ordenanza
es defendible dentro de su territorio; el conjunto impone al operador una carga que
ninguna autoridad evaluó, porque ninguna tiene competencia sobre el agregado.

Consecuencia estratégica: esto se negocia con una norma de armonización, no se litiga
cantón por cantón. Presentar el caso como una cadena de ilegalidades municipales cierra
la puerta de la negociación y, en la mayoría de los puntos, es jurídicamente débil.

Las excepciones —donde sí hay argumento jurídico fuerte— son tres: reserva de ley
sancionadora (R1), regulación local de dimensiones siendo materia nacional (R4) y
discrecionalidad sin criterio publicado (R5).

## Contribuir

El dato manda. Los documentos derivables del dato se generan; no se editan a mano.
Todo registro nuevo declara `verificacion` y `requiere_cotejo`, y registra su URL de
fuente. `python3 tools/validar.py && python3 tools/analizar.py` debe cerrar sin errores
antes de cada commit.
