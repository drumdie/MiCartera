import { useState } from 'react'

// Estilos compartidos con Login.jsx (DM Mono, dark).
const wrap = {
  background: 'var(--bg)', minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'DM Mono', monospace", padding: 16,
}
const card = { textAlign: 'center', maxWidth: 340, width: '100%' }
const title = { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }
const sub = { fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }
const input = {
  width: '100%', boxSizing: 'border-box', padding: '13px 14px',
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
  textDecoration: 'underline', marginTop: 14,
}
const errStyle = { fontSize: 10, color: '#ff6b6b', marginTop: 12, lineHeight: 1.5 }

const MIN_LEN = 8

// ---------------------------------------------------------------------------
// Primer login: crear passphrase de cifrado + mostrar recovery code UNA vez.
// ---------------------------------------------------------------------------
export function PassphraseSetup({ onSetup, onReady }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState(null)
  const [ack, setAck] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    if (pass.length < MIN_LEN) return setError(`La passphrase debe tener al menos ${MIN_LEN} caracteres.`)
    if (pass !== confirm) return setError('Las passphrases no coinciden.')
    setBusy(true)
    try {
      const code = await onSetup(pass)
      setRecoveryCode(code)
    } catch (err) {
      setError(err.message || 'No se pudo configurar la clave.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCode) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={title}>Código de recuperación</div>
          <div style={sub}>
            Guardá este código en un lugar seguro. Es la <b>única</b> forma de recuperar tus
            datos si olvidás la passphrase. No lo volveremos a mostrar.
          </div>
          <div style={{
            ...input, fontSize: 14, letterSpacing: '.08em', textAlign: 'center',
            color: 'var(--accent)', userSelect: 'all', padding: '16px 14px', marginBottom: 16,
          }}>
            {recoveryCode}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 10, color: 'var(--muted)', textAlign: 'left', marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Guardé mi código de recuperación en un lugar seguro.</span>
          </label>
          <button style={{ ...btn, opacity: ack ? 1 : 0.5, cursor: ack ? 'pointer' : 'not-allowed' }}
                  disabled={!ack} onClick={onReady}>
            Continuar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={handleCreate}>
        <div style={title}>Protegé tus datos</div>
        <div style={sub}>
          Creá una <b>passphrase de cifrado</b>. Tus datos se cifran en tu dispositivo con
          ella; nadie más (ni nosotros) puede leerlos. Es distinta de tu contraseña de login.
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <input style={input} type="password" autoComplete="new-password" placeholder="Passphrase de cifrado"
                 value={pass} onChange={e => setPass(e.target.value)} />
          <input style={input} type="password" autoComplete="new-password" placeholder="Repetir passphrase"
                 value={confirm} onChange={e => setConfirm(e.target.value)} />
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
            {busy ? 'Generando…' : 'Crear y continuar'}
          </button>
        </div>
        {error && <div style={errStyle}>{error}</div>}
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Login siguiente: desbloquear con passphrase, o recuperar con recovery code.
// ---------------------------------------------------------------------------
export function PassphraseUnlock({ onUnlock, onRecover }) {
  const [mode, setMode] = useState('unlock')   // 'unlock' | 'recover'
  const [pass, setPass] = useState('')
  const [code, setCode] = useState('')
  const [newPass, setNewPass] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleUnlock(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onUnlock(pass)
    } catch {
      setError('Passphrase incorrecta.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRecover(e) {
    e.preventDefault()
    setError(null)
    if (newPass.length < MIN_LEN) return setError(`La nueva passphrase debe tener al menos ${MIN_LEN} caracteres.`)
    setBusy(true)
    try {
      await onRecover(code, newPass)
    } catch {
      setError('Código de recuperación incorrecto.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'recover') {
    return (
      <div style={wrap}>
        <form style={card} onSubmit={handleRecover}>
          <div style={title}>Recuperar acceso</div>
          <div style={sub}>
            Ingresá tu código de recuperación y definí una nueva passphrase de cifrado.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} placeholder="Código de recuperación"
                   value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" />
            <input style={input} type="password" autoComplete="new-password" placeholder="Nueva passphrase"
                   value={newPass} onChange={e => setNewPass(e.target.value)} />
            <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
              {busy ? 'Verificando…' : 'Recuperar'}
            </button>
          </div>
          {error && <div style={errStyle}>{error}</div>}
          <button type="button" style={linkBtn} onClick={() => { setMode('unlock'); setError(null) }}>
            Volver
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={handleUnlock}>
        <div style={title}>Desbloquear</div>
        <div style={sub}>Ingresá tu passphrase de cifrado para acceder a tus datos.</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <input style={input} type="password" autoComplete="current-password" placeholder="Passphrase de cifrado"
                 value={pass} onChange={e => setPass(e.target.value)} autoFocus />
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
            {busy ? 'Desbloqueando…' : 'Desbloquear'}
          </button>
        </div>
        {error && <div style={errStyle}>{error}</div>}
        <button type="button" style={linkBtn} onClick={() => { setMode('recover'); setError(null) }}>
          Olvidé mi passphrase
        </button>
      </form>
    </div>
  )
}
