# Paquete de solicitudes de acceso a la información pública

Instrumento para cerrar la brecha de verificación del corpus (`docs/04-brechas-y-verificacion.md`).
Tono: **formal-jurídico con apercibimiento**.

## Base legal invocada

| Norma | Contenido | Verificación |
|---|---|---|
| CRE art. 18.2 | Derecho a acceder libremente a la información generada en entidades públicas | secundaria |
| CRE art. 91 | Acción de acceso a la información pública | secundaria |
| LOTAIP 2023 | Ley Orgánica de Transparencia y Acceso a la Información Pública, RO Segundo Suplemento 245, 07-feb-2023. Plazo de respuesta: **10 días, prorrogables 5** por causa justificada comunicada al solicitante | secundaria |
| LOTAIP art. 36 | Sanción por negativa ilegítima de acceso a la información | secundaria |
| Reglamento a la LOTAIP | Enero 2024 | secundaria |
| LOGJCC arts. 47–49 | Acción de acceso a la información pública. La no entrega dentro del plazo legal constituye **negativa tácita** y habilita la acción | secundaria |
| COA art. 207 | Silencio administrativo positivo a los 30 días (aplica a peticiones administrativas, no al pedido de información) | secundaria |
| LOTTTSV art. 30.4 | Deber del GAD de **informar a la ANT** sobre las regulaciones locales de tránsito que dicte | secundaria |
| COOTAD art. 566 | Las tasas se cobran por servicio efectivamente prestado y su monto se relaciona con el costo del servicio | por verificar |

> **Coteja antes de enviar.** Ninguna de estas referencias fue leída en fuente primaria
> (el corpus se construyó sin acceso de red a repositorios oficiales). En un documento con
> apercibimiento, una cita errada destruye la credibilidad del resto. Verifica como mínimo:
> número de suplemento y fecha de la LOTAIP 2023, el artículo 36, la numeración de los
> arts. 47–49 LOGJCC, y el art. 566 del COOTAD.

## Contenido

| Archivo | Destinatario | Objetivo |
|---|---|---|
| `plantilla-gad-municipal.md` | Cada GAD municipal | Ordenanzas, estudios técnicos de umbral, criterios de salvoconducto, estudio de costos de tasa, constancia de reporte a la ANT |
| `plantilla-ant.md` | Agencia Nacional de Tránsito | **El registro consolidado de regulaciones locales reportadas por los GAD** (art. 30.4 LOTTTSV) |
| `plantilla-mtop.md` | Ministerio de Transporte y Obras Públicas | Tabla nacional de pesos y dimensiones; calificación estatal/cantonal de vías urbanas críticas |
| `plantilla-cnc.md` | Consejo Nacional de Competencias | Lista vigente cantón → modelo de gestión |
| `destinatarios.csv` | — | Control de envíos, plazos y respuestas |

## Estrategia: qué hace fuerte a este paquete

Los puntos 3, 4, 5 y 6 de la plantilla municipal **no piden normas, piden los sustentos
que la norma debió tener**:

- el **estudio técnico** que justifica cada umbral de peso,
- los **criterios reglados** de otorgamiento del salvoconducto,
- el **estudio de costos** de la tasa,
- la **constancia de haber informado a la ANT** (obligación del art. 30.4 LOTTTSV).

**La ausencia de respuesta es, en sí misma, el dato.** Un consolidado de silencios y de
"no se dispone de dicha información" acredita que el umbral no tiene sustento técnico,
que la excepción no tiene criterio reglado, que la tasa no tiene estudio de costos y que
el mecanismo de coordinación con la ANT no opera. Eso es evidencia más fuerte que
cualquier análisis doctrinal, y se obtiene sin litigar.

El pedido a la ANT es el de mayor rendimiento del paquete: si la ANT responde que no
mantiene un registro consolidado de las regulaciones locales que los GAD están obligados
a informarle, ese solo documento prueba que el sistema de coordinación previsto en la ley
no existe en la práctica.

## Uso

1. Reemplaza los campos `{{ENTRE_LLAVES}}` en cada plantilla.
2. Registra el envío en `destinatarios.csv` (fecha, canal, número de trámite).
3. Corre `python3 tools/seguimiento.py` para calcular vencimientos y detectar negativas
   tácitas.
4. Cuando llegue una respuesta, incorpora los datos al corpus y sube el nivel de
   `verificacion` del registro a `primaria`.

## Antes de enviar

- Decide quién firma. El derecho de acceso a la información pública **no exige motivar el
  pedido ni acreditar interés**, así que firmar como persona natural es la vía más difícil
  de rechazar; firmar como empresa es más directo pero permite que el GAD lo trate como
  reclamo de un regulado. Los campos de solicitante están parametrizados para decidirlo al
  final.
- No menciones el propósito del pedido. No es exigible y solo abre flancos.
- Envía a todos los destinatarios en la misma semana: los plazos corren en paralelo y el
  consolidado comparativo es el producto.
