'use client';
import { useState } from 'react';

export default function Login() {
  const [user,setUser]=useState('admin');
  const [pass,setPass]=useState('admin');
  const [msg,setMsg]=useState('');

  async function onSubmit(e){
    e.preventDefault();
    const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'include',
      body: JSON.stringify({user,pass})
    });
    if(res.ok){ window.location.href='/dashboard'; }
    else setMsg('Credenciales inválidas');
  }

  return (<div>
    <div className="header"><h2>LoRaWAN Dashboard</h2></div>
    <div className="card" style={{maxWidth:400,margin:'48px auto'}}>
      <h3>Iniciar sesión</h3>
      <form onSubmit={onSubmit} style={{display:'grid',gap:8}}>
        <input className="input" value={user} onChange={e=>setUser(e.target.value)} placeholder="Usuario"/>
        <input className="input" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Contraseña" type="password"/>
        <button className="btn">Entrar</button>
      </form>
      {msg && <p style={{color:'crimson'}}>{msg}</p>}
    </div>
  </div>);
}
