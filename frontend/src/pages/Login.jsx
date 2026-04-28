// Placeholder — se implementa en Fase 2 con Firebase Authentication (Google Sign-In)
export default function Login() {
  return (
    <div style={{
      background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Mono', monospace",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
          MiCartera<span style={{ color: 'var(--accent)' }}> · </span>AR
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 24, letterSpacing: '.12em', textTransform: 'uppercase' }}>
          Login — Fase 2
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted2)' }}>
          Autenticación con Firebase pendiente de implementación.
        </div>
      </div>
    </div>
  )
}
