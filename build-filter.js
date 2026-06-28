/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          BLOOM-SISMO — Compilador del Filtro de Bloom        ║
 * ║          Terremoto Venezuela · Junio 2026                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * USO:
 *   node build-filter.js
 *
 * QUÉ HACE:
 *   1. Lee todos los archivos en ./datos/ (JSON y CSV) automáticamente
 *   2. Construye el Filtro de Bloom con las cédulas de personas localizadas
 *   3. Inyecta el filtro en Base64 dentro de index.html
 *   4. El HTML resultante funciona 100% offline en cualquier teléfono
 *
 * FLUJO COMPLETO CON API DE ONG:
 *   node fetch-ong-api.js   ← descarga datos de la ONG al archivo ./datos/ong-api.json
 *   node build-filter.js    ← compila e inyecta en index.html
 *   git add index.html && git commit -m "actualizar filtro" && git push
 *
 * REQUISITOS:
 *   - Node.js instalado (cualquier versión LTS)
 *   - Sin npm install — solo módulos nativos de Node
 *
 * ─────────────────────────────────────────────────────────────────
 *  ⚠️  ALGORITMO HASH: usa FNV-1a, idéntico al cliente (index.html).
 *      No cambies la implementación o el filtro dejará de funcionar.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';
const fs   = require('fs');
const path = require('path');

/* ══════════════════════════════════════════════════════════════
   AUTO-DESCUBRIMIENTO DE FUENTES
   ─────────────────────────────────────────────────────────────
   Lee automáticamente TODO lo que haya en ./datos/
   Solo necesitas poner tus archivos ahí, sin editar este script.
══════════════════════════════════════════════════════════════ */
function autodescubrirDatos() {
  const dir = path.join(__dirname, 'datos');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => /\.(json|csv)$/i.test(f))
    .map(f => ({
      archivo:     path.join(dir, f),
      descripcion: f,
    }));
}

/* ══════════════════════════════════════════════════════════════
   FUENTES MANUALES
   ─────────────────────────────────────────────────────────────
   Agrega aquí rutas absolutas o relativas si necesitas cargar
   archivos desde fuera de la carpeta ./datos/
   Ejemplo:
     { archivo: 'C:/Users/TuNombre/Downloads/lista-25jun.csv',
       descripcion: 'Exportación del 25/06' },
══════════════════════════════════════════════════════════════ */
const FUENTES_MANUALES = [
  /* ← agregar aquí si es necesario */
];

/* Base fija: siempre incluir sample-data.json como fallback */
const FUENTES_BASE = [
  { archivo: path.join(__dirname, 'sample-data.json'), descripcion: 'sample-data.json (demo)' },
];

/* ══════════════════════════════════════════════════════════════
   PARÁMETROS DEL FILTRO DE BLOOM
══════════════════════════════════════════════════════════════ */
const N = 50000;
const P = 0.001;
const M = Math.ceil(-(N * Math.log(P)) / (Math.log(2) ** 2));
const K = Math.ceil((M / N) * Math.log(2));

/* ══════════════════════════════════════════════════════════════
   FILTRO DE BLOOM — FNV-1a  (MISMO que index.html → _fnv)
══════════════════════════════════════════════════════════════ */
class BloomFilter {
  constructor(m, k) {
    this.m = m; this.k = k;
    this.bits = new Uint8Array(Math.ceil(m / 8));
    this.count = 0;
  }

  _fnv(str, seed) {
    let h = (seed ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  _positions(item) {
    const s = String(item).trim().toLowerCase();
    return Array.from({ length: this.k }, (_, i) => {
      const h1 = this._fnv(s, i * 0x9747b28c);
      const h2 = this._fnv(s, i * 0x6b432948 + 1);
      return ((h1 ^ Math.imul(h2, i + 1)) >>> 0) % this.m;
    });
  }

  add(item) {
    this._positions(item).forEach(p => { this.bits[p >>> 3] |= (1 << (p & 7)); });
    this.count++;
  }

  test(item) {
    return this._positions(item).every(p => (this.bits[p >>> 3] & (1 << (p & 7))) !== 0);
  }

  toBase64() { return Buffer.from(this.bits).toString('base64'); }
}

/* ══════════════════════════════════════════════════════════════
   CARGADOR DE ARCHIVOS (JSON y CSV)
══════════════════════════════════════════════════════════════ */
function limpiarCedula(val) {
  return String(val ?? '').trim().replace(/^[VvEe]-?/, '').replace(/\D/g, '');
}

function cargarArchivo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.json') {
    const data = JSON.parse(raw);
    let arr = Array.isArray(data) ? data
      : (data.localizados || data.records || data.data || data.results || data.personas
         || Object.values(data).find(v => Array.isArray(v)) || []);

    if (!Array.isArray(arr)) throw new Error('No se encontró un array de registros');

    return arr.map(r => ({
      cedula: limpiarCedula(r.cedula ?? r.ci ?? r.id_documento ?? r.documento ?? r.id ?? ''),
      nombre: String(r.nombre ?? r.name ?? r.nombre_completo ?? '').trim(),
      fuente: String(r.fuente ?? r.source ?? r.plataforma ?? r.origen ?? 'Desconocida').trim(),
      fecha:  String(r.fecha  ?? r.date  ?? r.fecha_localizado ?? '').substring(0, 10),
    })).filter(r => r.cedula.length >= 5);
  }

  if (ext === '.csv') {
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const sep  = lines[0].includes(';') ? ';' : ',';
    const hdrs = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z_áéíóúüñ]/gi, ''));

    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      const o = {};
      hdrs.forEach((h, i) => { o[h] = vals[i] || ''; });
      return {
        cedula: limpiarCedula(o.cedula || o.ci || o.iddocumento || o.documento || ''),
        nombre: String(o.nombre || o.name || o.nombrecompleto || '').trim(),
        fuente: String(o.fuente || o.source || o.plataforma || 'Desconocida').trim(),
        fecha:  String(o.fecha  || o.date  || '').substring(0, 10),
      };
    }).filter(r => r.cedula.length >= 5);
  }

  throw new Error(`Formato no soportado: "${ext}". Usa .json o .csv`);
}

/* ══════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════ */
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   BLOOM-SISMO · Compilador de Filtro         ║');
console.log('║   Terremoto Venezuela · Junio 2026           ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`\n  Capacidad:        ${N.toLocaleString()} registros`);
console.log(`  Falsos positivos: ${(P * 100).toFixed(1)}%`);
console.log(`  Tamaño filtro:    ~${(M / 8 / 1024).toFixed(1)} KB`);
console.log(`  Funciones hash:   k = ${K}`);

/* Unir todas las fuentes: base + auto-descubiertas + manuales */
const todasFuentes = [
  ...FUENTES_BASE,
  ...autodescubrirDatos(),
  ...FUENTES_MANUALES,
];

/* Deduplicar por ruta absoluta */
const fuentesUnicas = [...new Map(todasFuentes.map(f => [path.resolve(f.archivo), f])).values()];

console.log(`\n  Fuentes detectadas: ${fuentesUnicas.length}`);
fuentesUnicas.forEach(f => {
  const existe = fs.existsSync(f.archivo);
  console.log(`    ${existe ? '📂' : '⚠️ '} ${f.descripcion}${existe ? '' : ' (no encontrado)'}`);
});
console.log('');

const filtro     = new BloomFilter(M, K);
const sourcesMap = {};
let totalOk   = 0;
let totalSkip = 0;

for (const fuente of fuentesUnicas) {
  if (!fs.existsSync(fuente.archivo)) continue;

  process.stdout.write(`  ⏳ ${fuente.descripcion}… `);
  try {
    const records = cargarArchivo(fuente.archivo);
    let n = 0;
    for (const r of records) {
      if (!r.cedula) { totalSkip++; continue; }
      filtro.add(r.cedula);
      if (!sourcesMap[r.cedula]) sourcesMap[r.cedula] = { nombre: r.nombre, fuente: r.fuente, fecha: r.fecha };
      n++;
    }
    totalOk += n;
    console.log(`✅ ${n} registros`);
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }
}

console.log('');
console.log(`  📊 Total insertado:   ${totalOk}`);
if (totalSkip) console.log(`  ⚠️  Omitidos:          ${totalSkip} (sin cédula válida)`);
console.log(`  📊 Únicos en filtro:  ${filtro.count}`);

if (filtro.count === 0) {
  console.error('\n  ❌ ERROR: El filtro está vacío. Revisa tus archivos de datos.\n');
  process.exit(1);
}

/* Test de integridad */
const primKey = Object.keys(sourcesMap)[0];
const integOk = filtro.test(primKey);
console.log(`\n  🔍 Test integridad (${primKey}): ${integOk ? '✅ PASA' : '❌ FALLA'}`);
if (!integOk) {
  console.error('  El hash difiere entre compilador y cliente. Verifica build-filter.js vs index.html.\n');
  process.exit(1);
}

/* Exportar */
const filterB64   = filtro.toBase64();
const sourcesJSON = JSON.stringify(sourcesMap);
const version     = new Date().toISOString().split('T')[0];
const generated   = new Date().toISOString();

console.log(`\n  💾 Filtro en Base64: ${(filterB64.length / 1024).toFixed(1)} KB`);

/* Inyectar en index.html */
const htmlPath = path.join(__dirname, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('\n  ❌ index.html no encontrado.\n');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

const bloque = `// ── DATOS DEL FILTRO (AUTO-GENERADO por build-filter.js) ──
const BLOOM_M = ${M};
const BLOOM_K = ${K};
const BLOOM_DATA_B64 = "${filterB64}";
const BLOOM_SOURCES = ${sourcesJSON};
const BLOOM_META = { version:"${version}", total:${totalOk}, generated:"${generated}" };
// ── FIN DATOS FILTRO ──`;

const htmlNuevo = html.replace(
  /\/\/ ── DATOS DEL FILTRO \(AUTO-GENERADO[\s\S]*?\/\/ ── FIN DATOS FILTRO ──/,
  bloque
);

if (html === htmlNuevo) {
  console.error('\n  ❌ No se encontró el bloque marcador en index.html.');
  console.error('     El script busca el comentario exacto:');
  console.error('     // ── DATOS DEL FILTRO (AUTO-GENERADO por build-filter.js) ──\n');
  process.exit(1);
}

fs.writeFileSync(htmlPath, htmlNuevo, 'utf-8');

const htmlSize = fs.statSync(htmlPath).size;
console.log(`  📄 index.html actualizado: ${(htmlSize / 1024).toFixed(1)} KB`);

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║  ✅  ¡Compilación exitosa!                   ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('  Siguiente paso — desplegar:');
console.log('  git add index.html');
console.log('  git commit -m "filtro: actualizar ' + version + '"');
console.log('  git push');
console.log('  → Vercel redespliega en ~30 segundos');
console.log('');
