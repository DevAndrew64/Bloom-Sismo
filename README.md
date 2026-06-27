# Bloom-Sismo 🌊💛
### Buscador Offline Ultra-Ligero de Desaparecidos · Venezuela

> **Una PWA de un solo archivo HTML (&lt;100 KB) que permite consultar si una persona fue reportada como localizada — sin internet, sin datos, en 0 ms.**

---

## ✨ Qué hace

| Feature | Detalle |
|---|---|
| 🔍 Búsqueda offline | Filtro de Bloom en Vanilla JS — responde en 0 ms sin red |
| 📡 Cola offline | Reportes guardados en IndexedDB, sincronizados al recuperar internet |
| 🔁 QR Sync | Comparte el filtro actualizado entre teléfonos sin gastar datos |
| ⚡ PWA | Funciona instalada como app, Service Worker Cache-First |
| 🗄️ Supabase | Integración REST lista, solo poner URL + anon key |

---

## 🧮 La matemática detrás

```
m = -(n · ln p) / (ln 2)²

n = 50 000 registros
p = 0.001 (0.1% falsos positivos)

→ m ≈ 718 879 bits ≈ 89.8 KB
→ k = 10 funciones hash
```

**Garantías:**
- Resultado **NO** → 100 % seguro (cero falsos negativos)
- Resultado **SÍ** → 99.9 % de precisión

---

## 🚀 Desplegar en 3 pasos

### Vercel (recomendado — más rápido)
```bash
# 1. Instala Vercel CLI (una sola vez)
npm i -g vercel

# 2. Desde la carpeta del proyecto
vercel

# 3. Sigue el asistente:
#    Framework: Other
#    Build Command: (vacío)
#    Output Directory: .
```

### GitHub Pages (gratuito)
```bash
# 1. Crea un repo en GitHub y sube los archivos
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU-USUARIO/bloom-sismo.git
git push -u origin main

# 2. En GitHub: Settings → Pages → Source: "GitHub Actions"
# 3. El workflow .github/workflows/deploy.yml lo despliega automáticamente
```

---

## 🔧 Conectar Supabase (2 minutos)

### Paso 1 — Crear la tabla en Supabase SQL Editor
```sql
create table public.reports (
  id          uuid primary key,
  nombre      text not null,
  cedula      text not null,
  desc        text,
  contacto    text,
  estado      text default 'desaparecido',
  timestamp   timestamptz not null,
  created_at  timestamptz default now()
);

-- Habilitar RLS
alter table public.reports enable row level security;

-- Ciudadanos pueden insertar reportes (anónimamente)
create policy "insert_anon" on public.reports
  for insert with check (true);

-- Solo admin autenticado puede leer
create policy "select_auth" on public.reports
  for select using (auth.role() = 'authenticated');
```

### Paso 2 — Editar index.html (líneas 2 y 3 del script)
```javascript
const SUPABASE_URL      = 'https://tu-proyecto.supabase.co';  // ← tu URL
const SUPABASE_ANON_KEY = 'eyJh...';                           // ← tu anon key
```

### Paso 3 — Desplegar
```bash
# Vercel
vercel --prod

# O simplemente hacer push a main (GitHub Actions lo despliega)
git add index.html && git commit -m "feat: conectar Supabase" && git push
```

---

## 🔄 Compilar el Filtro con datos reales

```bash
# Agregar fuentes en build-filter.js:
const dataFiles = [
  './sample-data.json',
  './venezuela-te-busca.csv',
  './manos-por-venezuela.json',
];

# Compilar (requiere Node.js, sin npm install)
node build-filter.js

# Resultado: index.html actualizado con el filtro incrustado
# Subir index.html + sw.js = app actualizada
```

### Formatos soportados

**JSON:**
```json
{
  "localizados": [
    { "cedula": "12345678", "nombre": "Juan Pérez", "fuente": "Venezuela Te Busca", "fecha": "2025-01-15" }
  ]
}
```

**CSV:**
```csv
cedula,nombre,fuente,fecha
12345678,Juan Pérez,Venezuela Te Busca,2025-01-15
```

---

## 📁 Estructura

```
Bloom-Sismo/
├── index.html                    ← PWA completa (buscar + reportar + QR)
├── sw.js                         ← Service Worker Cache-First
├── build-filter.js               ← Compilador del Filtro (Node.js, 0 dependencias)
├── sample-data.json              ← Datos demo para pruebas
├── vercel.json                   ← Config Vercel (headers, rutas)
├── .nojekyll                     ← Para GitHub Pages (no Jekyll)
├── .github/
│   └── workflows/
│       └── deploy.yml            ← GitHub Actions auto-deploy
└── README.md
```

---

## 🛡️ Privacidad

- Solo se almacenan cédulas y nombres (sin biométricos)
- El filtro de Bloom no permite reconstruir la lista completa (función de una sola vía)
- Los reportes se transmiten con UUID para evitar duplicados
- RLS en Supabase protege los datos de lectura no autorizada

---

## 📱 Compartir sin internet

El archivo `index.html` pesa **~70 KB** — puede enviarse directamente por WhatsApp sin necesidad de subir a ningún servidor. El receptor lo abre en el navegador y funciona offline inmediatamente.

---

*Bloom-Sismo · Hackathon Venezuela 2025 · MIT License*
*"Si dice NO, es NO absoluto. Si dice SÍ, ve a verificar y abraza."*
