// Toggle accesible (role="switch"). Lo usa el toggle de biometría y es reutilizable.
export default function Switch({ checked = false, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => { if (!disabled) onChange?.(!checked) }}
    >
      <span className="switch-knob" />
    </button>
  )
}
