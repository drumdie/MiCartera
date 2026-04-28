import { useApp } from '../../store/AppContext'

export default function LockScreen({ onUnlock, isReauthing, reAuthError }) {
  const { user } = useApp()

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      gap: 20,
    }}>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--accent)',
        letterSpacing: '.15em',
      }}>
        MiCartera
      </div>

      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: '2px solid var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.4,
        fontSize: 20,
      }}>
        🔒
      </div>

      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
        color: 'var(--muted)',
        letterSpacing: '.06em',
        textAlign: 'center',
      }}>
        Sesión bloqueada por inactividad
      </div>

      {user?.email && (
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: 'var(--muted)',
          opacity: 0.5,
        }}>
          {user.email}
        </div>
      )}

      {reAuthError && (
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          color: 'var(--danger, #e05c5c)',
          textAlign: 'center',
          maxWidth: 280,
          padding: '8px 16px',
          background: 'rgba(224,92,92,0.08)',
          borderRadius: 6,
        }}>
          {reAuthError}
        </div>
      )}

      <button
        onClick={onUnlock}
        disabled={isReauthing}
        style={{
          marginTop: 8,
          padding: '10px 32px',
          background: isReauthing ? 'transparent' : 'var(--accent)',
          color: isReauthing ? 'var(--muted)' : '#000',
          border: isReauthing ? '1px solid var(--muted)' : 'none',
          borderRadius: 6,
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.1em',
          cursor: isReauthing ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {isReauthing ? 'Verificando…' : 'Desbloquear con Google'}
      </button>

      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        color: 'var(--muted)',
        opacity: 0.35,
        textAlign: 'center',
        maxWidth: 260,
        lineHeight: 1.6,
      }}>
        Se requiere reautenticación para acceder a información sensible
      </div>
    </div>
  )
}
