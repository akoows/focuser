import "./MainPage.css";

function MainPage() {
  return (
    <div className="main-page">

      <aside className="sidebar">

        <div className="brand">
          f<span>✦</span>cuser
        </div>

        <nav className="navigation">

          <a className="nav-item active">
            <span>⌂</span>
            Hoje
          </a>

          <a className="nav-item">
            <span>◫</span>
            Tarefas
          </a>

          <a className="nav-item">
            <span>◌</span>
            Hábitos
          </a>

          <a className="nav-item">
            <span>◈</span>
            Metas
          </a>

          <a className="nav-item">
            <span>⌁</span>
            Análises
          </a>

          <a className="nav-item">
            <span>⚙</span>
            Configurações
          </a>

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
            <h1>Hoje</h1>
            <p>Seu foco de hoje.</p>
          </div>

          <button className="focus-button">
            + Iniciar foco
          </button>
        </header>


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

      </main>

    </div>
  );
}

export default MainPage;