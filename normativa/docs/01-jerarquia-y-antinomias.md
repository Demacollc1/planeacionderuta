# Clave de interpretación: cómo resolver un conflicto normativo de tránsito

Orden de aplicación. No es opcional: aplicar jerarquía antes que competencia produce
conclusiones erróneas en la mayoría de casos ecuatorianos.

## Regla 0 — Separar tránsito de transporte

| Concepto | Qué es | Quién decide |
|---|---|---|
| **Tránsito** | Circulación física en la vía: horarios, sentidos, pesos de acceso, estacionamiento | GAD municipal en su territorio (CRE 264.6, COOTAD 55.f) |
| **Transporte** | Prestación del servicio: título habilitante, cupo, tarifa, modalidad | Según ámbito: intracantonal = GAD; intercantonal o superior = ANT (LOTTTSV 30.5) |

Consecuencia operativa: **un municipio puede decidir cuándo y por dónde circula un
vehículo; no puede decidir si el operador puede prestar un servicio de alcance
nacional.** Casi toda ordenanza cuestionable se ubica en el borde de esta línea.

## Regla 1 — Competencia antes que jerarquía

Ante un choque norma nacional / ordenanza, primero se pregunta si el emisor tenía
competencia sobre la materia. Si no la tenía, la norma es **inválida**, no simplemente
desplazada. Solo si ambos emisores son competentes se pasa a la Regla 2.

Base: CRE 260, 264.6; COOTAD 55.f, 130; LOTTTSV 30.4, 30.5.
Instrumento: `data/competencias.json` (matriz de 14 funciones con el nivel competente).

## Regla 2 — Jerarquía (CRE art. 425)

1. Constitución · 2. Tratados · 3. Leyes orgánicas · 4. Leyes ordinarias ·
5. Normas regionales y **ordenanzas distritales** · 6. Decretos y reglamentos ·
7. **Ordenanzas** · 8. Acuerdos y resoluciones · 9. Demás actos.

Asimetría que casi nunca se aplica bien: **una ordenanza metropolitana de Quito
(rango 5) se ubica por encima de un reglamento del Ejecutivo (rango 6); la ordenanza
de cualquier otro cantón (rango 7), por debajo.** Un mismo argumento de jerarquía
gana en Guayaquil y pierde en Quito. Por eso `cantones.json` registra
`rango_ordenanza_art425` por cantón.

Nota crítica: una resolución de la ANT o un acuerdo del MTOP están en el rango 8, por
debajo de cualquier ordenanza. Su fuerza **no viene de la jerarquía sino de la
atribución de competencia** — vía Regla 1 y Regla 3. Invocar jerarquía para defender
una resolución de la ANT frente a una ordenanza es un argumento perdedor.

## Regla 3 — Subordinación técnica del art. 30.4 LOTTTSV

La LOTTTSV habilita al GAD a regular tránsito **"observando las disposiciones de
carácter nacional"** de la ANT, con deber de informar las regulaciones locales que
dicte. La habilitación viene con condición incorporada: una ordenanza que contradice
un parámetro técnico nacional incumple el mismo artículo que la habilita.

Aplicación: umbrales de peso y dimensión. Los parámetros nacionales son 3,5 t (umbral
de control), 48 t (PBV máximo) y 60 t (tope de tabla con Certificado de Operación
Especial). Un umbral local distinto exige justificación técnica de capacidad
estructural de la vía; sin ella, es una barrera de acceso disfrazada de norma de
seguridad.

## Regla 4 — Reserva de ley sancionadora (CRE art. 76.3)

Aquí no hay antinomia que resolver: la ordenanza **no puede** tipificar
contravenciones de tránsito ni fijar sus multas. Es materia de ley (LOTTTSV, COIP).
Precedente a cotejar antes de citar: la Corte Constitucional declaró inconstitucional
el art. 18 de la ordenanza de la provincia de El Oro que creaba una multa del 25 % del
salario básico para toda infracción a la ordenanza.

Distinguir: el GAD **sí** puede cobrar **tasas** por servicios administrativos
efectivamente prestados, con monto ligado al costo del servicio (COOTAD 566). Tasa sin
contraprestación medible ni estudio de costos = impuesto encubierto.

## Regla 5 — Especialidad y temporalidad

Solo entre normas del **mismo rango y mismo emisor**. Norma posterior deroga anterior;
norma especial desplaza a la general. Usar estos criterios entre niveles de gobierno
distintos es un error de método frecuente.

## Regla 6 — Proporcionalidad

Una restricción permanente (168 h/semana) sobre un enlace sin alternativa vial no es
gestión de tráfico: es supresión de accesibilidad. Exige test de idoneidad, necesidad y
proporcionalidad en sentido estricto, y prueba de que no existe medida menos lesiva
(ventana horaria, corredor alternativo, límite por eje en lugar de por PBV).

## Regla 7 — Publicidad

Una norma que el obligado no puede localizar ni citar no es exigible en la práctica.
En el corpus v0.1, **4 de 4 normas municipales carecen de referencia de publicación
oficial verificable**. Es el hallazgo más fácil de corregir y el de mayor rendimiento:
un registro público único de normativa local de tránsito elimina esta categoría entera.

## Diferencia entre antinomia y fragmentación

- **Antinomia**: dos normas válidas dictan soluciones incompatibles para el mismo caso.
  Se resuelve con las reglas anteriores.
- **Fragmentación**: cada norma es válida y coherente en su territorio, pero el conjunto
  impone al operador una carga que ninguna autoridad evaluó, porque ninguna tiene
  competencia sobre el agregado.

**El problema ecuatoriano de tránsito es mayoritariamente de fragmentación, no de
antinomia.** Esto importa para la estrategia: la fragmentación no se litiga, se negocia
con una norma de armonización. Presentar el caso como una cadena de ilegalidades
municipales cierra la puerta de la negociación y además es, en la mayoría de puntos,
jurídicamente débil.
