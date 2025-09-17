# LoRaWAN Dashboard (TTN nam1) — FastAPI + Next.js

Desde **TTN (nam1)** vía **Webhook**, con **FastAPI + PostgreSQL** y **Next.js** (UI azul/celeste),
**auth básica** y **mapa del gateway**.

## Estructura
```
/backend   -> FastAPI (webhook, API REST, SSE, downlinks, login)
/frontend  -> Next.js (UI, login, gráficos, mapa)
```

## Requisitos
- Tener una cuenta en **Railway** (o Render/Vercel) y **GitHub**.
- PostgreSQL (Railway plugin recomendado).
- **TTN Application** en **nam1**, con **Webhook** a `/api/ttn/uplink`.

## Variables de entorno
### Backend (`/backend/.env`)
```
DATABASE_URL=postgresql://user:pass@host:5432/lorawan
WEBHOOK_SECRET=pon_un_secreto_largo
ADMIN_USER=admin
ADMIN_PASS=admin

# TTN
TTN_REGION=nam1
TTN_APP_ID=tu-app-id
TTN_TENANT=ttn
TTN_API_KEY=NNSXS.XXXXXXXX
```
### Frontend (`/frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=https://tu-backend.tld  # p.ej. https://backend.up.railway.app
```

## Esquema SQL
Ejecutá en tu Postgres:
```
\i backend/schema.sql
```

## Pasos de despliegue (sin Docker)
### 1) Railway (backend + Postgres)
1. Creá proyecto → **Add Plugin → PostgreSQL**. Copiá el `DATABASE_URL`.
2. **New Service → Deploy from GitHub** (con carpeta `/backend`).
3. En **Variables** agrega:
   - `DATABASE_URL`, `WEBHOOK_SECRET`, `ADMIN_USER`, `ADMIN_PASS`
   - `TTN_REGION=nam1`, `TTN_TENANT=ttn`, `TTN_APP_ID`, `TTN_API_KEY`
4. En **Deploy** verificá la URL pública (ej. `https://backend.up.railway.app`).
5. TTN Console → Application → Webhooks → Add:
   - Base URL: `https://backend.up.railway.app/api/ttn/uplink`
   - Header: `Authorization: Bearer WEBHOOK_SECRET`
   - Event: Uplink messages

### 2) Vercel (frontend)
1. Crea proyecto nuevo → Importa desde GitHub la carpeta `/frontend`.
2. En **Environment Variables**: `NEXT_PUBLIC_API_URL=https://backend.up.railway.app`
3. Deploy. Te dará una URL (puede ser `https://app.vercel.app` o tu dominio).

### 3) Dominio + Subdominio (Freenom + Vercel)
1. Registra dominio en **Freenom** (p.ej. `misensores.tk`).
2. En Vercel → Project → **Domains** → agrega `app.misensores.tk`.
3. Vercel te indicará un **CNAME** para `app.misensores.tk`.
4. En Freenom → DNS Management → crea el **CNAME** que apunte a Vercel.
5. Listo: `https://app.misensores.tk` cargará tu landing.

## Payload Formatter (TTN)
Uplink (4 bytes: temp int16 centi-°C, presión uint16 mbar):
```js
function decodeUplink(input) {
  const b = input.bytes;
  if (!b || b.length < 4) return { errors: ["payload length < 4"] };
  let t = (b[0] << 8) | b[1]; if (t & 0x8000) t -= 0x10000;
  const temperature_c = t / 100.0;
  const pressure_mbar = (b[2] << 8) | b[3];
  const pressure_bar = pressure_mbar / 1000.0;
  return { data: { temperature_c, pressure_bar, pressure_mbar } };
}
```

## Endpoints principales
- `POST /api/ttn/uplink`  (Webhook)
- `GET  /api/devices`
- `GET  /api/readings?device_id=...&limit=...`
- `GET  /api/readings/latest?device_id=...`
- `GET  /api/stream/:device_id` (SSE tiempo real)
- `GET  /api/gateway`
- `POST /api/auth/login` (setea cookie de sesión)
- `POST /api/downlink` (envía comando a TTN)

## Local (opcional)
Backend:
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edita valores
uvicorn main:app --reload
```
Frontend:
```
cd frontend
npm i
cp .env.local.example .env.local  # edita NEXT_PUBLIC_API_URL
npm run dev
```

¡Éxitos!
