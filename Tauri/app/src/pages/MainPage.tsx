import "./MainPage.css";
import { useState } from "react";

const tabs = [
  { id: "today", label: "Hoje", icon: "⌂" },
  { id: "tasks", label: "Tarefas", icon: "◫" },
  { id: "habits", label: "Hábitos", icon: "◌" },
  { id: "goals", label: "Metas", icon: "◈" },
  { id: "analytics", label: "Análises", icon: "⌁" },
  { id: "settings", label: "Configurações", icon: "⚙" },
];

const tabDescriptions: Record<string, string> = {
  tasks: "Organize e acompanhe suas tarefas.",
  habits: "Acompanhe os hábitos que você quer construir.",
  goals: "Defina objetivos e acompanhe seu progresso.",
  analytics: "Veja como você está usando seu tempo de foco.",
  settings: "Personalize sua experiência no Focuser.",
};

function MainPage() {
  const [activeTab, setActiveTab] = useState("today");
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="main-page">

      <aside className="sidebar">

        <div className="brand">
          f<span>✦</span>cuser
        </div>

        <nav className="navigation">

          {tabs.map((tab) => (
            <button
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}

        </nav>

        <div className="sidebar-bottom">
          <div className="user">
            <div className="user-avatar">A</div>

            <div>
              <strong>Admin</strong>
              <small>Conta pessoal</small>
            </div>
          </div>
        </div>

      </aside>


      <main className="content">

        <header className="page-header">
          <div>
            <h1>{activeTabInfo.label}</h1>
            <p>{activeTab === "today" ? "Seu foco de hoje." : tabDescriptions[activeTab]}</p>
          </div>

          {activeTab === "today" && (
            <button className="focus-button" type="button">
              + Iniciar foco
            </button>
          )}
        </header>

        {activeTab === "today" ? <>
          <section className="stats">

          <div className="stat-card">
            <span className="stat-title">
              Hábitos do dia
            </span>

            <strong>2 / 5</strong>

            <div className="progress">
              <div className="progress-value" style={{ width: "40%" }} />
            </div>
          </div>


          <div className="stat-card">
            <span className="stat-title">
              Meta semanal
            </span>

            <strong>3 / 7</strong>

            <div className="progress">
              <div className="progress-value" style={{ width: "43%" }} />
            </div>
          </div>


          <div className="stat-card">
            <span className="stat-title">
              Tempo de foco
            </span>

            <strong>42 min</strong>

            <small>+12% esta semana</small>
          </div>

          </section>


          <section className="focus-section">

          <div className="section-header">
            <div>
              <h2>Foco</h2>
              <p>Seu tempo de concentração hoje.</p>
            </div>

            <span className="focus-time">
              42 min
            </span>
          </div>

          <div className="focus-chart">
            <div className="chart-line" />
          </div>

          </section>


          <section className="tasks-section">

          <div className="section-header">
            <div>
              <h2>Tarefas</h2>
              <p>O que precisa ser feito hoje.</p>
            </div>

            <button className="add-button">
              + Adicionar
            </button>
          </div>

          <div className="task-list">

            <div className="task">
              <div className="task-check" />

              <div>
                <strong>Estudar React</strong>
                <small>Desenvolvimento</small>
              </div>
            </div>

            <div className="task">
              <div className="task-check" />

              <div>
                <strong>Treinar</strong>
                <small>Saúde</small>
              </div>
            </div>

            <div className="task completed">
              <div className="task-check checked">✓</div>

              <div>
                <strong>Ler 20 páginas</strong>
                <small>Leitura</small>
              </div>
            </div>

          </div>

          </section>
        </> : (
          <section className="tab-placeholder">
            <h2>{activeTabInfo.label}</h2>
            <p>{tabDescriptions[activeTab]}</p>
          </section>
        )}

      </main>

    </div>
  );
}

export default MainPage;