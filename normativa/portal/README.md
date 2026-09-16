# Registro Cantonal de Normativa — portal de carga

Consola para capturar la normativa de tránsito **por cantón**. El portal captura;
el corpus interpreta.

**URL publicada:** https://claude.ai/artifact/ViXgj3A4dLJb1z4NzphHnp
**Fuente versionada:** `portal-normativa.html` en esta carpeta.

## Qué resuelve

Los GAD sí publican sus ordenanzas en sus portales de transparencia. Lo que no existe
es un registro **consolidado y citable**: para argumentar ante una autoridad no basta
saber que la ordenanza existe, hace falta el par número + fecha y medio de publicación,
la URL oficial y el documento archivado.

Por eso el portal se organiza alrededor de la **citabilidad**: seis campos que hacen
que una norma sea oponible en un escrito.

| # | Campo | Por qué |
|---|---|---|
| 1 | Número | Identifica la norma sin ambigüedad |
| 2 | Fecha de sanción | Fija la versión y permite rastrear reformas |
| 3 | Medio de publicación | Gaceta municipal, Registro Oficial o portal institucional |
| 4 | Fecha de publicación | Determina la vigencia |
| 5 | URL oficial del GAD | Permite a un tercero verificar en la fuente |
| 6 | PDF archivado | Los enlaces de los GAD se rompen; el archivo sobrevive |

Una norma con 6/6 es citable. Con menos, es una referencia. El portal muestra el
puntaje en cada norma y qué campo falta.

## Capacidades

- **Base compartida** — cantones y normas persisten entre sesiones y viewers.
- **Archivo de PDF** — los documentos se guardan con la norma, con id durable.
- **Exportación** — genera el JSON para fusionar en el corpus.

Es **interno de la organización**: al declarar almacenamiento de archivos, la página no
puede compartirse públicamente. Un viewer sin permiso de edición puede consultar pero no
subir PDF, y la página lo advierte en vez de fallar.

## Ciclo de trabajo

```
portal  →  Exportar corpus  →  corpus-normativa.json
        →  python3 tools/importar_portal.py corpus-normativa.json          (simulación)
        →  python3 tools/importar_portal.py corpus-normativa.json --aplicar
        →  python3 tools/validar.py && python3 tools/analizar.py
```

El importador fusiona por `id` y, si no coincide, por **cantón + número**: el portal
genera sus propios identificadores y el corpus trae los suyos, de modo que sin esa clave
secundaria la misma ordenanza entraría dos veces. Cuando fusiona por clave de negocio
conserva el id del corpus (puede estar citado en otros archivos) y guarda el del portal
en `id_portal`. Nunca sobrescribe los campos analíticos que el portal no conoce:
`disposiciones_clave`, `brecha`, `emisor`, `rango_art425`.

## Límites conocidos

- **El denominador 221** es el número de GAD con la competencia asumida. La lista
  completa de cantones y su modelo de gestión debe venir de la respuesta del Consejo
  Nacional de Competencias (`peticiones/plantilla-cnc.md`). Mientras tanto, los cantones
  se agregan a mano.
- **Los códigos DPA** que el portal sugiere al crear un cantón son un prefijo provincial
  de conveniencia y deben cotejarse contra el catálogo del INEC.
- **El portal no cubre los sustentos.** Estudio técnico del umbral, criterios del
  salvoconducto, estudio de costos de la tasa y constancia de reporte a la ANT no se
  publican en los portales de los GAD: eso va por el paquete de `peticiones/`. El portal
  y las solicitudes son complementarios, no alternativos.

## Editar el portal

Modificar `portal-normativa.html` y volver a publicar esa misma ruta para conservar la
URL. Publicar sin la URL crea un artefacto distinto.
