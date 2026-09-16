# Metodología

## Qué es este corpus

Una base de datos **legible por máquina** de la normativa de tránsito ecuatoriana —
nacional y municipal— construida para tres usos, en este orden:

1. **Interpretar**: determinar qué norma aplica a un caso y cómo se resuelve el choque.
2. **Medir**: calcular el efecto agregado de las normas sobre una operación real.
3. **Proponer**: sustentar una petición de armonización con números, no con adjetivos.

No es un repositorio de PDFs ni un resumen narrativo. Cada restricción está codificada
con sus parámetros (umbral, operador, ventanas, ámbito espacial, excepciones, sanción)
para que una consulta produzca un número, no una opinión.

## Principio de diseño: el dato manda

- `data/*.json` es la fuente de verdad. Los documentos de `docs/` que se puedan derivar
  del dato se generan (`tools/generar_matriz.py`); no se editan a mano.
- Todo registro lleva `verificacion` y `requiere_cotejo`. Un dato sin procedencia
  declarada no entra.
- Toda afirmación cuantitativa del análisis es reproducible con
  `python3 tools/analizar.py`. Si no sale de ahí, no se cita.

## Niveles de verificación

| Nivel | Significado | Uso admisible |
|---|---|---|
| `primaria` | Texto oficial leído (Registro Oficial, gaceta municipal) | Escritos, peticiones formales, litigio |
| `secundaria_oficial` | Publicación de la propia entidad (web institucional) | Análisis interno, priorización |
| `secundaria_prensa` | Prensa o comunicación pública no normativa | Solo para detectar la existencia de la norma |
| `por_verificar` | Referencia incompleta | Nada; es una tarea pendiente |

**En v0.1 no hay un solo registro en nivel `primaria`.** La sesión que construyó el
corpus no tuvo acceso de red a los repositorios oficiales (`gob.ec`, `ant.gob.ec`,
gacetas municipales). Toda la evidencia proviene de búsqueda web. La consecuencia es
explícita: **este corpus sirve hoy para priorizar y dimensionar, no para litigar.**
Convertirlo en utilizable es el objeto de `04-brechas-y-verificacion.md`.

## Modelo de datos

| Archivo | Contenido | Unidad |
|---|---|---|
| `normas.json` | Catálogo de normas con disposiciones clave | Norma |
| `restricciones.json` | Restricciones operativas parametrizadas | Restricción |
| `competencias.json` | Matriz de 14 funciones regulatorias | Función |
| `cantones.json` | Cantones, autoridad de tránsito, rango de su ordenanza | Cantón |
| `rutas.json` | Perfiles de vehículo y escenarios de prueba | Escenario |
| `parametros.json` | Constantes nacionales (SBU, umbrales técnicos) | Parámetro |

### Dos planos que no se mezclan

- **Plano temporal**: cuándo se puede circular. Se intersectan ventanas.
- **Plano de red**: por dónde se puede circular. Se eliminan trazados.

Una prohibición sobre un puente no reduce la ventana horaria de un cantón; elimina un
enlace. Confundirlos produce resultados de "0 horas disponibles" que son artefactos del
modelo, no hechos. Por eso cada restricción declara `ambito_espacial.alcance`
(`cantonal` / `zona` / `corredor` / `enlace`) y `alternativa_vial`, y cada escenario
declara qué restricciones considera vinculantes y bajo qué supuesto de trazado.

### Literalidad del umbral

Se registra el operador tal como lo redacta la norma: `>` para "supere", `>=` para
"igual o superior". No se normaliza. La divergencia entre ambas redacciones sobre el
mismo número es, en sí misma, un hallazgo.

## Reglas de detección

`tools/analizar.py` aplica siete reglas que producen **hipótesis jurídicas**, nunca
conclusiones:

| Regla | Detecta |
|---|---|
| R1 | Sanción local sin ley habilitante identificada (reserva de ley) |
| R2 | Umbral local divergente de los parámetros técnicos nacionales |
| R2b | Restricción que no define numéricamente su propio supuesto de hecho |
| R3 | Prohibición permanente sobre enlace sin alternativa vial |
| R4 | Regulación local de dimensiones vehiculares (materia nacional) |
| R5 | Excepción discrecional sin criterios de resolución publicados |
| R6 | Norma sin referencia de publicación oficial verificable |

## Cómo agregar un cantón

1. Obtener la ordenanza en fuente primaria y registrarla en `normas.json` con su
   referencia de publicación.
2. Codificar cada restricción en `restricciones.json`: umbral, operador literal,
   ventanas, alcance espacial, alternativa vial, excepciones, sanción y fuentes.
3. Registrar el cantón en `cantones.json` con su autoridad, modelo de gestión y
   `rango_ordenanza_art425` (5 si es distrito metropolitano, 7 en el resto).
4. Correr `python3 tools/analizar.py`. Si hay errores referenciales, el corpus no cierra.

## Limitación declarada

Cobertura actual: **3 de 221 GAD (1,4 %)**. v0.1 es un prototipo de método, no un censo.
La prioridad de expansión debe seguir el volumen de carga movida, no el tamaño
poblacional del cantón.
