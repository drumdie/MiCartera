import { usePrivacy } from '../../hooks/usePrivacy'

// Oculta su contenido cuando el modo privacidad está activo.
// Los porcentajes nunca se enmascaran — pasarlos fuera de este componente.
export default function PrivacyMask({ children }) {
  const { privacyOn } = usePrivacy()
  return privacyOn ? <span>••••••</span> : <>{children}</>
}
