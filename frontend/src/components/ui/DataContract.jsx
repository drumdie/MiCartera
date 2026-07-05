import { useState } from 'react'

const wrap = {
  background: 'var(--bg)', minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'DM Mono', monospace", padding: 16,
}
const card = { maxWidth: 420, width: '100%' }
const title = { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 14, textAlign: 'center' }
const panel = {
  background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10,
  padding: '16px 16px', fontSize: 11, color: 'var(--text)', lineHeight: 1.7,
  maxHeight: '46vh', overflowY: 'auto', marginBottom: 16,
}
const h = { color: '#fff', fontWeight: 700, display: 'block', marginTop: 12, marginBottom: 2 }
const btn = {
  width: '100%', padding: '13px 20px',
  background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, cursor: 'pointer',
  color: '#06110d', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
}

// Contrato de uso de datos (P1.4). El texto es la fuente de verdad del consentimiento;
// si cambia materialmente, subir CONTRACT_VERSION en profileService para forzar re-consent.
export function DataContract({ onAccept }) {
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleAccept() {
    setBusy(true)
    try { await onAccept() } finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={title}>Cómo se usan tus datos</div>
        <div style={panel}>
          <span style={h}>Qué guardamos</span>
          Tus posiciones y cartera, los contratos de inversión que definas, y las credenciales
          de tu broker que cargues.

          <span style={h}>Cómo se protege</span>
          Tus datos se cifran <b>en tu dispositivo</b> con tu passphrase, antes de subirse.
          Ni nosotros, ni Google/Firebase, ni nadie con acceso a la base de datos puede leerlos:
          solo viajan y se almacenan como texto cifrado.

          <span style={h}>El rol del backend</span>
          Nuestro servidor actúa únicamente como <b>intermediario</b> con tu broker: usa tus
          credenciales para traer tus datos de mercado y posiciones. No almacena tus
          credenciales en claro ni las comparte con terceros.

          <span style={h}>Tu responsabilidad</span>
          La passphrase y el código de recuperación son tuyos y no los conocemos. Si perdés
          <b> ambos</b>, los datos cifrados no se pueden recuperar (tu cartera se puede volver
          a sincronizar desde tu broker, pero lo que escribas vos —tesis, contratos— se pierde).

          <span style={h}>Terceros</span>
          No vendemos ni compartimos tus datos con terceros.
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 10, color: 'var(--muted)', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Entiendo y autorizo este uso de mis datos.</span>
        </label>
        <button style={{ ...btn, opacity: ack && !busy ? 1 : 0.5, cursor: ack && !busy ? 'pointer' : 'not-allowed' }}
                disabled={!ack || busy} onClick={handleAccept}>
          {busy ? 'Guardando…' : 'Aceptar y continuar'}
        </button>
      </div>
    </div>
  )
}
