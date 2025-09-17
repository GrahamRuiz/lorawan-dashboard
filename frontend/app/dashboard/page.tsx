'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import Chart from 'chart.js/auto';
import maplibregl from 'maplibre-gl';

const MAX_POINTS = 288; // tope de puntos para evitar crecimiento infinito
const fmt = (s: string)=> new Date(s).toLocaleString();

function LineChart({labels, data, label}: {labels: string[]; data: (number|null)[]; label: string}){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const chartRef = useRef<Chart|null>(null);

  useEffect(()=>{
    if(!canvasRef.current) return;

    // Destruir la instancia previa para que no se acumulen canvases
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d')!;
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label, data, tension:.25, pointRadius:1.5 }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,   // respeta la altura fija del wrapper .chart-wrap
        animation:false,             // evita “saltos” con actualizaciones SSE
        plugins:{
          legend:{labels:{color:'#e2e8f0'}},
          tooltip:{
            callbacks:{
              label:(c)=> `${c.dataset.label}: ${Number(c.parsed.y).toFixed(3)}`
            }
          }
        },
        scales:{
          x:{ticks:{color:'#94a3b8', autoSkip:true, maxRotation:0}, grid:{color:'rgba(148,163,184,.12)'}},
          y:{ticks:{color:'#94a3b8'}, grid:{color:'rgba(148,163,184,.12)'}}
        }
      }
    });

    // Ajuste defensivo
    chartRef.current.resize();

    return ()=>{ chartRef.current?.destroy(); chartRef.current = null; };
  }, [labels.join('|'), data.join('|')]); // dependencias primitivas para evitar renders infinitos

  return <div className="chart-wrap"><canvas ref={canvasRef}/></div>;
}

function Map({lat, lon}:{lat:number|null; lon:number|null}){
  const ref = useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!ref.current || lat==null || lon==null) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [lon, lat],
      zoom: 12
    });
    new maplibregl.Marker({color:'#0ea5e9'}).setLngLat([lon, lat]).addTo(map);
    return ()=>map.remove();
  }, [lat, lon]);
  return <div className="map" ref={ref}/>;
}

type Reading = {
  ts: string;
  f_cnt?: number|null;
  temperature_c?: number|null;
  pressure_bar?: number|null;
  rssi?: number|null;
  snr?: number|null;
};

export default function Dashboard(){
  const [devices,setDevices]=useState<{device_id:string}[]>([]);
  const [deviceId,setDeviceId]=useState('');
  const [readings,setReadings]=useState<Reading[]>([]);
  const [latest,setLatest]=useState<Reading|null>(null);
  const [gw,setGw]=useState<{lat:number, lon:number}|null>(null);
  const seen = useRef<Set<number>>(new Set()); // dedupe por f_cnt

  useEffect(()=>{
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/devices',{credentials:'include'})
      .then(r=>r.json()).then((d:any[])=>{
        setDevices(d);
        if(d[0]) setDeviceId(d[0].device_id);
      });
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/gateway')
      .then(r=>r.json()).then((g:any[])=> setGw(g[0]||null));
  },[]);

  useEffect(()=>{
    if(!deviceId) return;

    // reset estado y dedupe al cambiar de device
    setReadings([]);
    setLatest(null);
    seen.current = new Set();

    // histórico inicial (cap a MAX_POINTS)
    fetch(process.env.NEXT_PUBLIC_API_URL + `/api/readings?device_id=${deviceId}&limit=${MAX_POINTS}`)
      .then(r=>r.json()).then((rows:Reading[])=>{
        rows.forEach(r=>{ if(typeof r.f_cnt === 'number') seen.current.add(r.f_cnt); });
        setReadings(rows);
      });
    fetch(process.env.NEXT_PUBLIC_API_URL + `/api/readings/latest?device_id=${deviceId}`)
      .then(r=>r.json()).then(setLatest);

    // SSE para tiempo real
    const es = new EventSource(process.env.NEXT_PUBLIC_API_URL + `/api/stream/${deviceId}`, { withCredentials:true });
    es.onmessage = (ev)=>{
      const d: Reading = JSON.parse(ev.data);
      const fc = (typeof d.f_cnt === 'number') ? d.f_cnt : null;
      if(fc!=null && seen.current.has(fc)) return; // evitar duplicados
      if(fc!=null) seen.current.add(fc);

      setLatest(d);
      setReadings(prev=> [d, ...prev].slice(0, MAX_POINTS)); // cap de puntos
    };
    return ()=> es.close();
  }, [deviceId]);

  const labels = useMemo(()=> readings.slice().reverse().map(r=> fmt(r.ts)), [readings]);
  const temps  = useMemo(()=> readings.slice().reverse().map(r=> r.temperature_c ?? null), [readings]);
  const press  = useMemo(()=> readings.slice().reverse().map(r=> r.pressure_bar ?? null), [readings]);

  return (
    <div style={{display:'grid', gap:16}}>
      <div className="card">
        <div className="section-title">Dispositivo</div>
        <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between'}}>
          <select value={deviceId} onChange={e=>setDeviceId(e.target.value)} className="input">
            {devices.map(d=> <option key={d.device_id} value={d.device_id}>{d.device_id}</option>)}
          </select>
          {latest && <div className="kpi">
            <div className="legend"><span className="dot"/><span>Temp</span></div>
            <div className="value">{Number(latest.temperature_c ?? 0).toFixed(2)}°C</div>
            <div className="legend" style={{marginLeft:16}}><span className="dot" style={{background:'#22d3ee'}}/><span>Presión</span></div>
            <div className="value">{Number(latest.pressure_bar ?? 0).toFixed(3)} bar</div>
          </div>}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Temperatura (°C)</div>
        <LineChart labels={labels} data={temps} label="Temperatura"/>
      </div>

      <div className="card">
        <div className="section-title">Presión (bar)</div>
        <LineChart labels={labels} data={press} label="Presión"/>
      </div>

      <div className="card">
        <div className="section-title">Gateway</div>
        {gw ? <Map lat={gw.lat} lon={gw.lon}/> : <p style={{color:'#94a3b8'}}>Sin coordenadas aún.</p>}
      </div>
    </div>
  );
}
