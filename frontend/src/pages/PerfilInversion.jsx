import { useState } from 'react'
import { useApp } from '../store/AppContext'
import { useContratos } from '../hooks/useContratos'
import { saveContrato } from '../services/portfolioService'
import ScreenHeader from '../components/layout/ScreenHeader'
import Toast from '../components/ui/Toast'
import ContratoTickerCard from '../components/profile/ContratoTickerCard'

export default function PerfilInversion() {
  const { user, portfolio } = useApp()
  const { contratos, tactico } = useContratos(user?.uid, portfolio)
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const handleSave = async (ticker, payload) => {
    try { await saveContrato(user.uid, ticker, payload) }
    catch { showToast('No se pudo guardar el contrato'); throw new Error('save failed') }
  }

  const grupos = tactico?.grupos ?? []
  const sumaObj = tactico?.suma_peso_objetivo

  return (
    <div className="screen">
      <ScreenHeader title="Perfil de Inversión" subtitle="Contrato por ticker" />

      {grupos.length === 0 ? (
        <div className="state">
          <i className="ti ti-target-off" aria-hidden="true" />
          <div className="state-title">Sin posiciones</div>
          <div className="state-desc">Sincronizá tu cartera con PPI para definir el contrato de cada ticker.</div>
        </div>
      ) : (
        <>
          {sumaObj != null && (
            <div className="badge" style={{
              display: 'flex', width: '100%', justifyContent: 'center', marginBottom: 14,
              background: 'var(--surface2)', color: 'var(--muted2)',
              border: '1px solid var(--border2)',
            }}>
              <i className="ti ti-scale" aria-hidden="true" />
              Suma de % de Objetivo: {sumaObj}%
            </div>
          )}

          {grupos.map(g => (
            <div key={g.grupo} style={{ marginBottom: 6 }}>
              <div className="eyebrow" style={{ margin: '14px 0 9px' }}>
                {g.grupo}
                <span className="eyebrow-meta">{g.pct}%</span>
              </div>
              {g.posiciones.map(p => (
                <ContratoTickerCard
                  key={p.ticker}
                  ticker={p.ticker}
                  descripcion={p.descripcion}
                  contrato={contratos?.[p.ticker]}
                  onSave={handleSave}
                />
              ))}
            </div>
          ))}
        </>
      )}

      <Toast message={toast} />
    </div>
  )
}
