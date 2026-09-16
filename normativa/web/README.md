# Páginas web

Sitio estático servido por GitHub Pages. Sin backend, sin build, sin dependencias de npm.

| Página | Qué hace |
|---|---|
| `index.html` | Portada con los indicadores del corpus |
| `cantones.html` | Normativa por cantón en tres categorías, con filtro por perfil de vehículo y exportación CSV |
| `mapa.html` | Zonas y corredores sobre mapa real, reloj de restricciones y cruce contra clientes |
| `estilo.css` · `comun.js` | Hoja de estilos y lógica compartida (ventanas horarias, geometría) |
| `data.js` | **Generado.** `python3 tools/generar_web.py` tras cada cambio en `data/` |
| `clientes-ejemplo.csv` | Datos de ejemplo para probar el cruce. No son clientes reales |

## Las tres categorías

1. **Restricciones de circulación** — pesos, medidas, vías y zonas, horarios, días, horas
   permitidas por semana, permiso con su costo, requisitos y nivel de verificación.
2. **Restricciones de parqueo, carga y descarga** — misma estructura. Una restricción puede
   estar en dos categorías: la de Av. Del Bombero y Arosemena regula circulación y además
   carga y descarga en la misma ventana.
3. **Otras restricciones** — placa, ambientales, sectoriales. Columnas propias: regla,
   exentos y sanción, esta última convertida a dólares con el SBU vigente.

Cuando una categoría aparece vacía, la página dice **«sin registros en el corpus»**, no
«sin restricciones». La diferencia importa: es una brecha de captura, no una afirmación
sobre el cantón.

## El mapa

- **Basemap real** de OpenStreetMap vía Leaflet.
- **Reloj**: día de la semana más hora. Lo prohibido en ese momento se dibuja sólido; lo
  permitido, punteado y tenue. El popup de cada restricción da la ventana permitida de ese
  día y las horas semanales.
- **Clientes**: se arrastra un CSV. Columnas reconocidas: `nombre`, `lat`, `lon` — o una
  sola `coordenadas` con «lat, lon», que es lo que entrega Google Maps al copiar—, más
  `ciudad`, `direccion` y `grupo` opcionales.
- **Agrupación**: por estado (prohibido ahora / alcanzado / libre), por restricción y por
  el grupo que traiga el archivo.
- **Dibujo**: trazar corredores y zonas sobre el mapa y obtener el GeoJSON para corregir
  `data/restricciones.json`.

### Privacidad de los datos de clientes

**El CSV no sale del navegador.** No se sube a ningún servidor ni se commitea. El repositorio
es público, así que esto no es una preferencia sino un requisito. La casilla «Recordar en
este navegador» usa `localStorage`: los datos quedan en ese equipo y ese navegador, nunca
en el repositorio, y se borran con «Quitar».

### Dos límites que hay que leer siempre

**La geometría es aproximada.** Ningún trazo viene de cartografía oficial ni del tramo
literal de la ordenanza. Sirve para ubicar la restricción y para corregirla encima del
basemap. No sirve para decidir una ruta ni para citar en un escrito.

**El cruce es por ubicación, no por ruta.** Un cliente puede salir «sin restricción» y ser
inalcanzable igual, porque la prohibición está en el camino y no en el destino: es el caso
de Samborondón y Daule, donde el veto de 24 h sobre los puentes impide llegar aunque el
punto esté despejado. Por eso el panel nombra aparte los enlaces vetados sin alternativa
vial. Resolverlo de verdad exige un motor de ruteo, no un cruce espacial.

## Publicación

GitHub Pages ya está activo en el repositorio y sirve desde la rama por defecto. Estas
páginas quedan disponibles al fusionar la rama de trabajo en `main`:

```
https://demacollc1.github.io/planeacionderuta/normativa/web/
```

Abiertas con `file://` también funcionan, porque los datos llegan por `data.js` y no por
`fetch`. El mapa necesita conexión para los tiles.
