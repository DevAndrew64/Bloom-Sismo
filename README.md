# 🌊 Bloom-Sismo
### Buscador Offline Ultra-Ligero de Desaparecidos · Venezuela · Junio 2026

> Una PWA de un solo archivo HTML (~90 KB) que permite consultar si una persona fue reportada como **localizada** tras el terremoto — **sin internet, sin datos, en 0 ms**.

🔗 **Demo en vivo:** https://bloom-sismo.vercel.app

---

## ¿Por qué existe esto?

Tras el terremoto del 26-27 de junio de 2026, miles de familias venezolanas buscan a sus seres queridos con teléfonos de baja gama, redes 2G saturadas y saldo limitado. Los portales oficiales se caen bajo la carga. Este proyecto resuelve eso con matemática: un [Filtro de Bloom](https://es.wikipedia.org/wiki/Filtro_de_Bloom) que cabe en un mensaje de WhatsApp.

---

## ✨ Funcionalidades

| Feature | Detalle |
|---|---|
| 🔍 **Búsqueda offline** | Filtro de Bloom en Vanilla JS — 0 ms, sin red |
| 📡 **Cola offline** | Reportes guardados en IndexedDB, enviados al recuperar internet |
| 🗄️ **Supabase** | Integración REST completa — solo poner URL + anon key |
| 🔁 **QR Sync** | Comparte el filtro actualizado entre teléfonos sin datos |
| ⚡ **PWA instalable** | Service Worker Cache-First — funciona en modo avión |
| 📦 **Compartible por WhatsApp** | El HTML pesa ~90 KB — cabe en un mensaje |

---

## 🧮 La matemática

```
m = -(n · ln p) / (ln 2)²

n = 50 000 registros
p = 0.001  →  0.1% de falsos positivos

→ m ≈ 718 879 bits  ≈  89.8 KB
→ k = 10 funciones hash (FNV-1a)
```

| Resultado | Certeza |
|---|---|
| **NO localizado** | 100% garantizado — cero falsos negativos |
| **SÍ localizado** | 99.9% — verificar en la fuente indicada |

---

## 📁 Estructura del proyecto

```
Bloom-Sismo/
├── index.html                 ← PWA completa (buscar + reportar + QR)
├── sw.js                      ← Service Worker Cache-First
├── build-filter.js            ← Compilador del filtro (Node.js, 0 dependencias)
├── fetch-ong-api.js           ← Consumidor del endpoint de la ONG aliada ⬅ PENDIENTE
├── sample-data.json           ← Datos demo (20 registros de prueba)
├── datos/                     ← Carpeta de datos reales (ignorada por git)
│   ├── ong-api.json           ← Generado por fetch-ong-api.js
│   ├── venezuela-te-busca.csv ← Exportaciones manuales de aliados
│   └── *.csv / *.json         ← Cualquier fuente adicional
├── vercel.json                ← Config de despliegue Vercel
├── .nojekyll                  ← Para GitHub Pages
├── .github/
│   └── workflows/
│       └── deploy.yml         ← Auto-deploy en cada push a main
└── README.md
```

---

## 🚀 Despliegue (ya está hecho)

El proyecto se despliega automáticamente en cada `git push` via GitHub Actions → Vercel.

Para redesplegar manualmente:
```bash
git add index.html
git commit -m "filtro: actualizar YYYY-MM-DD"
git push
# Vercel redespliega en ~30 segundos
```

---

## 🔄 Flujo para actualizar el filtro con datos reales

```
                 ┌─────────────────────┐
                 │  Fuentes de datos   │
                 │  (CSV / JSON / API) │
                 └────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │   node fetch-ong-api   │  ← descarga de la ONG (cuando esté listo)
              │   (opcional)           │
              └───────────┬────────────┘
                          │ guarda en ./datos/ong-api.json
              ┌───────────▼────────────┐
              │  node build-filter.js  │  ← lee ./datos/* + sample-data.json
              └───────────┬────────────┘
                          │ inyecta en index.html
              ┌───────────▼────────────┐
              │    git push → Vercel   │  ← app actualizada en 30 s
              └────────────────────────┘
```

### Paso a paso

**1. Agregar datos de personas localizadas**

Coloca tus archivos CSV o JSON en la carpeta `./datos/`. El compilador los detecta automáticamente.

Formato CSV mínimo:
```csv
cedula,nombre,fuente,fecha
12345678,Juan Pérez,Venezuela Te Busca,2026-06-26
V-87654321,María González,Cruz Roja Venezuela,2026-06-26
```

Formato JSON:
```json
{
  "localizados": [
    { "cedula": "12345678", "nombre": "Juan Pérez", "fuente": "Venezuela Te Busca", "fecha": "2026-06-26" }
  ]
}
```

Campos alternativos que el compilador entiende:
- `cedula` → también: `ci`, `id`, `documento`, `id_documento`
- `nombre` → también: `name`, `nombre_completo`, `full_name`
- `fuente` → también: `source`, `plataforma`, `origen`
- `fecha`  → también: `date`, `fecha_localizado`, `updated_at`

El prefijo `V-` o `E-` en la cédula se elimina automáticamente.

**2. Compilar**
```bash
node build-filter.js
```

**3. Verificar y desplegar**
```bash
# Abre index.html con Live Server y busca una cédula de tus datos
# Si aparece como localizado → OK. Luego:

git add index.html
git commit -m "filtro: $(date +%Y-%m-%d)"
git push
```

---

## 🔌 Integración con la API de la ONG aliada

> ⏳ **PENDIENTE** — La ONG aliada proporcionará el endpoint REST una vez formalicen el convenio técnico.

Cuando recibas el endpoint, el proceso es:

**1. Editar `fetch-ong-api.js`** — solo estas líneas:
```javascript
const ONG_CONFIG = {
  endpoint: 'https://API-REAL-DE-LA-ONG.org/v1/localizados',  // ← URL real
  headers: {
    'Authorization': 'Bearer TU_API_KEY',  // ← si requiere auth
  },
  // adaptador(): ajustar si los campos tienen nombres distintos
};
```

**2. Ejecutar**
```bash
node fetch-ong-api.js      # descarga → ./datos/ong-api.json
node build-filter.js       # compila → index.html actualizado
git add index.html && git commit -m "filtro: ONG conectada" && git push
```

**3. Automatizar (opcional)**

Puedes agregar un cron job en GitHub Actions para que se ejecute cada hora:
```yaml
# En .github/workflows/deploy.yml, reemplazar el trigger:
on:
  schedule:
    - cron: '0 * * * *'   # cada hora
  push:
    branches: [main]
```

**Información que necesitarás de la ONG:**
- URL del endpoint
- Método HTTP (GET / POST)
- Credenciales (API key, Bearer token, o ninguna si es pública)
- Estructura de la respuesta JSON (qué campo es la cédula, cuál el nombre, etc.)
- Si hay paginación y cómo funciona

---

## 🗄️ Supabase — Recepción de reportes

Los ciudadanos pueden reportar personas desaparecidas desde la app. Los reportes llegan a Supabase.

### Configuración (ya hecha)

Las credenciales están en las primeras líneas del script en `index.html`:
```javascript
const SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

### SQL para crear la tabla (si aún no está)

```sql
create table public.reports (
  id          uuid primary key,
  nombre      text not null,
  cedula      text not null,
  descripcion text,
  contacto    text,
  estado      text default 'desaparecido',
  evento      text,
  timestamp   timestamptz not null,
  created_at  timestamptz default now()
);

alter table public.reports enable row level security;

-- Cualquier persona puede reportar (anónimamente)
create policy "insert_anon" on public.reports
  for insert with check (true);

-- Solo admins autenticados pueden leer
create policy "select_auth" on public.reports
  for select using (auth.role() = 'authenticated');
```

---

## 🛡️ Privacidad y seguridad

- **El filtro es de una sola vía** — no permite reconstruir la lista de cédulas almacenadas
- **Solo cédulas y nombres** — sin biométricos ni datos sensibles adicionales
- **UUID v4 por reporte** — garantiza idempotencia (no hay duplicados aunque se reintente)
- **RLS en Supabase** — solo los coordinadores autenticados pueden leer los reportes
- **Falsos positivos notificados** — la UI siempre pide verificar antes de actuar

---

## 📱 Compartir sin internet

```
index.html pesa ~90 KB → cabe en WhatsApp → se abre en cualquier navegador → funciona offline
```

El receptor no necesita instalarlo ni tener señal. Lo abre, introduce la cédula, obtiene respuesta en 0 ms.

---

## 🔧 Desarrollo local

```bash
# Clonar
git clone https://github.com/DevAndrew64/Bloom-Sismo.git
cd Bloom-Sismo

# Probar (requiere servidor local por el Service Worker)
npx serve .          # → http://localhost:3000
# O con VS Code: instalar "Live Server" y abrir con clic derecho en index.html

# Compilar el filtro
node build-filter.js

# Consumir API de ONG (cuando esté disponible)
node fetch-ong-api.js
```

---

## 🤝 Fuentes aliadas

- Venezuela Te Busca
- Manos por Venezuela
- Cruz Roja Venezuela
- Foro Penal Venezolano
- Provea
- *(ONG aliada — API pendiente)*

---

*Bloom-Sismo · Venezuela · Junio 2026 · MIT License*
*"Si el filtro dice NO, es NO absoluto. Si dice SÍ, ve a verificar y abraza."*
