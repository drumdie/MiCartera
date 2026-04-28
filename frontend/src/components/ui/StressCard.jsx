export default function StressCard({ scenario }) {
  const { nombre, descripcion, impacto_cartera_pct, tipo } = scenario
  return (
    <div className={`stress-card ${tipo}`}>
      <h4>{nombre}</h4>
      <div className="stress-drop">{impacto_cartera_pct.toFixed(1).replace('.', ',')}%</div>
      <div className="stress-desc">{descripcion}</div>
    </div>
  )
}
