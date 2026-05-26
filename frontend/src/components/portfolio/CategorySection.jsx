import { useState } from 'react'
import AssetRow from './AssetRow'
import { formatARS } from '../../utils/formatters'
import PrivacyMask from '../ui/PrivacyMask'

export default function CategorySection({ title, category, isCedear, isBono, isON, isFCI }) {
  const [expandedId, setExpandedId] = useState(null)

  const posiciones = category?.posiciones ?? []
  const pct        = category?.pct_cartera ?? 0
  const subtotal   = category?.subtotal_ars ?? 0

  const handleToggle = (ticker) => {
    setExpandedId(prev => prev === ticker ? null : ticker)
  }

  if (!posiciones.length) return null

  return (
    <>
      <div className="sec-title fade-in d3">
        {title}
        <span className="sec-count">
          {posiciones.length} pos · <PrivacyMask>{formatARS(subtotal)}</PrivacyMask> · {pct.toFixed(2).replace('.', ',')}%
        </span>
      </div>
      <div className="ticker-list fade-in d3">
        {posiciones.map(pos => (
          <AssetRow
            key={pos.ticker}
            position={pos}
            expanded={expandedId === pos.ticker}
            onToggle={() => handleToggle(pos.ticker)}
            isCedear={isCedear}
            isBono={isBono}
            isON={isON}
            isFCI={isFCI}
            isStale={category?.is_stale ?? false}
          />
        ))}
      </div>
    </>
  )
}
