import { useEffect, useRef } from 'react'

export default function TradingViewWidget({ symbol }) {
  const priceRef = useRef(null)
  const finRef   = useRef(null)
  const isMobile = window.innerWidth < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent)
  const baseUrl  = symbol ? `https://www.tradingview.com/symbols/${symbol}/` : ''

  useEffect(() => {
    if (!symbol || isMobile) return

    const buildWidget = (container, src, config) => {
      container.innerHTML = ''
      const wrap   = document.createElement('div')
      wrap.className = 'tradingview-widget-container'
      const script = document.createElement('script')
      script.src   = src
      script.async = true
      script.textContent = JSON.stringify(config)
      wrap.appendChild(script)
      container.appendChild(wrap)
    }

    if (priceRef.current) {
      buildWidget(priceRef.current,
        'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
        {
          symbol: symbol.replace('-', ':'), interval: 'D',
          timezone: 'America/Argentina/Buenos_Aires',
          theme: 'dark', style: '1', locale: 'es',
          backgroundColor: '#0e1117', gridColor: 'rgba(28,37,53,0.8)',
          width: '100%', height: '400',
          hide_top_toolbar: false, allow_symbol_change: false, save_image: false,
        }
      )
    }
    if (finRef.current) {
      buildWidget(finRef.current,
        'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',
        {
          symbol: symbol.replace('-', ':'),
          colorTheme: 'dark', locale: 'es',
          width: '100%', height: '450', displayMode: 'adaptive',
        }
      )
    }
  }, [symbol])

  if (!symbol) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>
        Tocá un ticker para ver su información financiera
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="chart-section">
        <div className="chart-section-title">Gráfico · {symbol}</div>
        <div className="tv-widget-wrap">
          <div className="tv-fallback">
            <div className="tv-fallback-title">{symbol}</div>
            <div className="tv-fallback-sub">Los widgets embebidos requieren Chrome desktop. Desde mobile podés abrir directamente.</div>
            <a className="tv-open-btn" href={baseUrl} target="_blank" rel="noreferrer">📈 Ver gráfico en TradingView</a>
            <a className="tv-open-btn fin" href={`${baseUrl}financials-income-statement/`} target="_blank" rel="noreferrer">📊 Informes financieros</a>
            <a className="tv-open-btn fin" href={`${baseUrl}financials-statistics/`} target="_blank" rel="noreferrer">📉 Estadísticas</a>
            <div className="tv-note">Abre TradingView con la vista de información financiera</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="chart-section">
        <div className="chart-section-title">Gráfico de precio · {symbol}</div>
        <div className="tv-widget-wrap" style={{ minHeight: 400 }} ref={priceRef}>
          <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>Cargando…</div>
        </div>
        <a className="tv-open-btn" href={baseUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
          ↗ Ver completo en TradingView
        </a>
      </div>
      <div className="chart-section">
        <div className="chart-section-title">Información financiera · {symbol}</div>
        <div className="tv-widget-wrap" style={{ minHeight: 450 }} ref={finRef}>
          <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>Cargando…</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <a className="tv-open-btn fin" href={`${baseUrl}financials-income-statement/`} target="_blank" rel="noreferrer" style={{ flex: 1 }}>📊 Informes</a>
          <a className="tv-open-btn fin" href={`${baseUrl}financials-statistics/`}        target="_blank" rel="noreferrer" style={{ flex: 1 }}>📉 Estadísticas</a>
          <a className="tv-open-btn fin" href={`${baseUrl}financials-dividends/`}          target="_blank" rel="noreferrer" style={{ flex: 1 }}>💰 Dividendos</a>
        </div>
      </div>
    </>
  )
}
