import logo from "../assets/focuserLogo.png";
import "./Login.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

type LoginPageProps = {
  onLogin: () => void;
};

function LoginPage({ onLogin }: LoginPageProps) {

  const checkLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;

    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value.trim();

    console.log("Email:", email);
    console.log("Password:", password);

    if (email === "admin" && password === "admin") {
      console.log("Login correto!");

      const appWindow = getCurrentWindow();
      await appWindow.setResizable(true);
      await appWindow.setSize(new LogicalSize(1280, 820));
      await appWindow.center();

      onLogin();
    } else {
      console.log("Login incorreto!");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <img src={logo} alt="Focuser" className="logo" />

        <div className="login-header">
          <h1>Welcome back</h1>
          <p>Sign in to continue to Focuser.</p>
        </div>

        <form className="login-form" onSubmit={checkLogin}>

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="text"
              placeholder="admin"
            />
          </div>

          <div className="input-group">
            <div className="password-label">
              <label htmlFor="password">Password</label>
              <a href="#">Forgot password?</a>
            </div>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="admin"
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

export default LoginPage;