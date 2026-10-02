import { useState, type FormEvent } from 'react'
import { useAuth } from './auth-context'
import { ApiError } from './api'

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await login(email, password)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Sign in</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  )
}