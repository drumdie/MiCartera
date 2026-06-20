import { useState } from 'react'
import { changePassphrase } from '../../services/userKey'
import Field from '../ui/Field'

// Sheet slide-up: desenvuelve la DEK con la passphrase actual y la re-envuelve con la nueva.
export default function ChangePassphrase({ uid, onClose, onSuccess }) {
  const [cur, setCur]   = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [err, setErr]   = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const ev = {}
    if (!cur) ev.cur = 'Ingresá tu passphrase actual'
    if (next.length < 8) ev.next = 'Mínimo 8 caracteres'
    if (next && conf !== next) ev.conf = 'No coincide con la nueva'
    if (cur && next && cur === next) ev.next = 'Tiene que ser distinta a la actual'
    setErr(ev)
    if (Object.keys(ev).length) return

    setBusy(true)
    try {
      await changePassphrase(uid, cur, next)
      onSuccess?.()
      onClose?.()
    } catch (e2) {
      // AES-GCM falla el decrypt → la passphrase actual es incorrecta
      setErr({ cur: e2?.message?.includes('caracteres') ? e2.message : 'Passphrase actual incorrecta' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-handle" />
        <div className="appbar-title" style={{ textAlign: 'left', marginBottom: 4 }}>Cambiar passphrase</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 16 }}>
          Se vuelve a envolver tu clave de cifrado bajo la nueva passphrase. El recovery code no cambia.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Passphrase actual" name="cur" type="password" value={cur} onChange={setCur} error={err.cur} autoComplete="current-password" />
          <Field label="Nueva passphrase" name="next" type="password" value={next} onChange={setNext} error={err.next} hint="Mínimo 8 caracteres" autoComplete="new-password" />
          <Field label="Repetir nueva" name="conf" type="password" value={conf} onChange={setConf} error={err.conf} autoComplete="new-password" />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
