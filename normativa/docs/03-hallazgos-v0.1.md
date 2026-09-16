# Hallazgos cuantitativos — corpus v0.1 (corte 2026-09-16)

Todas las cifras salen de `python3 tools/analizar.py`. Son reproducibles: si cambia un
dato, cambia el número. **Ningún registro está verificado contra fuente primaria** —
ver `04-brechas-y-verificacion.md`.

## Cobertura

| Métrica | Valor |
|---|---|
| Normas catalogadas | 14 |
| Restricciones operativas modeladas | 6 |
| Cantones cubiertos | 3 de 221 GAD con competencia asumida (**1,4 %**) |
| Errores de integridad referencial | 0 |
| Registros verificados en fuente primaria | **0** |

## 1. Fragmentación medida

Sobre **3 cantones** coexisten **4 definiciones operativas distintas de "vehículo
pesado"** y **4 configuraciones distintas de ventana horaria**.

| Cantón | Umbral | Operador literal | Ventana prohibida |
|---|---|---|---|
| Quito (Simón Bolívar / Ruta Viva) | sin umbral publicado | — | 06:00–10:00 y 16:00–20:00, L–D |
| Guayaquil (puentes Samborondón/Daule) | 3,5 t | "supere" (>) | 24 h, todos los días |
| Guayaquil (Del Bombero / Arosemena) | 15 t y 10 m | "hasta" (>) | 06:00–10:00 y 17:00–20:00 |
| Cuenca (Centro Histórico) | 3,5 t | "igual o superior" (≥) | 06:00–21:00, L–D |

Dos observaciones que no son retóricas:

- **El mismo número, 3,5 t, se aplica con operadores distintos.** Guayaquil restringe al
  que *supere* 3,5 t; Cuenca al que sea *igual o superior*. Un vehículo de exactamente
  3,5 t es legal en una ciudad e ilegal en la otra. Eso no es política pública, es
  defecto de redacción.
- **El umbral nacional de 3,5 t es un umbral de *control* de pesos y dimensiones
  (AM-MTOP-028-2022), no un umbral de *prohibición*.** Los municipios lo reutilizan
  como barrera de acceso. Es un traslado de parámetro fuera de su función original.

Extrapolación lineal a 221 GAD: del orden de **294 definiciones potenciales** del mismo
concepto. Es una cota superior grosera, no una estimación; sirve para dimensionar el
problema, no para citarla como dato.

## 2. Ventana de circulación efectiva

Ventana común que le queda a un vehículo tras intersectar todas las restricciones
vinculantes en el tiempo. Jornada comercial de referencia: 08:00–18:00, L–V (50 h/semana).

| Escenario | Perfil | h/semana | % de 168 h | h en jornada comercial | % de 50 h |
|---|---|---|---|---|---|
| E1 Quito–Guayaquil–Cuenca | tráiler 32 t | 63,0 | 37,5 % | **0,0** | **0 %** |
| E2 Guayaquil→Samborondón | camión 8 t | **0,0** | **0 %** | 0,0 | 0 % |
| E3 Reparto urbano Quito | furgoneta 3 t | 130,5 | 77,7 % | 32,5 | 65 % |
| E4 Tres cantones | camión 4 t | **0,0** | **0 %** | 0,0 | 0 % |

**E1 es el resultado central.** Un tráiler que toque los tres mercados principales del
país conserva 63 h semanales de circulación legal, pero **ninguna de ellas cae dentro
del horario comercial**. Su ventana común del lunes es 00:00–06:00 y 21:00–24:00: el
sistema no prohíbe operar, obliga a operar de noche. Costo trasladado al operador:
recargos nocturnos de personal, horarios de recepción en bodega del cliente que no
coinciden, y mayor siniestralidad nocturna — el efecto contrario al objetivo declarado
de seguridad vial de las mismas ordenanzas.

**E2 y E4 no son un problema de horario sino de acceso.** La prohibición de 24 h sobre
los puentes a Samborondón y Daule para vehículos sobre 3,5 t no admite reprogramación:
ninguna hora del año es válida. E4 muestra el efecto colateral: un camión de 4 t —que la
norma nacional ni siquiera clasifica como gran carga— queda excluido por 500 kg.

Nota metodológica: una prohibición de enlace o de corredor **no** reduce la ventana
horaria del cantón, elimina un trazado. El motor separa ambos planos; mezclarlos produce
ceros falsos. Cada escenario declara explícitamente sus supuestos de trazado en
`data/rutas.json`.

## 3. Conflictos detectados: 11 hallazgos

| Regla | Tipo | Casos |
|---|---|---|
| R1 | Reserva de ley sancionadora | 1 |
| R2 | Divergencia paramétrica frente a norma nacional | 1 |
| R2b | Indeterminación del supuesto (restringe sin definir) | 2 |
| R3 | Barrera absoluta de acceso | 1 |
| R4 | Posible exceso competencial (dimensiones) | 1 |
| R5 | Discrecionalidad sin criterio publicado | 1 |
| R6 | Déficit de publicidad normativa | 4 |

Son **hipótesis jurídicas**, no conclusiones. Cada una requiere cotejo documental antes
de usarse en un escrito.

### Los tres de mayor rendimiento argumentativo

**R5 — Salvoconductos de la AMT en Quito.** Hasta el 30-dic-2025: 248 emitidos, 344
negados sobre 592 solicitudes. **Tasa de negación 58,1 %**, sin criterios de resolución
publicados. Un régimen de excepción que niega a la mayoría y no publica su criterio no
es una excepción: es una prohibición con trámite. Pedido concreto: criterios reglados,
plazo máximo y silencio administrativo positivo.

**R6 — Déficit de referencia citable, 4 de 4 normas municipales.** Ninguna de las normas
municipales del corpus tiene registrado el par número + fecha y medio de publicación que
permite citarla. Precisión necesaria: esto **no** prueba que los GAD no publiquen —
normalmente sí publican sus ordenanzas en sus portales de transparencia. Prueba que no
existe una referencia consolidada y verificable por tercero, y que el corpus se construyó
sin acceso a esos portales.
Es el hallazgo más barato de corregir y el que más rinde: un registro público único de
normativa local de tránsito elimina la categoría completa y no le cuesta competencia a
nadie. Es la primera propuesta que debe ir sobre la mesa.

**R2b — Quito restringe "carga pesada" sin publicar el umbral.** Si el supuesto de hecho
no está definido numéricamente, el alcance de la prohibición lo fija el agente en vía.
Eso es incompatible con el principio de tipicidad y, en términos operativos, hace
imposible planificar una ruta: no se puede saber de antemano si el vehículo está sujeto
a la norma.

## 4. Valores monetarios de referencia (SBU 2026 = USD 482)

Multas de pico y placa en Quito, según porcentaje del SBU:

| Evento | % SBU | USD |
|---|---|---|
| Primera infracción | 15 % | 72,30 |
| Reincidencia | 30 % | 144,60 |
| Segunda reincidencia en adelante | 50 % | 241,00 |

Pendiente de cuantificar (requiere datos internos de la operación, no normativa):
costo del desvío en km y horas por restricción de corredor, y costo del turno nocturno
forzado por E1. Esos dos números convierten el argumento jurídico en argumento económico
y son los que mueven una mesa de negociación.

## 5. Lectura de conjunto

El problema dominante **no es ilegalidad municipal, es fragmentación**. Cada ordenanza
es defendible en su territorio; el conjunto impone al operador una carga que ninguna
autoridad evaluó porque ninguna tiene competencia sobre el agregado. La consecuencia
estratégica está en `01-jerarquia-y-antinomias.md`: esto se negocia con una norma de
armonización, no se litiga cantón por cantón.

Las excepciones —donde sí hay argumento jurídico fuerte— son R1 (reserva de ley),
R4 (dimensiones, materia nacional) y R5 (discrecionalidad sin criterio).
