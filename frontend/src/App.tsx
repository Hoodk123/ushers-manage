import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'

function App() {
  return (
    <main>
      <div className="auth-card">
        <h1>Ushers Manage</h1>
        <p className="tagline">Roster, rotate, and track your usher team.</p>

        <Show
          when="signed-out"
          fallback={
            <div className="signed-in">
              <UserButton />
            </div>
          }
        >
          <p>
            <SignInButton />
          </p>
          <p>
            <SignUpButton />
          </p>
        </Show>
      </div>
    </main>
  )
}

export default App