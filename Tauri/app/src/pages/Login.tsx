import { useState, type FormEvent } from "react";
import logo from "../assets/focuserLogo.png";
import type { ApiUser } from "../types/api";
import { login, register } from "../services/authService";
import "./Login.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

type LoginPageProps = {
  initialError: string | null;
  onLogin: (user: ApiUser) => void;
};

function LoginPage({ initialError, onLogin }: LoginPageProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const user = isRegistering
        ? await register(name, email, password)
        : await login(email, password);

      try {
        await getCurrentWindow().maximize();
      } catch (error) {
        console.error("Não foi possível maximizar a janela:", error);
      }

      onLogin(user);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível autenticar."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setIsRegistering((current) => !current);
    setErrorMessage(null);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="Focuser" className="logo" />

        <div className="login-header">
          <h1>{isRegistering ? "Create your account" : "Welcome back"}</h1>
          <p>{isRegistering ? "Create an account to get started." : "Sign in to continue to Focuser."}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {isRegistering && (
            <div className="input-group">
              <label htmlFor="name">Name</label>
              <input
                autoComplete="name"
                id="name"
                maxLength={80}
                name="name"
                placeholder="Your name"
                required
                type="text"
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </div>

          <div className="input-group">
            <div className="password-label">
              <label htmlFor="password">Password</label>
              {!isRegistering && <span className="password-hint">Forgot password?</span>}
            </div>
            <input
              autoComplete={isRegistering ? "new-password" : "current-password"}
              id="password"
              minLength={isRegistering ? 8 : undefined}
              name="password"
              required
              type="password"
            />
          </div>

          {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}

          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Please wait..."
              : isRegistering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="signup">
          {isRegistering ? "Already have an account? " : "Don't have an account? "}
          <button className="login-mode-toggle" onClick={toggleMode} type="button">
            {isRegistering ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
