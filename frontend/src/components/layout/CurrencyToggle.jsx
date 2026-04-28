import { useApp } from '../../store/AppContext'

const CURRENCIES = ['ARS', 'MEP', 'CCL', 'BNA']

export default function CurrencyToggle() {
  const { activeCurrency, setActiveCurrency } = useApp()

  return (
    <div className="currency-btns">
      {CURRENCIES.map(c => (
        <button
          key={c}
          className={`curr-btn ${activeCurrency === c ? 'active' : ''}`}
          onClick={() => setActiveCurrency(c)}
        >
          {c}
        </button>
      ))}
    </div>
  )
}
