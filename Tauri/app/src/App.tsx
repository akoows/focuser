import { useState } from "react";
import LoginPage from "./pages/Login";
import MainPage from "./pages/MainPage";

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    return isLoggedIn ? <MainPage /> : <LoginPage onLogin={() => setIsLoggedIn(true)} />;
}

export default App;