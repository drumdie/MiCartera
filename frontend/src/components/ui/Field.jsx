import { useState } from 'react'

// Input con label, estado de error explícito y ojo para passwords.
export default function Field({
  label, name, type = 'text', value, onChange,
  placeholder, error, hint, autoComplete,
}) {
  const [show, setShow] = useState(false)
  const isPw = type === 'password'
  const inputType = isPw && show ? 'text' : type

  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      {label && <label className="field-label" htmlFor={name}>{label}</label>}
      <div className="field-wrap">
        <input
          id={name}
          name={name}
          className="field-input"
          type={inputType}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={isPw ? { paddingRight: 42 } : undefined}
        />
        {isPw && (
          <button
            type="button"
            className="field-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Ocultar' : 'Mostrar'}
          >
            <i className={`ti ${show ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {error && (
        <div className="field-msg">
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {error}
        </div>
      )}
      {!error && hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}
