'use client';
import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import maplibregl from 'maplibre-gl';

function LineChart({labels, data, label}){
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(()=>{
    if(!ref.current) return;
    chartRef.current && chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: { labels, datasets: [{ label, data }]},
      options:{ responsive:true, maintainAspectRatio:false }
    });
    return ()=> chartRef.current?.destroy();
  }, [labels.join(','), data.join(',')]);
  return <canvas ref={ref} style={{height:240}}/>;
}

function Map({lat, lon}){
  const ref = useRef(null);
  useEffect(()=>{
    if(!ref.current || lat==null || lon==null) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [lon, lat],
      zoom: 13
    });
    new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
    return ()=>map.remove();
  }, [lat, lon]);
  return <div ref={ref} style={{height:300, borderRadius:12, overflow:'hidden'}}/>;
}

export default function Dashboard(){
  const [devices,setDevices]=useState([]);
  const [deviceId,setDeviceId]=useState('');
  const [readings,setReadings]=useState([]);
  const [latest,setLatest]=useState(null);
  const [gw,setGw]=useState(null);

  useEffect(()=>{
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/devices',{credentials:'include'})
      .then(r=>r.json()).then(d=>{
        setDevices(d);
        if(d[0]) setDeviceId(d[0].device_id);
      });
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/gateway')
      .then(r=>r.json()).then(g=> setGw(g[0]||null));
  },[]);

  useEffect(()=>{
    if(!deviceId) return;
    fetch(process.env.NEXT_PUBLIC_API_URL + `/api/readings?device_id=${deviceId}&limit=200`)
      .then(r=>r.json()).then(setReadings);
    fetch(process.env.NEXT_PUBLIC_API_URL + `/api/readings/latest?device_id=${deviceId}`)
      .then(r=>r.json()).then(setLatest);

    const es = new EventSource(process.env.NEXT_PUBLIC_API_URL + `/api/stream/${deviceId}`, { withCredentials:true });
    es.onmessage = (ev)=>{
      const d = JSON.parse(ev.data);
      setLatest(d);
      setReadings(prev=> [d, ...prev].slice(0,200));
    };
    return ()=> es.close();
  }, [deviceId]);

  const labels = readings.slice().reverse().map(r=> new Date(r.ts).toLocaleString());
  const temps = readings.slice().reverse().map(r=> r.temperature_c);
  const press = readings.slice().reverse().map(r=> r.pressure_bar);

  return (<div>
    <div className="header"><h2>Dashboard</h2>
      <a className="btn" href="/login" style={{marginLeft:'auto'}}>Salir</a>
    </div>

    <div className="card row">
      <div>
        <label>Dispositivo:&nbsp;</label>
        <select className="input" value={deviceId} onChange={e=>setDeviceId(e.target.value)}>
          {devices.map(d=> <option key={d.device_id} value={d.device_id}>{d.device_id}</option>)}
        </select>
      </div>
      {latest && <div><b>Última</b><br/>
        {new Date(latest.ts).toLocaleString()}<br/>
        Temp: {latest.temperature_c?.toFixed?.(2)} °C<br/>
        Presión: {latest.pressure_bar?.toFixed?.(3)} bar<br/>
        RSSI: {latest.rssi} / SNR: {latest.snr}
      </div>}
    </div>

    <div className="row">
      <div className="card" style={{flex:'1 1 420px'}}>
        <h3>Temperatura (°C)</h3>
        <LineChart labels={labels} data={temps} label="Temp"/>
      </div>
      <div className="card" style={{flex:'1 1 420px'}}>
        <h3>Presión (bar)</h3>
        <LineChart labels={labels} data={press} label="Presión"/>
      </div>
    </div>

    <div className="card">
      <h3>Gateway</h3>
      {gw ? <Map lat={gw.lat} lon={gw.lon}/> : <p>Sin coordenadas aún.</p>}
    </div>
  </div>);
}
