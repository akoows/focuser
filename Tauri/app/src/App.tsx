import "./App.css";
import logo from "./assets/focuserLogo.png";

function App() {
  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="Focuser" className="logo" />

        <div className="login-header">
          <h1>Welcome back</h1>
          <p>Sign in to continue to Focuser.</p>
        </div>

        <form className="login-form">
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="input-group">
            <div className="password-label">
              <label htmlFor="password">Password</label>
              <a href="#">Forgot password?</a>
            </div>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" className="login-button">
            Sign in
          </button>
        </form>

        <div className="divider">
          <span>or</span>
        </div>

        <button className="google-button" type="button">
          Continue with Google
        </button>

        <p className="signup">
          Don't have an account? <a href="#">Create one</a>
        </p>
      </div>
    </div>
  );
}

export default App;