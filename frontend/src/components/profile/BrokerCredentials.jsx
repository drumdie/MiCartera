import { useState } from 'react'
import { saveBrokerCreds } from '../../services/profileService'
import Field from '../ui/Field'

// Las 5 credenciales del panel PPI → Gestiones → Gestión de servicio API.
const FIELDS = [
  { key: 'authorized_client', label: 'Authorized Client', secret: false },
  { key: 'client_key',        label: 'Client Key',        secret: true  },
  { key: 'api_key',           label: 'API Key',           secret: true, hint: 'Copiala completa — suele terminar en "="' },
  { key: 'api_secret',        label: 'API Secret',        secret: true  },
  { key: 'account_number',    label: 'Número de cuenta',  secret: false },
]

// Sheet slide-up: WRITE-ONLY (SEC-1 · F3). NO carga ni muestra las credenciales actuales — el
// front ya no las descifra nunca (se eliminó loadBrokerCreds). Solo permite RE-INGRESAR las 5
// (en blanco), que se guardan cifradas con la DEK. Pendiente F4: re-verificación por mail antes
// de poder editar.
export default function BrokerCredentials({ uid, onClose, onSaved }) {
  const [vals, setVals]     = useState(() => Object.fromEntries(FIELDS.map(f => [f.key, ''])))
  const [err, setErr]       = useState(null)
  const [busy, setBusy]     = useState(false)

  const set = (key, value) => setVals(v => ({ ...v, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    const missing = FIELDS.filter(f => !String(vals[f.key] ?? '').trim())
    if (missing.length) { setErr('Completá las 5 credenciales.'); return }
    setBusy(true)
    try {
      // No recortamos ni transformamos los valores: se guardan tal cual (incluido el "="
      // final de la ApiKey, que es padding base64 válido y PPI lo exige).
      await saveBrokerCreds(uid, { ...vals })
      onSaved?.()
      onClose?.()
    } catch (e2) {
      setErr(e2?.message || 'No se pudieron guardar las credenciales.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-handle" />
        <div className="appbar-title" style={{ textAlign: 'left', marginBottom: 4 }}>Credenciales del broker</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 16 }}>
          PPI → Gestiones → Gestión de servicio API. Por seguridad, las credenciales guardadas
          NO se muestran: re-ingresá las 5 para reemplazarlas. Se cifran con tu passphrase (DEK).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FIELDS.map(f => (
            <Field
              key={f.key}
              label={f.label}
              name={f.key}
              type={f.secret ? 'password' : 'text'}
              value={vals[f.key]}
              onChange={(val) => set(f.key, val)}
              hint={f.hint}
              autoComplete="off"
            />
          ))}
        </div>

        {err && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 12 }}>{err}</div>}

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
