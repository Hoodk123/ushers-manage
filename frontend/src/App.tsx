import { useAuth } from './auth-context'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'
import { LogoutButton } from './LogoutButton'

function App() {
  const { status, session } = useAuth()

  return (
    <main>
      <div className="auth-card">
        <h1>Ushers Manage</h1>
        <p className="tagline">Roster, rotate, and track your usher team.</p>

        {status === 'loading' && <p>Loading…</p>}

        {status === 'guest' && (
          <>
            <LoginForm />
            <p className="divider">or</p>
            <SignupForm />
          </>
        )}

        {status === 'authed' && session?.user && (
          <div className="signed-in">
            <p>
              <strong>{session.user.name}</strong> ({session.user.email})
            </p>
            {session.admin && <p className="role">Admin</p>}
            {session.usher && !session.admin && <p className="role">Usher</p>}
            <p>
              <LogoutButton />
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

export default App