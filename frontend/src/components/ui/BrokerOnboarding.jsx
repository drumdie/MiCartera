import { useState } from 'react'

const wrap = {
  background: 'var(--bg)', minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'DM Mono', monospace", padding: 16,
}
const card = { maxWidth: 360, width: '100%' }
const title = { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6, textAlign: 'center' }
const sub = { fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18, textAlign: 'center' }
const label = { fontSize: 9, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }
const input = {
  width: '100%', boxSizing: 'border-box', padding: '11px 12px',
  background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8,
  color: 'var(--text)', fontFamily: "'DM Mono', monospace", fontSize: 12,
}
const btn = {
  width: '100%', padding: '13px 20px',
  background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, cursor: 'pointer',
  color: '#06110d', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
}
const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--muted)', fontFamily: "'DM Mono', monospace", fontSize: 10,
  textDecoration: 'underline', marginTop: 14, display: 'block', width: '100%', textAlign: 'center',
}
const errStyle = { fontSize: 10, color: '#ff6b6b', marginTop: 12, lineHeight: 1.5 }

// Las 5 credenciales del panel PPI → Gestiones → Gestión de servicio API.
// `secret: true` → input enmascarado. Las keys se guardan tal cual para que P1.5 las mapee.
const FIELDS = [
  { key: 'authorized_client', label: 'Authorized Client', secret: false },
  { key: 'client_key',        label: 'Client Key',        secret: true  },
  { key: 'api_key',           label: 'API Key',           secret: true  },
  { key: 'api_secret',        label: 'API Secret',        secret: true  },
  { key: 'account_number',    label: 'Número de cuenta',   secret: false },
]

export function BrokerOnboarding({ onSubmit, onSkip }) {
  const [vals, setVals] = useState(() => Object.fromEntries(FIELDS.map(f => [f.key, ''])))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function set(key, value) {
    setVals(v => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const missing = FIELDS.filter(f => !vals[f.key].trim())
    if (missing.length) return setError('Completá todas las credenciales o usá "Completar después".')
    setBusy(true)
    try {
      await onSubmit({ ...vals })
    } catch (err) {
      setError(err.message || 'No se pudieron guardar las credenciales.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSkip() {
    setBusy(true)
    try { await onSkip() } finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={handleSubmit}>
        <div style={title}>Conectá tu broker</div>
        <div style={sub}>
          Credenciales de tu broker (en PPI: panel → Gestiones → Gestión de servicio API). Se cifran
          en tu dispositivo con tu passphrase antes de guardarse.
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label style={label}>{f.label}</label>
              <input
                style={input}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={vals[f.key]}
                onChange={e => set(f.key, e.target.value)}
              />
            </div>
          ))}
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
        {error && <div style={errStyle}>{error}</div>}
        <button type="button" style={linkBtn} onClick={handleSkip} disabled={busy}>
          Completar después
        </button>
      </form>
    </div>
  )
}
