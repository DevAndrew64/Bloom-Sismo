/**
 * BLOOM-SISMO: Script Compilador del Filtro de Bloom
 * ====================================================
 * Ejecutar con: node build-filter.js
 *
 * Este script:
 * 1. Lee los datos de personas localizadas desde JSON/CSV
 * 2. Construye el Filtro de Bloom con sus cédulas
 * 3. Inyecta el filtro codificado en Base64 dentro del index.html
 *
 * Dependencias: ninguna (solo Node.js built-in modules)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Parámetros del Filtro de Bloom ───────────────────────────────────────────
const N = 50000;        // Capacidad máxima de registros
const P = 0.001;        // Probabilidad de falsos positivos (0.1%)

// Fórmula matemática para calcular tamaño óptimo del bit-array
const M = Math.ceil(-(N * Math.log(P)) / (Math.log(2) ** 2));
const K = Math.ceil((M / N) * Math.log(2)); // Número óptimo de funciones hash

console.log('═══════════════════════════════════════════════');
console.log('  BLOOM-SISMO — Compilador del Filtro          ');
console.log('═══════════════════════════════════════════════');
console.log(`  Capacidad:           ${N.toLocaleString()} registros`);
console.log(`  Falsos positivos:    ${(P * 100).toFixed(1)}%`);
console.log(`  Tamaño del array:    ${M.toLocaleString()} bits (~${(M / 8 / 1024).toFixed(1)} KB)`);
console.log(`  Funciones hash (k):  ${K}`);
console.log('═══════════════════════════════════════════════\n');

// ─── Implementación del Filtro de Bloom ───────────────────────────────────────

class BloomFilter {
  constructor(m, k) {
    this.m = m;
    this.k = k;
    this.bitArray = new Uint8Array(Math.ceil(m / 8));
    this.count = 0;
  }

  /**
   * Genera K posiciones de bit usando MurmurHash3 con diferentes semillas
   * Esto evita dependencias externas y es compatible con cualquier entorno JS
   */
  _getPositions(item) {
    const positions = [];
    const str = String(item).trim().toLowerCase();

    for (let i = 0; i < this.k; i++) {
      // Usamos SHA-256 con semilla para simular múltiples funciones hash
      const hash = crypto.createHash('sha256')
        .update(`${i}:${str}`)
        .digest('hex');
      // Tomamos los primeros 8 hex chars (32 bits) como número
      const num = parseInt(hash.substring(0, 8), 16);
      positions.push(num % this.m);
    }
    return positions;
  }

  /** Inserta un elemento en el filtro */
  add(item) {
    const positions = this._getPositions(item);
    for (const pos of positions) {
      const byteIdx = Math.floor(pos / 8);
      const bitIdx = pos % 8;
      this.bitArray[byteIdx] |= (1 << bitIdx);
    }
    this.count++;
  }

  /** Verifica si un elemento está (posiblemente) en el filtro */
  test(item) {
    const positions = this._getPositions(item);
    for (const pos of positions) {
      const byteIdx = Math.floor(pos / 8);
      const bitIdx = pos % 8;
      if (!(this.bitArray[byteIdx] & (1 << bitIdx))) {
        return false; // Definitivamente NO está (0% falsos negativos)
      }
    }
    return true; // Probablemente SÍ está (0.1% falsos positivos)
  }

  /** Exporta el filtro como Base64 para embedding en HTML */
  toBase64() {
    return Buffer.from(this.bitArray).toString('base64');
  }
}

// ─── Procesamiento de Datos ───────────────────────────────────────────────────

function loadData(filePath) {
  console.log(`📂 Cargando datos desde: ${filePath}`);
  
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.json') {
    const data = JSON.parse(raw);
    // Soporta arrays directos o el formato { localizados: [...] }
    const records = Array.isArray(data) ? data : (data.localizados || data.records || []);
    return records.map(r => ({
      cedula: String(r.cedula || r.id || '').trim(),
      nombre: r.nombre || r.name || '',
      fuente: r.fuente || r.source || 'Desconocida',
      fecha: r.fecha || r.date || ''
    }));
  }

  if (ext === '.csv') {
    const lines = raw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
      return {
        cedula: obj.cedula || obj.id || '',
        nombre: obj.nombre || obj.name || '',
        fuente: obj.fuente || obj.source || 'Desconocida',
        fecha: obj.fecha || obj.date || ''
      };
    });
  }

  throw new Error(`Formato no soportado: ${ext}. Use .json o .csv`);
}

// ─── Construcción del Filtro ──────────────────────────────────────────────────

const filter = new BloomFilter(M, K);
const sourcesMap = {}; // Mapa: cedula -> { fuente, nombre }

// Cargar datos (puedes agregar múltiples fuentes aquí)
const dataFiles = [
  './sample-data.json',
  // './venezuela-te-busca.csv',    // Agrega tus fuentes reales aquí
  // './manos-por-venezuela.json',
];

let totalInserted = 0;

for (const file of dataFiles) {
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  Archivo no encontrado, omitiendo: ${file}`);
    continue;
  }

  const records = loadData(file);
  
  for (const record of records) {
    if (!record.cedula) continue;
    
    const key = record.cedula.trim().toLowerCase();
    filter.add(key);
    sourcesMap[key] = { fuente: record.fuente, nombre: record.nombre, fecha: record.fecha };
    totalInserted++;
  }
  
  console.log(`  ✅ ${records.length} registros procesados de ${file}`);
}

console.log(`\n📊 Total insertado en el filtro: ${totalInserted} registros`);
console.log(`📦 Tamaño del filtro: ${(filter.bitArray.length / 1024).toFixed(2)} KB`);

// Verificación rápida de integridad
const testCedula = Object.keys(sourcesMap)[0];
if (testCedula) {
  const testResult = filter.test(testCedula);
  console.log(`\n🔍 Test de integridad (cédula: ${testCedula}): ${testResult ? '✅ ENCONTRADA' : '❌ ERROR'}`);
}

// ─── Exportar e Inyectar en el HTML ──────────────────────────────────────────

const filterB64 = filter.toBase64();
const sourcesJSON = JSON.stringify(sourcesMap);

console.log(`\n💾 Tamaño del filtro en Base64: ${(filterB64.length / 1024).toFixed(2)} KB`);

// Leer el HTML template
const htmlPath = './index.html';
if (!fs.existsSync(htmlPath)) {
  console.error('❌ No se encontró index.html. Genera el template primero.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

// Inyectar los datos del filtro en el script del HTML
const filterDataBlock = `
  // ── DATOS DEL FILTRO (AUTO-GENERADO por build-filter.js) ──
  const BLOOM_M = ${M};
  const BLOOM_K = ${K};
  const BLOOM_DATA_B64 = "${filterB64}";
  const BLOOM_SOURCES = ${sourcesJSON};
  const BLOOM_META = {
    version: "${new Date().toISOString().split('T')[0]}",
    total: ${totalInserted},
    generated: "${new Date().toISOString()}"
  };
  // ── FIN DATOS FILTRO ──`;

// Reemplazar el bloque de datos en el HTML
html = html.replace(
  /\/\/ ── DATOS DEL FILTRO[\s\S]*?\/\/ ── FIN DATOS FILTRO ──/,
  filterDataBlock.trim()
);

fs.writeFileSync(htmlPath, html, 'utf-8');

console.log('\n✨ index.html actualizado exitosamente con el Filtro de Bloom.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Próximos pasos:');
console.log('  1. Abre index.html en tu navegador para probar');
console.log('  2. Sube index.html + sw.js a GitHub Pages / Vercel');
console.log('  3. Comparte el enlace o el archivo .html por WhatsApp');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
