import { useState, useRef, useEffect } from 'react'
import {
  ROLES, BANDAS_DEFAULT, KILL_TEMPLATES, REVISION_OPTS,
  contratoCompleto, contratoStale,
} from '../../data/contratoConfig'

const EMPTY = { rol: '', peso_min: '', peso_objetivo: '', peso_max: '', tesis: '', kill_criteria: [], revision: 'trimestral' }

function fromContrato(c) {
  return { ...EMPTY, ...c, kill_criteria: c?.kill_criteria ?? [] }
}

// Normaliza para guardar: pesos a número, kill criteria sin vacíos.
function sanitize(f) {
  const num = (v) => (v === '' || v == null ? undefined : Number(v))
  return {
    rol: f.rol || undefined,
    peso_min: num(f.peso_min),
    peso_objetivo: num(f.peso_objetivo),
    peso_max: num(f.peso_max),
    tesis: f.tesis?.trim() || '',
    kill_criteria: (f.kill_criteria ?? []).map(k => (k ?? '').trim()).filter(Boolean),
    revision: f.revision || 'trimestral',
  }
}

const STATUS = {
  completo:  { cls: 'badge-accent',  icon: 'ti-check',          label: 'completo' },
  stale:     { cls: 'badge-amber',   icon: 'ti-clock-exclamation', label: 'revisar' },
  pendiente: { cls: 'badge-amber',   icon: 'ti-progress',       label: 'pendiente' },
  vacio:     { cls: 'badge-neutral', icon: 'ti-minus',          label: 'sin definir' },
}

export default function ContratoTickerCard({ ticker, descripcion, contrato, onSave }) {
  const [open, setOpen]         = useState(false)
  const [form, setForm]         = useState(() => fromContrato(contrato))
  const [killInput, setKillInput] = useState('')
  const [saved, setSaved]       = useState(false)
  const timer = useRef(null)

  // Re-sincronizar desde Firestore solo cuando la card está cerrada (no pisar lo que se edita).
  useEffect(() => {
    if (!open) setForm(fromContrato(contrato))
  }, [contrato]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), [])

  const scheduleSave = (nextForm) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await onSave(ticker, sanitize(nextForm))
        setSaved(true); setTimeout(() => setSaved(false), 1500)
      } catch { /* el padre muestra el toast de error */ }
    }, 700)
  }

  const update = (patch) => setForm(prev => { const next = { ...prev, ...patch }; scheduleSave(next); return next })

  const onRol = (rol) => {
    const b = BANDAS_DEFAULT[rol] ?? {}
    update({ rol, peso_min: b.peso_min ?? '', peso_objetivo: b.peso_objetivo ?? '', peso_max: b.peso_max ?? '' })
  }

  const addKill = (k) => {
    const v = (k ?? '').trim()
    if (!v || form.kill_criteria.includes(v)) return
    update({ kill_criteria: [...form.kill_criteria, v] })
  }
  const removeKill = (k) => update({ kill_criteria: form.kill_criteria.filter(x => x !== k) })

  const completo = contratoCompleto(sanitize(form))
  const stale = contratoStale(contrato)
  const statusKey = completo ? (stale ? 'stale' : 'completo') : (form.rol ? 'pendiente' : 'vacio')
  const st = STATUS[statusKey]

  const templates = (KILL_TEMPLATES[form.rol] ?? []).filter(t => !form.kill_criteria.includes(t))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 13, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tr-ticker" style={{ fontSize: 15 }}>{ticker}</div>
          {descripcion && <div className="list-row-sub">{descripcion}</div>}
        </div>
        <span className={`badge ${st.cls}`}><i className={`ti ${st.icon}`} aria-hidden="true" />{st.label}</span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'} list-row-chev`} aria-hidden="true" />
      </button>

      {open && (
        <div style={{ padding: '0 13px 14px', borderTop: '1px solid var(--border)' }}>
          {/* Rol */}
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">Rol en cartera</label>
            <select className="field-input" value={form.rol} onChange={e => onRol(e.target.value)}>
              <option value="">Elegí un rol…</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Banda */}
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Banda de peso (%) — autocompleta según el rol</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[['peso_min', 'mín'], ['peso_objetivo', 'objetivo'], ['peso_max', 'máx']].map(([k, lbl]) => (
                <div key={k} style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: k === 'peso_objetivo' ? 'var(--accent)' : 'var(--muted)', marginBottom: 3 }}>{lbl}</div>
                  <input
                    className="field-input" type="number" inputMode="decimal" step="0.5" min="0" max="100"
                    value={form[k] ?? ''} onChange={e => update({ [k]: e.target.value })}
                    style={{ textAlign: 'center', padding: '0 6px' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tesis */}
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">Tesis personal</label>
            <textarea
              className="field-input" rows={3} placeholder="Qué tendría que pasar para que la tesis siga viva, se debilite o se invalide."
              value={form.tesis} onChange={e => update({ tesis: e.target.value })}
              style={{ resize: 'vertical', paddingTop: 8, paddingBottom: 8, minHeight: 'auto', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* Kill criteria */}
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Kill criteria</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {form.kill_criteria.map(k => (
                <span key={k} className="badge badge-neutral" style={{ paddingRight: 4 }}>
                  {k}
                  <button onClick={() => removeKill(k)} aria-label="Quitar" style={{ background: 'none', border: 'none', color: 'var(--muted2)', cursor: 'pointer', display: 'flex', padding: 0, marginLeft: 2 }}>
                    <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {form.kill_criteria.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sumá al menos uno ↓</span>}
            </div>

            {templates.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {templates.map(t => (
                  <button key={t} onClick={() => addKill(t)} className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px dashed var(--accent-line)', cursor: 'pointer' }}>
                    <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />{t}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                className="field-input" placeholder="Agregar criterio propio…"
                value={killInput} onChange={e => setKillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKill(killInput); setKillInput('') } }}
              />
              <button className="btn btn-sm" type="button" onClick={() => { addKill(killInput); setKillInput('') }}>Añadir</button>
            </div>
          </div>

          {/* Revisión + estado guardado */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">Revisión</label>
              <select className="field-input" value={form.revision} onChange={e => update({ revision: e.target.value })}>
                {REVISION_OPTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <span style={{ fontSize: 11, color: saved ? 'var(--accent)' : 'var(--muted)', paddingBottom: 11, whiteSpace: 'nowrap' }}>
              <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'}`} style={{ fontSize: 13, verticalAlign: '-2px' }} aria-hidden="true" /> {saved ? 'guardado' : 'autosave'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
