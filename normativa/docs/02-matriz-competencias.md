# Matriz de competencias — quién puede regular qué

> Generado por `tools/generar_matriz.py` desde `data/competencias.json`. No editar a mano: editar el JSON y regenerar.

Uso: ante cualquier norma local, localizar la función en esta tabla antes de discutir jerarquía. Si el emisor no es competente, la norma es inválida, no solo desplazada (Regla 1 de `01-jerarquia-y-antinomias.md`).

| ID | Función regulatoria | Nivel | Órgano | ¿GAD puede? | Riesgo |
|---|---|---|---|---|---|
| C01 | Rectoria y politica publica nacional de transporte terrestre, transito y seguridad vial | nacional | MTOP | **NO** | bajo |
| C02 | Emision de regulacion tecnica de caracter nacional | nacional | ANT | **NO** | alto |
| C03 | Otorgamiento de titulos habilitantes de transporte comercial de ambito INTRACANTONAL | cantonal | GAD municipal o su ente de movilidad | **SI** | bajo |
| C04 | Otorgamiento de titulos habilitantes de ambito INTERCANTONAL, INTERPROVINCIAL e INTERNACIONAL | nacional | ANT | **NO** | alto |
| C05 | Matriculacion vehicular y revision tecnica vehicular | concurrente | GAD (modelos A y B) / ANT (modelo C) | **COND.** | medio |
| C06 | Control operativo de transito en la red vial urbana cantonal | cantonal | GAD con Agentes Civiles de Transito certificados por la ANT | **COND.** | medio |
| C07 | Control de transito en la red vial estatal | nacional | CTE / ANT | **NO** | alto |
| C08 | Fijacion de pesos y dimensiones maximos de vehiculos de carga en la red vial nacional | nacional | MTOP | **NO** | alto |
| C09 | Fijacion de limites de peso o dimension para el acceso a una via urbana determinada | cantonal | GAD municipal | **COND.** | alto |
| C10 | Restriccion de circulacion por horario, zona o dia en vias urbanas cantonales | cantonal | GAD municipal | **SI** | medio |
| C11 | Tipificacion de contravenciones de transito y fijacion de sus multas | nacional | Asamblea Nacional | **NO** | alto |
| C12 | Cobro de tasas por permisos, salvoconductos y autorizaciones de circulacion | cantonal | GAD municipal | **COND.** | alto |
| C13 | Definicion del modelo de gestion de la competencia de transito en el canton | cantonal | GAD municipal | **SI** | bajo |
| C14 | Regulacion de micromovilidad, repartidores y plataformas digitales | concurrente | ANT (registro y marco nacional) / GAD (circulacion local) | **COND.** | medio |

## Puntos de colisión (riesgo alto): 7 de 14 funciones

### C02 — Emision de regulacion tecnica de caracter nacional

- **Nivel competente:** nacional (ANT)
- **Base legal:** LOTTTSV art. 30.4
- **¿GAD puede?** no
- **Condición:** El GAD debe OBSERVAR las disposiciones nacionales de la ANT e informar sobre las regulaciones locales que dicte.
- **Nota:** Eje del problema. La habilitacion municipal del art. 30.4 viene con una condicion de subordinacion tecnica que en la practica no se fiscaliza.

### C04 — Otorgamiento de titulos habilitantes de ambito INTERCANTONAL, INTERPROVINCIAL e INTERNACIONAL

- **Nivel competente:** nacional (ANT)
- **Base legal:** LOTTTSV art. 30.5
- **¿GAD puede?** no
- **Nota:** Un operador con titulo habilitante nacional valido queda sometido a N regimenes cantonales de circulacion. La habilitacion nacional no garantiza acceso fisico al territorio.

### C07 — Control de transito en la red vial estatal

- **Nivel competente:** nacional (CTE / ANT)
- **Base legal:** LOTTTSV
- **¿GAD puede?** no
- **Nota:** Cuestion abierta prioritaria: la calificacion de una via como estatal o cantonal define quien puede restringirla. Corredores como la Av. Simon Bolivar cumplen funcion de by-pass de la red estatal dentro de territorio cantonal.

### C08 — Fijacion de pesos y dimensiones maximos de vehiculos de carga en la red vial nacional

- **Nivel competente:** nacional (MTOP)
- **Base legal:** AM-MTOP-018-2016; AM-MTOP-028-2022
- **¿GAD puede?** no
- **Nota:** Parametros nacionales: umbral de control 3.5 t, PBV maximo 48 t, tope de tabla 60 t con Certificado de Operacion Especial.

### C09 — Fijacion de limites de peso o dimension para el acceso a una via urbana determinada

- **Nivel competente:** cantonal (GAD municipal)
- **Base legal:** COOTAD art. 55.f; LOTTTSV art. 30.4
- **¿GAD puede?** condicionado
- **Condición:** Solo con sustento tecnico de capacidad estructural del pavimento o del puente, o de geometria vial. Sin estudio tecnico publicado, el limite es una barrera de acceso, no una norma de seguridad.
- **Nota:** Zona gris central. Aqui se concentra la divergencia parametrica observada (15 t en Guayaquil frente a 3.5 t y 48 t nacionales).

### C11 — Tipificacion de contravenciones de transito y fijacion de sus multas

- **Nivel competente:** nacional (Asamblea Nacional)
- **Base legal:** CRE art. 76.3; LOTTTSV; COIP
- **¿GAD puede?** no
- **Nota:** Reserva de ley sancionadora. Precedente: la Corte Constitucional declaro inconstitucional el art. 18 de la ordenanza provincial de El Oro que creaba una multa del 25% del salario basico para toda infraccion a la ordenanza (cotejar cita antes de usar).

### C12 — Cobro de tasas por permisos, salvoconductos y autorizaciones de circulacion

- **Nivel competente:** cantonal (GAD municipal)
- **Base legal:** COOTAD art. 566
- **¿GAD puede?** condicionado
- **Condición:** Solo por servicio efectivamente prestado y con monto relacionado al costo del servicio. Requiere ordenanza y estudio de costos.

## Funciones condicionadas: 5

Son las que se negocian. En todas, el GAD tiene competencia pero sujeta a un requisito que rara vez se documenta (sustento técnico, estudio de costos, modelo de gestión, piso nacional). Exigir el cumplimiento del requisito es más eficaz que disputar la competencia.

- **C05 Matriculacion vehicular y revision tecnica vehicular** — Segun el modelo de gestion asignado por el CNC.
- **C06 Control operativo de transito en la red vial urbana cantonal** — Requiere agentes civiles de transito formados y certificados por la ANT.
- **C09 Fijacion de limites de peso o dimension para el acceso a una via urbana determinada** — Solo con sustento tecnico de capacidad estructural del pavimento o del puente, o de geometria vial. Sin estudio tecnico publicado, el limite es una barrera de acceso, no una norma de seguridad.
- **C12 Cobro de tasas por permisos, salvoconductos y autorizaciones de circulacion** — Solo por servicio efectivamente prestado y con monto relacionado al costo del servicio. Requiere ordenanza y estudio de costos.
- **C14 Regulacion de micromovilidad, repartidores y plataformas digitales** — El marco nacional de 2025 fija piso comun; el GAD regula circulacion e infraestructura local.
