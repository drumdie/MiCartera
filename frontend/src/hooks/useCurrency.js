import { useApp } from '../store/AppContext'
import { convertARS, convertARSPrice, currencyLabel, getRendForCurrency } from '../utils/formatters'

export function useCurrency() {
  const { activeCurrency, setActiveCurrency, cotizaciones } = useApp()

  const convert      = (amountARS) => convertARS(amountARS, activeCurrency, cotizaciones)
  const convertPrice = (amountARS) => convertARSPrice(amountARS, activeCurrency, cotizaciones)
  const getRend      = (position)  => getRendForCurrency(position, activeCurrency)
  const curLabel     = currencyLabel(activeCurrency)

  return { activeCurrency, setActiveCurrency, cotizaciones, convert, convertPrice, getRend, curLabel }
}
