import { useState, useEffect } from 'react'
import { buildContratoContext } from '../../services/contextBuilder'
import { validateTacticalPayload } from '../../services/tacticalEngine'
import { saveRankingTactico, onSnapshotRankingTactico } from '../../services/portfolioService'
import TacticalBadge from '../portfolio/TacticalBadge'

const URGENCIA_CLR = { alta: 'var(--red)', media: 'var(--warn)', baja: 'var(--muted2)', sin_accion_inmediata: 'var(--muted)' }
const URGENCIA_LBL = { alta: 'Alta', media: 'Media', baja: 'Baja', sin_accion_inmediata: 'Sin urgencia' }

export default function RankingTacticoPanel({ uid, tactico, fundamentalsByTicker, catalizadores, onToast }) {
  const [ranking, setRanking]   = useState([])
  const [fechaTactico, setFechaTactico] = useState(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteVal, setPasteVal]   = useState('')

  useEffect(() => {
    if (!uid) return
    return onSnapshotRankingTactico(uid, (items, fecha) => { setRanking(items); setFechaTactico(fecha) })
  }, [uid])

  const handleCopy = async () => {
    const text = buildContratoContext(tactico, fundamentalsByTicker, catalizadores)
    try {
      await navigator.clipboard.writeText(text)
      onToast?.('✓ Contexto copiado — pegalo en Claude.ai')
    } catch {
      onToast?.('No se pudo copiar al portapapeles')
    }
  }

  const handlePaste = async () => {
    let parsed
    try { parsed = JSON.parse(pasteVal) }
    catch { onToast?.('JSON inválido'); return }

    const { ok, errores, ranking: rk } = validateTacticalPayload(parsed)
    if (!ok) { onToast?.(`Enums inválidos: ${errores[0]}`); return }
    if (!rk?.length) { onToast?.('El JSON no trae ranking_tactico'); return }

    try {
      await saveRankingTactico(uid, rk)
      setPasteVal(''); setPasteOpen(false)
      onToast?.(`✓ Ranking guardado (${rk.length} acciones)`)
    } catch {
      onToast?.('No se pudo guardar el ranking')
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 700, color: '#fff' }}>Ranking táctico</span>
        <span className="badge badge-purple"><i className="ti ti-sparkles" aria-hidden="true" />Claude</span>
      </div>
      {fechaTactico && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: -4, marginBottom: 10 }}>
          Táctico del {new Date(fechaTactico).toLocaleDateString('es-AR')}
        </div>
      )}

      {ranking.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Copiá el contexto, pegáselo a Claude.ai y traé el JSON. El ranking ordena las acciones por impacto en pp de cartera.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {[...ranking].sort((a, b) => (a.prioridad ?? 99) - (b.prioridad ?? 99)).map((r, i) => (
            <div key={`${r.ticker}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <div className="ranknum" style={{ color: URGENCIA_CLR[r.urgencia] ?? 'var(--muted2)' }}>{r.prioridad ?? i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="tr-ticker" style={{ fontSize: 13 }}>{r.ticker}</span>
                  <TacticalBadge accion={r.accion} />
                  {r.impacto_pp != null && <span style={{ fontSize: 11, color: 'var(--muted2)' }}>{Number(r.impacto_pp)} pp</span>}
                  <span style={{ fontSize: 10, color: URGENCIA_CLR[r.urgencia] }}>{URGENCIA_LBL[r.urgencia] ?? r.urgencia}</span>
                </div>
                {r.motivo && <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.45, marginTop: 2 }}>{r.motivo}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7 }}>
        <button className="btn btn-sm btn-block" onClick={handleCopy}>
          <i className="ti ti-copy" aria-hidden="true" />Copiar contexto
        </button>
        <button className="btn btn-sm btn-block" onClick={() => setPasteOpen(o => !o)}>
          <i className="ti ti-clipboard-check" aria-hidden="true" />Pegar JSON
        </button>
      </div>

      {pasteOpen && (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="field-input" rows={4} placeholder="Pegá el JSON con ranking_tactico…"
            value={pasteVal} onChange={e => setPasteVal(e.target.value)}
            style={{ resize: 'vertical', paddingTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
          />
          <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} onClick={handlePaste}>
            Validar y guardar
          </button>
        </div>
      )}
    </div>
  )
}
