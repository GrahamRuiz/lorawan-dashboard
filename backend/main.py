import os, json, datetime, asyncio, httpx
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, Header, HTTPException, Depends, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import asyncpg
from itsdangerous import URLSafeSerializer

DATABASE_URL = os.getenv("DATABASE_URL")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "admin")

TTN_REGION = os.getenv("TTN_REGION", "nam1")
TTN_TENANT = os.getenv("TTN_TENANT", "ttn")
TTN_APP_ID = os.getenv("TTN_APP_ID", "")
TTN_API_KEY = os.getenv("TTN_API_KEY", "")

app = FastAPI(title="LoRaWAN Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ajustar en prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

serializer = URLSafeSerializer(WEBHOOK_SECRET or "change-me", salt="session")
listeners: Dict[str, set] = {}

@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.create_pool(dsn=DATABASE_URL)

def require_session(request: Request):
    cookie = request.cookies.get("session")
    if not cookie:
        raise HTTPException(401, "No session")
    try:
        data = serializer.loads(cookie)
    except Exception:
        raise HTTPException(401, "Bad session")
    if data.get("ok") != True:
        raise HTTPException(401, "Invalid session")

@app.post("/api/auth/login")
async def login(form: Dict[str, str]):
    user = form.get("user")
    pwd  = form.get("pass")
    if user == ADMIN_USER and pwd == ADMIN_PASS:
        resp = JSONResponse({"ok": True})
        resp.set_cookie("session", serializer.dumps({"ok": True}), httponly=True, samesite="lax")
        return resp
    raise HTTPException(401, "Credenciales inválidas")

@app.post("/api/auth/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session")
    return resp

@app.post("/api/ttn/uplink")
async def ttn_uplink(req: Request, authorization: str = Header(None)):
    if authorization != f"Bearer {WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="unauthorized")
    body = await req.json()
    dev_id = body.get("end_device_ids", {}).get("device_id")
    up = body.get("uplink_message", {})
    if not dev_id or not up:
        raise HTTPException(400, "bad payload")

    fcnt = up.get("f_cnt")
    ts = up.get("received_at") or datetime.datetime.utcnow().isoformat()
    decoded = up.get("decoded_payload") or {}
    temperature_c = decoded.get("temperature_c")
    pressure_bar = decoded.get("pressure_bar")

    meta = (up.get("rx_metadata") or [])
    rssi = meta[0].get("rssi") if meta else None
    snr = meta[0].get("snr") if meta else None
    gateway_id = (meta[0].get("gateway_ids") or {}).get("gateway_id") if meta else None
    loc = meta[0].get("location") if meta else None
    gw_lat = loc.get("latitude") if loc else None
    gw_lon = loc.get("longitude") if loc else None

    async with app.state.db.acquire() as conn:
        await conn.execute("INSERT INTO devices(device_id) VALUES($1) ON CONFLICT DO NOTHING", dev_id)
        if gateway_id and (gw_lat is not None) and (gw_lon is not None):
            await conn.execute(
                "INSERT INTO gateways(gateway_id, lat, lon) VALUES($1,$2,$3) "
                "ON CONFLICT (gateway_id) DO UPDATE SET lat=EXCLUDED.lat, lon=EXCLUDED.lon, updated_at=now()",
                gateway_id, gw_lat, gw_lon
            )
        await conn.execute(
            "INSERT INTO readings(device_id, ts, f_cnt, temperature_c, pressure_bar, rssi, snr, gateway_id) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (device_id, f_cnt) DO NOTHING",
            dev_id, ts, fcnt, temperature_c, pressure_bar, rssi, snr, gateway_id
        )

    # push SSE
    if dev_id in listeners:
        payload = json.dumps({
            "device_id": dev_id, "ts": ts, "f_cnt": fcnt,
            "temperature_c": temperature_c, "pressure_bar": pressure_bar,
            "rssi": rssi, "snr": snr, "gateway_id": gateway_id
        })
        for q in list(listeners[dev_id]):
            await q.put(payload)

    return {"status": "ok"}

@app.get("/api/devices")
async def list_devices():
    async with app.state.db.acquire() as conn:
        rows = await conn.fetch("SELECT device_id FROM devices ORDER BY device_id")
    return [dict(r) for r in rows]

@app.get("/api/readings")
async def get_readings(device_id: str, limit: int = 200):
    async with app.state.db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT ts, temperature_c, pressure_bar, rssi, snr FROM readings WHERE device_id=$1 ORDER BY ts DESC LIMIT $2",
            device_id, limit
        )
    return [dict(r) for r in rows]

@app.get("/api/readings/latest")
async def latest(device_id: str):
    async with app.state.db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT ts, temperature_c, pressure_bar, rssi, snr FROM readings WHERE device_id=$1 ORDER BY ts DESC LIMIT 1",
            device_id
        )
    return dict(row) if row else None

@app.get("/api/gateway")
async def gateway():
    async with app.state.db.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM gateways LIMIT 10")
    return [dict(r) for r in rows]

@app.get("/api/stream/{device_id}")
async def stream(device_id: str):
    q: asyncio.Queue = asyncio.Queue()
    listeners.setdefault(device_id, set()).add(q)
    async def eventgen():
        try:
            while True:
                data = await q.get()
                yield f"data: {data}\n\n"
        finally:
            listeners[device_id].discard(q)
    return StreamingResponse(eventgen(), media_type="text/event-stream")

@app.post("/api/downlink")
async def downlink(payload: Dict[str, Any], request: Request):
    # require session to send downlink
    require_session(request)
    device_id = payload.get("device_id")
    frm_payload_b64 = payload.get("frm_payload_b64")  # comando ya en base64
    confirmed = bool(payload.get("confirmed", False))
    f_port = int(payload.get("f_port", 10))
    if not (device_id and frm_payload_b64):
        raise HTTPException(400, "device_id y frm_payload_b64 son requeridos")

    url = f"https://{TTN_REGION}.cloud.thethings.network/api/v3/as/applications/{TTN_APP_ID}/devices/{device_id}/down/replace"
    headers = {"Authorization": f"Bearer {TTN_API_KEY}", "Content-Type": "application/json"}
    body = {
        "downlinks": [{
            "f_port": f_port,
            "frm_payload": frm_payload_b64,
            "confirmed": confirmed,
            "priority": "NORMAL"
        }]
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, headers=headers, json=body)
        if r.status_code >= 300:
            raise HTTPException(r.status_code, f"TTN error: {r.text}")
    return {"ok": True}
