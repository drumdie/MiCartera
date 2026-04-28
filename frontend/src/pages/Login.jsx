import { useApp } from '../store/AppContext'

export default function Login() {
  const { signIn } = useApp()

  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Mono', monospace", padding: 16,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 320, width: '100%' }}>

        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
          MiCartera<span style={{ color: 'var(--accent)' }}> · </span>AR
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 40 }}>
          Seguimiento de cartera de inversiones
        </div>

        <button
          onClick={signIn}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '13px 20px',
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 10, cursor: 'pointer', transition: 'border-color .2s, background .2s',
            color: 'var(--text)', fontFamily: "'DM Mono', monospace", fontSize: 12,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0,229,160,.04)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface)' }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continuar con Google
        </button>

        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 20, lineHeight: 1.6 }}>
          Tus datos se guardan en tu cuenta personal.<br />
          No se comparten con terceros.
        </div>
      </div>
    </div>
  )
}
