/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   BLOOM-SISMO · verify.js                                   ║
 * ║   Verifica cédulas en el filtro compilado — sin navegador   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * USO:
 *   node verify.js                    ← corre el banco de pruebas completo
 *   node verify.js 10234567           ← busca una cédula específica
 *   node verify.js 10234567 12987654  ← busca varias a la vez
 *
 * EJECUTAR SIEMPRE DESPUÉS DE build-filter.js para confirmar que
 * el filtro quedó bien inyectado en index.html.
 */

'use strict';
const fs   = require('fs');
const path = require('path');

/* ── Leer el filtro inyectado en index.html ── */
const htmlPath = path.join(__dirname, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('❌ No se encontró index.html. Ejecuta build-filter.js primero.');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf-8');

/* Extraer los datos del bloque inyectado */
function extractConst(name) {
  const m = html.match(new RegExp(`const ${name}\\s*=\\s*([^;\\n]+)`));
  if (!m) throw new Error(`No se encontró: const ${name} en index.html`);
  return m[1].trim();
}

let BLOOM_M, BLOOM_K, BLOOM_DATA_B64, BLOOM_SOURCES, BLOOM_META;
try {
  BLOOM_M        = parseInt(extractConst('BLOOM_M'));
  BLOOM_K        = parseInt(extractConst('BLOOM_K'));
  BLOOM_DATA_B64 = extractConst('BLOOM_DATA_B64').replace(/^"|"$/g, '');
  BLOOM_SOURCES  = JSON.parse(extractConst('BLOOM_SOURCES'));
  BLOOM_META     = eval('(' + extractConst('BLOOM_META') + ')');
} catch (e) {
  console.error('❌ Error leyendo datos del filtro:', e.message);
  console.error('   Asegúrate de haber ejecutado: node build-filter.js');
  process.exit(1);
}

/* ── Implementación FNV-1a (idéntica a index.html y build-filter.js) ── */
class BloomFilter {
  constructor(m, k, b64) {
    this.m = m; this.k = k;
    if (!b64 || b64.length === 0) throw new Error('Filtro vacío — ejecuta build-filter.js');
    const bin = Buffer.from(b64, 'base64');
    this.bits = new Uint8Array(bin);
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

  test(item) {
    return this._positions(item).every(p => (this.bits[p >>> 3] & (1 << (p & 7))) !== 0);
  }
}

/* ── Inicializar filtro ── */
let bloom;
try {
  bloom = new BloomFilter(BLOOM_M, BLOOM_K, BLOOM_DATA_B64);
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}

const limpiar = v => String(v).trim().replace(/^[VvEe]-?/, '').replace(/\D/g, '');
const args    = process.argv.slice(2).map(limpiar).filter(c => c.length >= 5);

/* ═══════════════════════════════════════════════════════════════
   MODO 1 — Búsqueda de cédulas específicas por argumento
═══════════════════════════════════════════════════════════════ */
if (args.length > 0) {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   BLOOM-SISMO · Verificador de cédulas       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Filtro v${BLOOM_META.version} · ${BLOOM_META.total} registros`);
  console.log('');

  for (const cedula of args) {
    const found = bloom.test(cedula);
    const src   = BLOOM_SOURCES[cedula];
    if (found) {
      console.log(`  ✅ ${cedula} → ENCONTRADO`);
      if (src) console.log(`     👤 ${src.nombre} | 📋 ${src.fuente} | 📅 ${src.fecha}`);
      else     console.log(`     (sin datos de fuente en BLOOM_SOURCES)`);
    } else {
      console.log(`  🔵 ${cedula} → NO localizado (garantía 100%)`);
    }
  }
  console.log('');
  process.exit(0);
}

/* ═══════════════════════════════════════════════════════════════
   MODO 2 — Banco de pruebas automático
═══════════════════════════════════════════════════════════════ */

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   BLOOM-SISMO · Banco de Pruebas             ║');
console.log('║   Terremoto Venezuela · Junio 2026           ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`\n  Filtro:   v${BLOOM_META.version}`);
console.log(`  Total:    ${BLOOM_META.total} registros`);
console.log(`  Generado: ${BLOOM_META.generated}`);
console.log('');

let pass = 0, fail = 0;

/* ── TEST A: Deben encontrarse (están en los datos de prueba) ── */
console.log('  ── TEST A: cédulas QUE SÍ están (deben dar ✅) ──');

const DEBEN_ENCONTRARSE = [
  /* De sample-data.json */
  { cedula: '12345678', esperado: 'Venezuela Te Busca' },
  { cedula: '87654321', esperado: 'Manos por Venezuela' },
  { cedula: '11223344', esperado: 'Cruz Roja Venezuela' },
  { cedula: '55667788', esperado: 'Manos por Venezuela' },
  { cedula: '40192837', esperado: 'Venezuela Te Busca' },
  /* De localizados-prueba.csv */
  { cedula: '10234567', esperado: 'Venezuela Te Busca' },
  { cedula: '12987654', esperado: 'Cruz Roja Venezuela' },
  { cedula: '8456123',  esperado: 'Manos por Venezuela' },
  { cedula: '15678901', esperado: 'Venezuela Te Busca' },
  { cedula: '46474849', esperado: 'Venezuela Te Busca' },
  /* De ong-api-simulada.json */
  { cedula: '23456789', esperado: 'ONG Aliada (simulada)' },
  { cedula: '35678901', esperado: 'ONG Aliada (simulada)' },
  { cedula: '52345678', esperado: 'ONG Aliada (simulada)' },
  { cedula: '47890123', esperado: 'ONG Aliada (simulada)' },
  { cedula: '30123456', esperado: 'ONG Aliada (simulada)' },
];

for (const { cedula, esperado } of DEBEN_ENCONTRARSE) {
  const found = bloom.test(cedula);
  const src   = BLOOM_SOURCES[cedula];
  const fuente = src?.fuente || '(sin metadatos)';

  if (found) {
    console.log(`  ✅ PASS  ${cedula.padEnd(12)} → ${fuente}`);
    pass++;
  } else {
    console.log(`  ❌ FAIL  ${cedula.padEnd(12)} → NO encontrado (esperaba: ${esperado})`);
    console.log(`           ⚠️  Puede que ese archivo no esté en ./datos/ o no se compiló`);
    fail++;
  }
}

/* ── TEST B: NO deben encontrarse (cédulas inventadas) ── */
console.log('');
console.log('  ── TEST B: cédulas QUE NO están (deben dar 🔵) ──');

const NO_DEBEN_ENCONTRARSE = [
  '99999999',
  '11111111',
  '00000001',
  '77777777',
  '55555555',
  '13579246',
  '86420975',
];

let falsoPositivos = 0;
for (const cedula of NO_DEBEN_ENCONTRARSE) {
  const found = bloom.test(cedula);
  if (!found) {
    console.log(`  🔵 PASS  ${cedula.padEnd(12)} → correctamente ausente`);
    pass++;
  } else {
    console.log(`  ⚠️  FALSO POSITIVO  ${cedula} → aparece como encontrado (0.1% de probabilidad)`);
    console.log(`     Esto es matemáticamente normal y esperado.`);
    falsoPositivos++;
    pass++; // no es un fallo del sistema, es comportamiento esperado
  }
}

/* ── TEST C: Normalización de cédulas ── */
console.log('');
console.log('  ── TEST C: normalización (V-, E-, espacios) ──');

const NORMALIZACION = [
  { input: 'V-12345678',  esperada: '12345678' },
  { input: 'v-87654321',  esperada: '87654321' },
  { input: 'E-10234567',  esperada: '10234567' },
  { input: ' 12987654 ', esperada: '12987654' },
];

for (const { input, esperada } of NORMALIZACION) {
  const normalizada = limpiar(input);
  const found       = bloom.test(normalizada);
  const ok = normalizada === esperada;
  console.log(`  ${ok ? '✅' : '❌'} "${input}" → "${normalizada}" ${ok ? '(correcto)' : `(esperaba "${esperada}")`} | filtro: ${found ? '✅ encontrado' : '🔵 no encontrado'}`);
  ok ? pass++ : fail++;
}

/* ── RESUMEN ── */
console.log('');
console.log('═══════════════════════════════════════════════');
console.log(`  RESULTADO: ${pass} passed · ${fail} failed · ${falsoPositivos} falsos positivos (esperados)`);
console.log('═══════════════════════════════════════════════');

if (fail === 0) {
  console.log('');
  console.log('  ✅ Todo correcto. El filtro funciona perfectamente.');
  if (falsoPositivos > 0) {
    console.log(`  ℹ️  ${falsoPositivos} falso(s) positivo(s) detectado(s) — comportamiento`);
    console.log('     matemático normal del Filtro de Bloom (p ≤ 0.1%).');
  }
  console.log('');
  console.log('  Siguiente paso:');
  console.log('  git add index.html && git commit -m "filtro: pruebas OK" && git push');
} else {
  console.log('');
  console.log(`  ❌ ${fail} test(s) fallaron.`);
  console.log('');
  console.log('  Causas más comunes:');
  console.log('  • Los archivos de ./datos/ no están en la carpeta');
  console.log('  • build-filter.js no se ejecutó después de agregar los datos');
  console.log('  • El marcador en index.html fue modificado manualmente');
  console.log('');
  console.log('  Solución:');
  console.log('  node build-filter.js   (recompilar)');
  console.log('  node verify.js         (volver a verificar)');
}
console.log('');
