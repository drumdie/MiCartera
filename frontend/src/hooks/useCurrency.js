import { useApp } from '../store/AppContext'
import { convertARS, getRendForCurrency } from '../utils/formatters'

export function useCurrency() {
  const { activeCurrency, setActiveCurrency, cotizaciones } = useApp()

  const convert = (amountARS) => convertARS(amountARS, activeCurrency, cotizaciones)
  const getRend = (position)  => getRendForCurrency(position, activeCurrency)

  return { activeCurrency, setActiveCurrency, cotizaciones, convert, getRend }
}
