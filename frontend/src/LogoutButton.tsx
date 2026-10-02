import { useAuth } from './auth-context'

export function LogoutButton() {
  const { logout } = useAuth()
  return <button onClick={() => void logout()}>Sign out</button>
}