import { useState } from 'react'

const CX = 38, CY = 38, R = 26, SW = 10
const CIRC = 2 * Math.PI * R

export default function DonutChart({ data }) {
  const [active, setActive] = useState(null)

  // Calcular los arcos del donut
  let offset = 0
  const segments = data.filter(d => d.pct > 0).map(d => {
    const dash = (d.pct / 100) * CIRC
    const seg  = { ...d, dash, gap: CIRC - dash, offset }
    offset += dash + 1
    return seg
  })

  return (
    <div className="dist-body">
      <div className="dist-donut-row">
        <div className="dist-donut-col">
          <svg
            className="dist-donut"
            width="76" height="76" viewBox="0 0 76 76"
            onClick={() => setActive(null)}
          >
            {/* Aro base */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1a2030" strokeWidth={SW} />
            {segments.map(seg => (
              <circle
                key={seg.name}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={SW}
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={-seg.offset}
                transform={`rotate(-90 ${CX} ${CY})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setActive(seg) }}
              />
            ))}
          </svg>
          <div className={`donut-label ${active ? 'visible' : ''}`}>
            {active && <>
              <div className="donut-label-dot" style={{ background: active.color }} />
              <span className="donut-label-pct">{active.pct}%</span>
              <span className="donut-label-name">{active.name}</span>
            </>}
          </div>
        </div>

        <div className="dist-legend">
          {data.map(d => (
            <div key={d.name} className="dl-item" onClick={() => setActive(d)}>
              <div className="dl-left">
                <div className="dl-dot" style={{ background: d.color }} />
                <div className="dl-name">{d.name}</div>
              </div>
              <div className="dl-pct">{d.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
