# Brechas y plan de verificación

Estado: **0 de 14 normas verificadas en fuente primaria.** Esto no es un detalle de
forma. Un compendio que se presenta a un ministerio o a un concejo municipal con
referencias de prensa pierde en el primer contraargumento. Cerrar esta brecha es el
trabajo previo a cualquier presentación.

## Por qué está abierta

La sesión que construyó el corpus operó con egreso de red restringido: los repositorios
oficiales (`gob.ec`, `ant.gob.ec`, `amt.gob.ec`, gacetas municipales, Lexis) no eran
alcanzables. Toda la evidencia proviene de resultados de búsqueda. Las URL de fuente
primaria sí quedaron registradas en `normas.json` y `restricciones.json`.

## Cola de verificación, por rendimiento

### P1 — Reglamento General de la LOTTTSV
Define si una flota propia de distribución es "transporte por cuenta propia" y qué
autorización requiere. **Determina el costo regulatorio base de toda la operación.**
Estado en corpus: `por_verificar`, sin número ni Registro Oficial.

### P2 — Ordenanza Metropolitana 147 de Quito
Obtener el **umbral numérico de "carga pesada"**. Sin él, el hallazgo R2b queda como
hipótesis y no se puede saber qué vehículos de la flota están sujetos a la restricción.
Fuente: `www7.quito.gob.ec/mdmq_ordenanzas/ordenanzas/ORDENANZAS AÑOS ANTERIORES/ORDM-147 - TRANSPORTE DE CARGA - PRODUCTOS QUIMICOS.pdf`

### P3 — Resolución de la AMT que implementa la restricción vigente desde 2026-01-01
Número, fecha, y sobre todo **los criterios de otorgamiento del salvoconducto**. Es el
sustento de R5, el hallazgo de mayor rendimiento. Si los criterios no existen por
escrito, ese hecho negativo es el argumento.
Fuente: `www.amt.gob.ec/index.php/informacion/carga-pesada/restriccion-circulacion/`

### P4 — Ordenanza de Circulación del Cantón Guayaquil
Número, fecha, articulado. Confirmar el umbral de 15 t / 10 m y el régimen de 24 h sobre
los puentes, y si existe estudio técnico de capacidad estructural que los sustente.
Fuente: `www.gob.ec/sites/default/files/regulations/2021-06/ORDENANZA DE CIRCULACION DEL CANTON GUAYAQUIL.pdf`

### P5 — Ordenanza SERT de Cuenca
Confirmar el artículo que define vehículo pesado (≥ 3,5 t) y la ventana 21:00–06:00.
Fuente: `www.emov.gob.ec/sites/default/files/transparencia/a2.23.pdf`

### P6 — Resolución 0003-CNC-2015: lista cantón → modelo de gestión
Es el **campo llave** que explica por qué la misma infracción se controla distinto en
cantones vecinos. Sin esta tabla, `cantones.json` no puede escalar a 221 registros.
Publicación citada: RO Suplemento 475, 08-abr-2015.

### P7 — Tabla Nacional de Pesos y Dimensiones (AM-MTOP-018-2016, 032-2020, 028-2022)
Verificar los tres valores que el corpus usa como referencia nacional: 3,5 t / 48 t / 60 t,
y obtener la tabla por configuración de ejes. Es la base de contraste de R2 y R4.

### P8 — LOTTTSV: texto consolidado y reforma de 2025
Cotejar la numeración de los arts. 30.4 y 30.5, que sostienen toda la Regla 1 y la
Regla 3 de interpretación. La reforma se publicó en RO 73, Tercer Suplemento,
03-jul-2025.

### P9 — COOTAD arts. 55.f, 130 y 566
El art. 566 (tasas) está en el corpus como `por_verificar` y sostiene el argumento sobre
cobros por salvoconducto. Confirmar numeración vigente.

### P10 — Sentencia de la Corte Constitucional, ordenanza de El Oro
Obtener número de caso y de sentencia del fallo que declaró inconstitucional el art. 18
de la ordenanza que creaba una multa del 25 % del salario básico. Es el **precedente
central de R1**. Hoy está citado sin número: en esa condición no se puede usar.

## Método para escalar a los 221 GAD

La verificación caso por caso no escala. La vía es la **solicitud formal de acceso a la
información pública** dirigida a cada GAD, con un pedido idéntico y estructurado:

1. Ordenanzas vigentes que regulen circulación, carga y descarga, y restricción de
   acceso por peso o dimensión, con número, fecha y publicación.
2. Resoluciones de la autoridad de tránsito que las implementen.
3. Estudio técnico que sustente cada umbral de peso o dimensión.
4. Criterios y plazos de otorgamiento de permisos o salvoconductos, y estadística de
   solicitudes presentadas, aceptadas y negadas del último año.
5. Ordenanza que fije la tasa y su estudio de costos.

Los puntos 3, 4 y 5 son los decisivos. **La ausencia de respuesta es, en sí misma, el
dato**: acredita que el umbral no tiene sustento técnico, que la excepción no tiene
criterio reglado y que la tasa no tiene estudio de costos. Un consolidado de silencios
administrativos es evidencia más fuerte que cualquier análisis doctrinal.

## Brechas de datos, no de normas

Dos cifras faltan y no salen de ninguna norma: el **costo del desvío** (km y horas
adicionales por restricción de corredor) y el **costo del turno nocturno forzado** por
la ventana E1. Salen de la operación propia. Son los números que convierten un
argumento jurídico en un argumento económico, y son los que mueven una mesa de
negociación.
