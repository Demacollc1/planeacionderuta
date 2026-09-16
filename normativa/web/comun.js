/* Lógica compartida por las páginas: ventanas horarias y geometría.
   Fuente de datos: window.CORPUS (generado por tools/generar_web.py). */
(function (global) {
  "use strict";

  var MIN_DIA = 1440;
  var DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  var DIAS_CORTO = ["", "L", "M", "X", "J", "V", "S", "D"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function hhmm(v) {
    var p = String(v).split(":");
    return (parseInt(p[0], 10) * 60) + parseInt(p[1] || "0", 10);
  }

  function fmtMin(m) {
    m = ((m % MIN_DIA) + MIN_DIA) % MIN_DIA;
    var h = Math.floor(m / 60), x = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (x < 10 ? "0" : "") + x;
  }

  /* Intervalos PROHIBIDOS de un día, normalizando las ventanas que cruzan medianoche.
     Devuelve pares [inicio, fin) en minutos dentro del día pedido. */
  function prohibidosDia(r, dia) {
    var out = [];
    (r.ventanas_prohibidas || []).forEach(function (v) {
      var ini = hhmm(v.inicio), fin = hhmm(v.fin);
      if (fin > ini) {
        if (v.dias.indexOf(dia) >= 0) out.push([ini, fin]);
      } else {
        // cruza medianoche: cola en el día declarado, cabeza en el siguiente
        if (v.dias.indexOf(dia) >= 0) out.push([ini, MIN_DIA]);
        var previo = dia === 1 ? 7 : dia - 1;
        if (v.dias.indexOf(previo) >= 0 && fin > 0) out.push([0, fin]);
      }
    });
    return fusionar(out);
  }

  function fusionar(iv) {
    if (!iv.length) return [];
    var s = iv.slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = [s[0].slice()];
    for (var i = 1; i < s.length; i++) {
      var u = out[out.length - 1];
      if (s[i][0] <= u[1]) u[1] = Math.max(u[1], s[i][1]);
      else out.push(s[i].slice());
    }
    return out;
  }

  function permitidosDia(r, dia) {
    var pro = prohibidosDia(r, dia), out = [], cur = 0;
    pro.forEach(function (p) { if (p[0] > cur) out.push([cur, p[0]]); cur = Math.max(cur, p[1]); });
    if (cur < MIN_DIA) out.push([cur, MIN_DIA]);
    return out;
  }

  function activaEn(r, dia, minuto) {
    var pro = prohibidosDia(r, dia);
    for (var i = 0; i < pro.length; i++) if (minuto >= pro[i][0] && minuto < pro[i][1]) return true;
    return false;
  }

  function horasPermitidasSemana(r) {
    var t = 0;
    for (var d = 1; d <= 7; d++) {
      permitidosDia(r, d).forEach(function (p) { t += p[1] - p[0]; });
    }
    return t / 60;
  }

  function fmtIntervalos(iv) {
    if (!iv.length) return "sin ventana";
    if (iv.length === 1 && iv[0][0] === 0 && iv[0][1] === MIN_DIA) return "todo el día";
    return iv.map(function (p) { return fmtMin(p[0]) + "–" + fmtMin(p[1]); }).join(", ");
  }

  /* Resume las ventanas prohibidas en texto legible, agrupando días idénticos. */
  function resumenHorario(r) {
    var vs = r.ventanas_prohibidas || [];
    if (!vs.length) return "sin restricción horaria";
    var perm = horasPermitidasSemana(r);
    if (perm === 0) return "prohibido las 24 h, todos los días";
    return vs.map(function (v) {
      return v.inicio + "–" + v.fin + " (" + diasTexto(v.dias) + ")";
    }).join(" · ");
  }

  function diasTexto(dias) {
    if (!dias || !dias.length) return "—";
    if (dias.length === 7) return "L–D";
    var ord = dias.slice().sort(function (a, b) { return a - b; });
    var seguido = ord.every(function (d, i) { return i === 0 || d === ord[i - 1] + 1; });
    if (seguido && ord.length > 2) return DIAS_CORTO[ord[0]] + "–" + DIAS_CORTO[ord[ord.length - 1]];
    return ord.map(function (d) { return DIAS_CORTO[d]; }).join(" ");
  }

  /* ---------- parámetros técnicos ---------- */
  function textoPeso(r) {
    var p = r.parametros || {};
    if (p.pbv_min_t == null) return null;
    var op = p.operador_umbral === ">" ? "más de" : "desde";
    return op + " " + p.pbv_min_t + " t de PBV";
  }

  function textoMedidas(r) {
    var p = r.parametros || {}, out = [];
    if (p.largo_max_m != null) out.push("más de " + p.largo_max_m + " m de largo");
    if (p.alto_max_m != null) out.push("más de " + p.alto_max_m + " m de alto");
    if (p.ancho_max_m != null) out.push("más de " + p.ancho_max_m + " m de ancho");
    if (p.ejes_min != null) out.push("desde " + p.ejes_min + " ejes");
    return out.length ? out.join(", ") : null;
  }

  function textoAmbito(r) {
    var e = r.ambito_espacial || {};
    if (e.vias && e.vias.length) {
      return e.vias.map(function (v) {
        return v.nombre + (v.tramo && v.tramo !== "por_verificar" && v.tramo !== "íntegro"
          ? " (" + v.tramo + ")" : "");
      }).join(" · ");
    }
    return e.descripcion || "—";
  }

  function textoPermiso(r) {
    var p = r.permiso || {};
    if (p.existe === false) return { txt: "no contempla permiso", clase: "p-neutro" };
    if (p.existe !== true) return { txt: "por verificar", clase: "p-crit" };
    var costo = p.costo_usd == null ? "costo sin publicar" : "USD " + p.costo_usd.toFixed(2);
    return { txt: (p.nombre || "permiso") + " · " + costo, clase: p.costo_usd == null ? "p-warn" : "p-ok" };
  }

  /* ---------- geometría ---------- */
  function puntoEnPoligono(lat, lon, anillo) {
    var dentro = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      var xi = anillo[i][0], yi = anillo[i][1], xj = anillo[j][0], yj = anillo[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        dentro = !dentro;
      }
    }
    return dentro;
  }

  /* Distancia aproximada punto–segmento en metros (proyección equirectangular,
     suficiente por debajo de algunos kilómetros). */
  function metrosASegmento(lat, lon, a, b) {
    var R = 6371000, rad = Math.PI / 180;
    var latRef = lat * rad;
    function proy(p) { return [p[0] * rad * Math.cos(latRef) * R, p[1] * rad * R]; }
    var P = proy([lon, lat]), A = proy(a), B = proy(b);
    var vx = B[0] - A[0], vy = B[1] - A[1];
    var wx = P[0] - A[0], wy = P[1] - A[1];
    var len2 = vx * vx + vy * vy;
    var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    var dx = wx - t * vx, dy = wy - t * vy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lineasDe(geo) {
    if (!geo) return [];
    if (geo.type === "LineString") return [geo.coordinates];
    if (geo.type === "MultiLineString") return geo.coordinates;
    return [];
  }

  function anillosDe(geo) {
    if (!geo) return [];
    if (geo.type === "Polygon") return geo.coordinates;
    if (geo.type === "MultiPolygon") return geo.coordinates.map(function (p) { return p[0]; });
    return [];
  }

  /* ¿Afecta la restricción a un punto? Para zonas, punto dentro del polígono.
     Para corredores, dentro del buffer en metros (un corredor afecta a quien
     debe circular por él, no a quien está a kilómetros). */
  function afecta(r, lat, lon, bufferM) {
    var geo = (r.geometria || {}).geojson;
    if (!geo) return null;
    var anillos = anillosDe(geo);
    for (var i = 0; i < anillos.length; i++) {
      if (puntoEnPoligono(lat, lon, anillos[i])) return { modo: "zona", metros: 0 };
    }
    var lineas = lineasDe(geo), mejor = Infinity;
    lineas.forEach(function (ln) {
      for (var k = 0; k + 1 < ln.length; k++) {
        var d = metrosASegmento(lat, lon, ln[k], ln[k + 1]);
        if (d < mejor) mejor = d;
      }
    });
    if (mejor <= bufferM) return { modo: "corredor", metros: Math.round(mejor) };
    return null;
  }

  function centroide(geo) {
    var pts = [];
    anillosDe(geo).forEach(function (a) { pts = pts.concat(a); });
    lineasDe(geo).forEach(function (l) { pts = pts.concat(l); });
    if (geo && geo.type === "Point") pts.push(geo.coordinates);
    if (!pts.length) return null;
    var sx = 0, sy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sy / pts.length, sx / pts.length];
  }

  global.NT = {
    MIN_DIA: MIN_DIA, DIAS: DIAS, DIAS_CORTO: DIAS_CORTO,
    esc: esc, hhmm: hhmm, fmtMin: fmtMin,
    prohibidosDia: prohibidosDia, permitidosDia: permitidosDia, activaEn: activaEn,
    horasPermitidasSemana: horasPermitidasSemana, fmtIntervalos: fmtIntervalos,
    resumenHorario: resumenHorario, diasTexto: diasTexto,
    textoPeso: textoPeso, textoMedidas: textoMedidas, textoAmbito: textoAmbito,
    textoPermiso: textoPermiso,
    puntoEnPoligono: puntoEnPoligono, metrosASegmento: metrosASegmento,
    lineasDe: lineasDe, anillosDe: anillosDe, afecta: afecta, centroide: centroide
  };
})(window);
