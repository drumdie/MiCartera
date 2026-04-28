import { useState } from 'react'

// Área para pegar el JSON de respuesta de Claude.
// En Fase 2+ el JSON puede venir directo de la API de Claude sin necesidad
// de que el usuario lo copie manualmente.
export default function PasteResultArea({ id, label, sub, onLoad }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  const handleLoad = () => {
    onLoad?.(value)
    setValue('')
    setOpen(false)
  }

  return (
    <>
      <button className="action-btn paste-btn" onClick={() => setOpen(o => !o)}>
        <span className="ab-icon">📥</span>
        <div className="ab-text">
          <div className="ab-title">{label}</div>
          <div className="ab-sub">{sub}</div>
        </div>
        <span className="ab-arrow">→</span>
      </button>
      <div className={`paste-area ${open ? 'open' : ''}`} id={id}>
        <textarea
          placeholder="Pegá acá el JSON..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="paste-submit" onClick={handleLoad}>Cargar</button>
      </div>
    </>
  )
}
