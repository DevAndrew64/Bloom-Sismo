/**
 * ╔═════════════════════════════════════════════════════════════╗
 * ║   BLOOM-SISMO · fetch-ong-api.js                           ║
 * ║   Consumidor del endpoint público de la ONG aliada         ║
 * ║   Terremoto Venezuela · Junio 2026                         ║
 * ╚═════════════════════════════════════════════════════════════╝
 *
 * USO:
 *   node fetch-ong-api.js
 *
 * QUÉ HACE:
 *   1. Consume el endpoint REST de la ONG aliada
 *   2. Normaliza los registros al formato estándar de Bloom-Sismo
 *   3. Guarda el resultado en ./datos/ong-api.json
 *   4. Desde build-filter.js ese archivo se incluye automáticamente
 *
 * FLUJO COMPLETO PARA ACTUALIZAR EL FILTRO CON DATOS REALES:
 *   node fetch-ong-api.js   ← descarga datos de la ONG
 *   node build-filter.js    ← compila el filtro e inyecta en index.html
 *   git add index.html && git commit -m "actualizar filtro" && git push
 *
 * REQUISITOS:
 *   - Node.js 18+ (fetch nativo incluido)
 *   - Sin npm install
 */

'use strict';
const fs   = require('fs');
const path = require('path');

/* ══════════════════════════════════════════════════════════════
   ┌────────────────────────────────────────────────────────┐
   │  CONFIGURACIÓN DEL ENDPOINT DE LA ONG                  │
   │                                                        │
   │  ⚠️  PENDIENTE: La ONG aliada proporcionará estos     │
   │     datos una vez formalicen el convenio.              │
   │                                                        │
   │  Cuando los tengas, edita los valores de abajo y       │
   │  ejecuta: node fetch-ong-api.js                        │
   └────────────────────────────────────────────────────────┘
══════════════════════════════════════════════════════════════ */
const ONG_CONFIG = {
  /* URL base del endpoint — reemplazar cuando la ONG lo provea */
  endpoint: 'https://API-DE-LA-ONG.org/v1/localizados',    // ← PENDIENTE

  /* Método HTTP */
  method: 'GET',

  /* Headers necesarios para autenticación / identificación */
  headers: {
    'Accept':       'application/json',
    'Content-Type': 'application/json',
    // 'Authorization': 'Bearer TU_API_KEY_ONG',          // ← descomentar si requiere auth
    // 'X-API-Key':    'TU_API_KEY_ONG',                  // ← alternativa con header
    'User-Agent':   'Bloom-Sismo/1.0 (Venezuela Terremoto 2026)',
  },

  /* Parámetros de query opcionales */
  params: {
    // estado:    'localizado',    // ← filtrar solo localizados si la API lo soporta
    // evento:    'terremoto2026', // ← filtrar por evento si la API lo soporta
    // page_size: 10000,           // ← paginación si aplica
  },

  /*
   * ADAPTADOR DE RESPUESTA
   * ─────────────────────
   * La API de la ONG puede devolver datos en cualquier estructura.
   * Esta función recibe la respuesta cruda (objeto JS) y debe
   * devolver un array de objetos con esta forma:
   *
   *   [ { cedula, nombre, fuente, fecha }, ... ]
   *
   * Ajusta la lógica según la documentación de la ONG.
   *
   * Ejemplos de estructuras que podría devolver la ONG:
   *
   *   Caso A — array directo:
   *     [ { "cedula": "12345678", "nombre": "...", ... } ]
   *
   *   Caso B — objeto con propiedad "data":
   *     { "data": [ ... ], "total": 500, "page": 1 }
   *
   *   Caso C — objeto con propiedad "localizados":
   *     { "localizados": [ ... ] }
   *
   *   Caso D — nombres de campo distintos:
   *     { "ci": "12345678", "nombre_completo": "...", "status": "found" }
   */
  adaptador(respuesta) {
    /* ── Detectar dónde está el array de registros ── */
    let arr = respuesta;
    if (!Array.isArray(respuesta)) {
      arr = respuesta.data
         || respuesta.localizados
         || respuesta.records
         || respuesta.results
         || respuesta.personas
         || Object.values(respuesta).find(v => Array.isArray(v))
         || [];
    }

    /* ── Normalizar cada registro al formato estándar ── */
    return arr.map(r => ({
      cedula: limpiarCedula(
        r.cedula ?? r.ci ?? r.id_documento ?? r.documento ?? r.id ?? ''
      ),
      nombre: String(
        r.nombre ?? r.nombre_completo ?? r.name ?? r.full_name ?? ''
      ).trim(),
      fuente: String(
        r.fuente ?? r.source ?? r.plataforma ?? r.origen ?? 'ONG Aliada'
      ).trim(),
      fecha: String(
        r.fecha ?? r.fecha_localizado ?? r.date ?? r.updated_at ?? r.created_at ?? ''
      ).substring(0, 10), // solo YYYY-MM-DD
    })).filter(r => r.cedula.length >= 5); // descartar sin cédula válida
  },

  /*
   * PAGINACIÓN (opcional)
   * ─────────────────────
   * Si la API pagina los resultados, activa esto.
   * La función recibe la respuesta y devuelve la URL de la página siguiente
   * (o null si es la última página).
   */
  siguientePagina(respuesta) {
    return null; // ← cambiar a: return respuesta.next_url || null;
  },
};

/* ══════════════════════════════════════════════════════════════
   FUNCIONES AUXILIARES
══════════════════════════════════════════════════════════════ */
function limpiarCedula(val) {
  return String(val).trim().replace(/^[VvEe]-?/, '').replace(/\D/g, '');
}

function construirURL(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${base}?${qs}` : base;
}

/* ══════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════ */
(async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   BLOOM-SISMO · Fetcher API ONG              ║');
  console.log('║   Terremoto Venezuela · Junio 2026           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  /* Verificar si el endpoint sigue siendo el placeholder */
  if (ONG_CONFIG.endpoint.includes('API-DE-LA-ONG')) {
    console.warn('  ⚠️  PENDIENTE: El endpoint de la ONG aún no está configurado.');
    console.warn('     Edita la variable ONG_CONFIG.endpoint en este archivo');
    console.warn('     cuando la ONG te proporcione la URL del API.\n');
    console.warn('  Por ahora se usarán los datos locales (sample-data.json).\n');
    process.exit(0);
  }

  console.log(`  🌐 Endpoint: ${ONG_CONFIG.endpoint}`);

  let todosLosRegistros = [];
  let url = construirURL(ONG_CONFIG.endpoint, ONG_CONFIG.params);
  let pagina = 1;

  /* Loop de paginación */
  while (url) {
    console.log(`  📥 Descargando${pagina > 1 ? ` página ${pagina}` : ''}…`);

    try {
      const res = await fetch(url, {
        method:  ONG_CONFIG.method,
        headers: ONG_CONFIG.headers,
        signal:  AbortSignal.timeout(30000), // 30 s timeout
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data     = await res.json();
      const lote     = ONG_CONFIG.adaptador(data);
      const nextURL  = ONG_CONFIG.siguientePagina(data);

      todosLosRegistros.push(...lote);
      console.log(`     ✅ ${lote.length} registros en esta página`);

      url = nextURL;
      pagina++;

      /* Pequeña pausa entre páginas para no saturar el servidor */
      if (nextURL) await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.error(`\n  ❌ Error al consumir la API: ${e.message}`);
      console.error('     Verifica el endpoint, credenciales y conectividad.\n');
      process.exit(1);
    }
  }

  /* Deduplicar por cédula */
  const unicos = {};
  for (const r of todosLosRegistros) {
    if (!unicos[r.cedula]) unicos[r.cedula] = r;
  }
  const registros = Object.values(unicos);

  console.log(`\n  📊 Total descargado: ${todosLosRegistros.length}`);
  console.log(`  📊 Únicos (por cédula): ${registros.length}`);

  /* Guardar en ./datos/ong-api.json */
  const outputDir  = path.join(__dirname, 'datos');
  const outputPath = path.join(outputDir, 'ong-api.json');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const output = {
    _meta: {
      fuente:    ONG_CONFIG.endpoint,
      descargado: new Date().toISOString(),
      total:     registros.length,
    },
    localizados: registros,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  💾 Guardado en: ${outputPath}`);

  console.log('');
  console.log('  ✅ Listo. Ahora ejecuta:');
  console.log('     node build-filter.js');
  console.log('');
})();
