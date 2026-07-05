import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useApp } from '../store/AppContext'
import { useContratos } from '../hooks/useContratos'
import { useBiometric } from '../hooks/useBiometric'
import { contratoCompleto } from '../data/contratoConfig'
import ScreenHeader from '../components/layout/ScreenHeader'
import Switch from '../components/ui/Switch'
import Toast from '../components/ui/Toast'
import ChangePassphrase from '../components/profile/ChangePassphrase'
import BrokerCredentials from '../components/profile/BrokerCredentials'

function initials(name) {
  if (!name) return 'MC'
  const clean = name.split('@')[0].trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase()
}

export default function Perfil() {
  const navigate = useNavigate()
  const { user, signOut, syncPPI, syncing, isDemo, portfolio } = useApp()
  const { contratos } = useContratos(user?.uid, portfolio)
  const { enabled: bioEnabled, setBiometricEnabled, available: bioAvailable } = useBiometric()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [brokerOpen, setBrokerOpen] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const displayName = isDemo ? 'Usuario Demo' : (user?.displayName ?? user?.email ?? 'Usuario')
  const email = isDemo ? 'modo demo · datos de ejemplo' : (user?.email ?? '')

  // Avance del Perfil de Inversión: contratos completos sobre tickers en cartera
  const tickers = ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci']
    .flatMap(k => (portfolio?.[k]?.posiciones ?? []).map(p => p.ticker).filter(Boolean))
  const totalTickers = tickers.length
  const completos = tickers.filter(t => contratoCompleto(contratos?.[t])).length
  const pctCompleto = totalTickers > 0 ? Math.round((completos / totalTickers) * 100) : 0

  const handleBio = async (next) => {
    if (!bioAvailable) {
      showToast('No disponible en este dispositivo')
      return
    }
    await setBiometricEnabled(next)
    showToast(next ? 'Huella activada' : 'Huella desactivada')
  }

  const handleSync = async () => {
    try { await syncPPI(); showToast('✓ Sincronizado con el broker') }
    catch { showToast('No se pudo sincronizar') }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Perfil" />

      {/* Identidad */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0 22px' }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 22, borderWidth: 1.5, marginBottom: 10 }}>
          {initials(displayName)}
        </div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 17, fontWeight: 700, color: '#fff' }}>
          {displayName.split('@')[0]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{email}</div>
      </div>

      {/* Seguridad */}
      <div className="eyebrow" style={{ marginBottom: 9 }}>Seguridad</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        <button className="list-row" onClick={() => setSheetOpen(true)} disabled={isDemo} style={isDemo ? { opacity: .5 } : undefined}>
          <i className="ti ti-key list-row-ic" aria-hidden="true" />
          <div className="list-row-main">
            <div className="list-row-title">Cambiar passphrase</div>
            <div className="list-row-sub">Re-envuelve tu clave de cifrado</div>
          </div>
          <i className="ti ti-chevron-right list-row-chev" aria-hidden="true" />
        </button>

        <div className="list-row" style={{ cursor: 'default' }}>
          <i className="ti ti-fingerprint list-row-ic" aria-hidden="true" />
          <div className="list-row-main">
            <div className="list-row-title">Desbloqueo con huella</div>
            <div className="list-row-sub">
              {bioAvailable ? 'Usar biometría al abrir' : 'No disponible en este dispositivo'}
            </div>
          </div>
          <Switch
            checked={bioEnabled && bioAvailable}
            onChange={handleBio}
            disabled={isDemo || !bioAvailable}
            label="Desbloqueo con huella"
          />
        </div>
      </div>

      {/* Inversión */}
      <div className="eyebrow" style={{ marginBottom: 9 }}>Inversión</div>
      <button
        onClick={() => navigate('/perfil/inversion')}
        disabled={isDemo}
        style={{
          width: '100%', textAlign: 'left', cursor: isDemo ? 'not-allowed' : 'pointer',
          background: 'var(--accent-glow)', border: '1px solid var(--accent-line)',
          borderRadius: 'var(--r-lg)', padding: 14, marginBottom: 18, opacity: isDemo ? .5 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <i className="ti ti-target-arrow" style={{ color: 'var(--accent)', fontSize: 22 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, color: '#fff' }}>Perfil de Inversión</div>
            <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Rol, tesis y kill criteria por ticker</div>
          </div>
          <i className="ti ti-chevron-right" style={{ color: 'var(--accent)', fontSize: 16 }} aria-hidden="true" />
        </div>
        {totalTickers > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--accent-soft)' }}>
            <div className="weightbar" style={{ flex: 1, margin: 0 }}><span style={{ width: `${pctCompleto}%` }} /></div>
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>{completos} / {totalTickers} completos</span>
          </div>
        )}
      </button>

      {/* Cuenta */}
      <div className="eyebrow" style={{ marginBottom: 9 }}>Cuenta</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* SEC-1: las credenciales del broker SOLO se ven/editan en la app nativa (APK), nunca en web. */}
        {!isDemo && Capacitor.isNativePlatform() && (
          <button className="list-row" onClick={() => setBrokerOpen(true)}>
            <i className="ti ti-plug-connected list-row-ic" style={{ color: 'var(--muted2)' }} aria-hidden="true" />
            <div className="list-row-main">
              <div className="list-row-title">Credenciales del broker</div>
              <div className="list-row-sub">Ver y editar tus claves del broker</div>
            </div>
            <i className="ti ti-chevron-right list-row-chev" aria-hidden="true" />
          </button>
        )}
        {!isDemo && (
          <button className="list-row" onClick={handleSync} disabled={syncing}>
            <i className={`ti ti-refresh list-row-ic ${syncing ? 'spin-ic' : ''}`} style={{ color: 'var(--muted2)' }} aria-hidden="true" />
            <div className="list-row-main"><div className="list-row-title">{syncing ? 'Sincronizando…' : 'Sincronizar con el broker'}</div></div>
          </button>
        )}
        <button className="list-row" onClick={signOut}>
          <i className="ti ti-logout list-row-ic" style={{ color: 'var(--red)' }} aria-hidden="true" />
          <div className="list-row-main"><div className="list-row-title" style={{ color: 'var(--red)' }}>Cerrar sesión</div></div>
        </button>
      </div>

      {sheetOpen && (
        <ChangePassphrase
          uid={user?.uid}
          onClose={() => setSheetOpen(false)}
          onSuccess={() => showToast('✓ Passphrase actualizada')}
        />
      )}
      {brokerOpen && (
        <BrokerCredentials
          uid={user?.uid}
          onClose={() => setBrokerOpen(false)}
          onSaved={async () => {
            showToast('✓ Credenciales guardadas · sincronizando…')
            try { await syncPPI() } catch { /* el resultado se ve en el header/diagnóstico */ }
          }}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
