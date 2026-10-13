import { useEffect, useState } from "react";
import LoginPage from "./pages/Login";
import MainPage from "./pages/MainPage";
import { ApiError } from "./services/api";
import { getCurrentUser, logout } from "./services/authService";
import type { ApiUser } from "./types/api";
import "./App.css";

function App() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setSessionError(
            error instanceof Error ? error.message : "Não foi possível verificar a sessão."
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsCheckingSession(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    setSessionError(null);
  }

  if (isCheckingSession) {
    return <main className="session-loading">Conectando ao Focuser...</main>;
  }

  return user
    ? <MainPage user={user} onLogout={handleLogout} />
    : <LoginPage initialError={sessionError} onLogin={(authenticatedUser) => {
      setSessionError(null);
      setUser(authenticatedUser);
    }} />;
}

export default App;