import { createContext, useContext } from 'react'
import type { MeResponse } from './api'

export type AuthStatus = 'loading' | 'guest' | 'authed'

export interface AuthContextValue {
  status: AuthStatus
  session: MeResponse | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}