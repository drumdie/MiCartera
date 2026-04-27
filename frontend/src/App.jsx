import React from 'react'

// Shell principal. En Fase 1 se conectan: Router, AuthProvider y el Dashboard.
export default function App() {
  return (
    <div style={{
      background: '#080a0d',
      color: '#dde4ed',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Mono', monospace",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: 28, fontWeight: 800, color: '#fff' }}>
          MiCartera<span style={{ color: '#00e5a0' }}> · </span>AR
        </div>
        <div style={{ fontSize: 11, color: '#4a5a6e', marginTop: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Fase 0 — Infraestructura lista
        </div>
      </div>
    </div>
  )
}
