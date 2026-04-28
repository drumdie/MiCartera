import { useApp } from '../../store/AppContext'

export default function DemoBanner() {
  const { isDemo } = useApp()
  if (!isDemo) return null

  return (
    <div className="demo-banner fade-in">
      <span>⚠️</span>
      <div>
        <strong>Datos de ejemplo</strong> — Esta versión usa valores ficticios para demostración.
        Los datos reales se cargan dinámicamente desde la API.
      </div>
    </div>
  )
}
