import { useApp } from '../store/AppContext'

export function usePrivacy() {
  const { privacyOn, setPrivacyOn } = useApp()
  const toggle = () => setPrivacyOn(v => !v)
  return { privacyOn, toggle }
}
