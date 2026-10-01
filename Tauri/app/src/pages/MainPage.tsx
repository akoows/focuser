import "./MainPage.css";
import { formatFocusTotal, formatTimer, useMainPage } from "./useMainPage";

const tabs = [
  { id: "today", label: "Hoje", icon: "⌂" },
  { id: "tasks", label: "Hábitos", icon: "◌" },
  { id: "goals", label: "Metas", icon: "◈" },
  { id: "analytics", label: "Análises", icon: "⌁" },
  { id: "settings", label: "Configurações", icon: "⚙" },
];

const tabDescriptions: Record<string, string> = {
  tasks: "Organize e acompanhe seus hábitos.",
  goals: "Defina objetivos e acompanhe seu progresso.",
  analytics: "Veja como você está usando seu tempo de foco.",
  settings: "Escolha a aparência do Focuser.",
};

const monthOptions = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: monthIndex,
  label: new Date(2024, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long" }),
}));

function MainPage() {
  const {
    activeTab,
    setActiveTab,
    isLightMode,
    setIsLightMode,
    tasks,
    selectedGoalHabitId,
    setSelectedGoalHabitId,
    selectedGoalHabit,
    isTaskDialogOpen,
    isTaskDialogClosing,
    editingTaskId,
    openTaskMenuId,
    setOpenTaskMenuId,
    closingTaskMenuId,
    setClosingTaskMenuId,
    deletingTaskId,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    timesPerWeek,
    setTimesPerWeek,
    isFocusActive,
    elapsedFocusSeconds,
    totalFocusSeconds,
    hoveredFocusDay,
    setHoveredFocusDay,
    todayKey,
    completedHabits,
    habitsProgress,
    chartMaxSeconds,
    chartLeft,
    chartRight,
    chartTop,
    chartBottom,
    chartPoints,
    weekDateKeys,
    monthCalendar,
    availableYears,
    handleMonthChange,
    handleYearChange,
    weekdayLabels,
    toggleTask,
    openNewTaskDialog,
    openEditTaskDialog,
    closeTaskDialog,
    handleTaskDialogAnimationEnd,
    closeTaskMenu,
    handleTaskMenuAnimationEnd,
    handleTaskRowAnimationEnd,
    handleSaveTask,
    deleteTask,
    startFocus,
    stopFocus,
  } = useMainPage();
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const selectedWeeklyCompletions = selectedGoalHabit
    ? selectedGoalHabit.completionDates.filter((date) => weekDateKeys.includes(date)).length
    : 0;
  const selectedWeeklyProgress = selectedGoalHabit
    ? Math.min(selectedWeeklyCompletions / selectedGoalHabit.timesPerWeek, 1) * 100
    : 0;
  const selectedCalendarCells = [
    ...Array.from({ length: monthCalendar.leadingEmptyDays }, (_, index) => ({
      key: `empty-${index}`,
      day: null,
      dateKey: null,
    })),
    ...monthCalendar.days.map((day) => ({
      key: day.dateKey,
      day: day.day,
      dateKey: day.dateKey,
    })),
  ];

  if (isFocusActive) {
    return (
      <main aria-label="Sessão de foco" className={`focus-mode ${isLightMode ? "light-theme" : ""}`}>
        <div className="focus-mode-brand">f<span>✦</span>cuser</div>
        <div className="focus-mode-content">
          <span className="focus-mode-label">SESSÃO DE FOCO</span>
          <output aria-live="off" className="focus-mode-timer">
            {formatTimer(elapsedFocusSeconds)}
          </output>
          <button className="focus-stop-button" onClick={stopFocus} type="button">
            Parar foco
          </button>
        </div>
        <p className="focus-mode-hint">Seu tempo será registrado ao encerrar a sessão.</p>
      </main>
    );
  }

  return (
    <div className={`main-page ${isLightMode ? "light-theme" : ""}`}>

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
            <button className="focus-button" onClick={startFocus} type="button">
              + Iniciar foco
            </button>
          )}
          {activeTab === "tasks" && (
            <button className="focus-button" onClick={openNewTaskDialog} type="button">
              + Adicionar hábito
            </button>
          )}
        </header>

        {activeTab === "today" ? <>
          <section className="stats">

          <div className="stat-card">
            <span className="stat-title">
              Hábitos do dia
            </span>

            <strong>{completedHabits} / {tasks.length}</strong>

            <div className="progress">
              <div className="progress-value" style={{ width: `${habitsProgress}%` }} />
            </div>
          </div>


          <div className="stat-card">
            <span className="stat-title">
              Meta semanal
            </span>

            <strong>0 / 7</strong>

            <div className="progress">
              <div className="progress-value" style={{ width: "0%" }} />
            </div>
          </div>


          <div className="stat-card">
            <span className="stat-title">
              Tempo de foco
            </span>

            <strong>{formatFocusTotal(totalFocusSeconds)}</strong>

            <small>0 min esta semana</small>
          </div>

          </section>


          <section className="focus-section">

          <div className="section-header">
            <div>
              <h2>Foco</h2>
              <p>Tempo total por dia nos últimos 7 dias.</p>
            </div>

            <span className="focus-time">
              {formatFocusTotal(totalFocusSeconds)}
            </span>
          </div>

          <div className="focus-chart">
            <svg
              aria-label="Tempo total de foco por dia nos últimos sete dias"
              className="focus-chart-svg"
              role="img"
              viewBox="0 0 720 190"
            >
              {[chartMaxSeconds, chartMaxSeconds / 2, 0].map((tick, index) => {
                const y = chartTop + ((chartBottom - chartTop) * index) / 2;

                return (
                  <g className="focus-chart-grid" key={tick}>
                    <line x1={chartLeft} x2={chartRight} y1={y} y2={y} />
                    <text dominantBaseline="middle" textAnchor="end" x={chartLeft - 10} y={y}>
                      {formatFocusTotal(Math.round(tick))}
                    </text>
                  </g>
                );
              })}

              <polyline
                className="focus-chart-line"
                points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              />

              {chartPoints.map((point) => {
                const tooltipWidth = 132;
                const tooltipX = Math.min(
                  chartRight - tooltipWidth,
                  Math.max(chartLeft, point.x - tooltipWidth / 2)
                );
                const tooltipY = point.y - chartTop > 52 ? point.y - 52 : point.y + 12;
                const isHovered = hoveredFocusDay === point.key;

                return (
                  <g
                    key={point.key}
                    onBlur={() => setHoveredFocusDay(null)}
                    onFocus={() => setHoveredFocusDay(point.key)}
                    onMouseEnter={() => setHoveredFocusDay(point.key)}
                    onMouseLeave={() => setHoveredFocusDay(null)}
                  >
                    <circle
                      aria-label={`${point.label}: ${formatFocusTotal(point.totalSeconds)}`}
                      className={`focus-chart-point ${isHovered ? "hovered" : ""}`}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      role="img"
                      tabIndex={0}
                    />
                    <text className="focus-chart-day" textAnchor="middle" x={point.x} y="176">
                      {point.label}
                    </text>
                    <g className={`focus-chart-tooltip ${isHovered ? "visible" : ""}`}>
                      <rect height="42" rx="4" width={tooltipWidth} x={tooltipX} y={tooltipY} />
                      <text className="focus-chart-tooltip-day" x={tooltipX + 10} y={tooltipY + 16}>
                        {point.label}
                      </text>
                      <text className="focus-chart-tooltip-time" x={tooltipX + 10} y={tooltipY + 33}>
                        {formatFocusTotal(point.totalSeconds)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          </section>


          <section className="tasks-section">

          <div className="section-header">
            <div>
              <h2>Hábitos</h2>
              <p>Hábitos para acompanhar hoje.</p>
            </div>

            <button className="add-button" onClick={openNewTaskDialog} type="button">
              + Adicionar hábito
            </button>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <div className={`task ${task.completionDates.includes(todayKey) ? "completed" : ""}`} key={task.id}>
                <button
                  aria-label={`${task.completionDates.includes(todayKey) ? "Desmarcar" : "Marcar"} ${task.title}`}
                  aria-pressed={task.completionDates.includes(todayKey)}
                  className={`task-check ${task.completionDates.includes(todayKey) ? "checked" : ""}`}
                  onClick={() => toggleTask(task.id)}
                  type="button"
                >
                  {task.completionDates.includes(todayKey) ? "✓" : ""}
                </button>

                <div>
                  <strong>{task.title}</strong>
                  <small>{task.description}</small>
                </div>
              </div>
            ))}
          </div>

          </section>
        </> : activeTab === "tasks" ? (
          <section aria-label="Todos os hábitos" className="all-tasks-section">
            {tasks.length === 0 ? (
              <div className="empty-tasks">
                <h2>Nenhum hábito ainda</h2>
                <p>Adicione um hábito para começar a organizar sua semana.</p>
                <button className="focus-button" onClick={openNewTaskDialog} type="button">
                  + Adicionar hábito
                </button>
              </div>
            ) : (
              <div className="all-task-list">
                {tasks.map((task) => (
                  <article
                    className={`all-task-row ${task.completionDates.includes(todayKey) ? "completed" : ""} ${deletingTaskId === task.id ? "deleting" : ""}`}
                    key={task.id}
                    onAnimationEnd={(event) => handleTaskRowAnimationEnd(event, task.id)}
                  >
                    <button
                      aria-label={`${task.completionDates.includes(todayKey) ? "Desmarcar" : "Marcar"} ${task.title}`}
                      aria-pressed={task.completionDates.includes(todayKey)}
                      className={`task-check ${task.completionDates.includes(todayKey) ? "checked" : ""}`}
                      onClick={() => toggleTask(task.id)}
                      type="button"
                    >
                      {task.completionDates.includes(todayKey) ? "✓" : ""}
                    </button>

                    <div className="all-task-copy">
                      <strong>{task.title}</strong>
                      <p>{task.description}</p>
                      <div className="all-task-meta">
                        <span>{task.timesPerWeek} {task.timesPerWeek === 1 ? "vez" : "vezes"} por semana</span>
                        <span>{task.completionDates.includes(todayKey) ? "Concluído hoje" : "Pendente hoje"}</span>
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        aria-controls={`task-options-${task.id}`}
                        aria-expanded={openTaskMenuId === task.id}
                        aria-label={`Mais opções para ${task.title}`}
                        className="task-more-button"
                        onClick={() => {
                          if (openTaskMenuId === task.id) {
                            closeTaskMenu(task.id);
                          } else {
                            setClosingTaskMenuId(null);
                            setOpenTaskMenuId(task.id);
                          }
                        }}
                        type="button"
                      >
                        <span aria-hidden="true">⋯</span>
                      </button>

                      {(openTaskMenuId === task.id || closingTaskMenuId === task.id) && (
                        <div
                          className={`task-options ${closingTaskMenuId === task.id ? "closing" : ""}`}
                          id={`task-options-${task.id}`}
                          onAnimationEnd={(event) => handleTaskMenuAnimationEnd(event, task.id)}
                        >
                          <button onClick={() => openEditTaskDialog(task)} type="button">Editar</button>
                          <button onClick={() => deleteTask(task.id)} type="button">Apagar</button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "goals" ? (
          <section aria-label="Metas dos hábitos" className="goals-section">
            <div className="month-overview-header">
              <div>
                <h2>Metas dos hábitos</h2>
                <p>Progresso semanal e panorama de {monthCalendar.title}</p>
              </div>
              <div className="month-picker">
                <label>
                  <span>Mês</span>
                  <select
                    aria-label="Selecionar mês do panorama"
                    onChange={(event) => handleMonthChange(Number(event.target.value))}
                    value={monthCalendar.monthIndex}
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>{month.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Ano</span>
                  <select
                    aria-label="Selecionar ano do panorama"
                    onChange={(event) => handleYearChange(Number(event.target.value))}
                    value={monthCalendar.year}
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="empty-tasks">
                <h2>Nenhum hábito para acompanhar</h2>
                <p>Adicione hábitos para ver seu progresso semanal e mensal.</p>
                <button className="focus-button" onClick={openNewTaskDialog} type="button">
                  + Adicionar hábito
                </button>
              </div>
            ) : (
              <div className="goals-workspace">
                <nav aria-label="Selecionar hábito" className="goal-habit-selector">
                  {tasks.map((habit) => (
                    <button
                      aria-pressed={selectedGoalHabitId === habit.id}
                      className={`goal-habit-option ${selectedGoalHabitId === habit.id ? "selected" : ""}`}
                      key={habit.id}
                      onClick={() => setSelectedGoalHabitId(habit.id)}
                      type="button"
                    >
                      <span>{habit.title}</span>
                      <small>{habit.timesPerWeek}× por semana</small>
                    </button>
                  ))}
                </nav>

                {selectedGoalHabit && (
                  <article className="goal-habit-detail" key={selectedGoalHabit.id}>
                    <header className="goal-habit-header">
                      <div>
                        <h3>{selectedGoalHabit.title}</h3>
                        <p>{selectedGoalHabit.description}</p>
                      </div>
                      <strong>
                        {selectedWeeklyCompletions} / {selectedGoalHabit.timesPerWeek}
                        <small> nesta semana</small>
                      </strong>
                    </header>

                    <div
                      aria-label={`${selectedWeeklyCompletions} de ${selectedGoalHabit.timesPerWeek} vezes realizadas nesta semana`}
                      className="goal-progress"
                      role="img"
                    >
                      <div className="goal-progress-value" style={{ width: `${selectedWeeklyProgress}%` }} />
                    </div>

                    <div className="goal-calendar-heading">
                      <h4>Panorama de {monthCalendar.title}</h4>
                      <span>{selectedGoalHabit.completionDates.filter((date) => date.startsWith(monthCalendar.value)).length} dias concluídos</span>
                    </div>

                    <div aria-label={`Calendário mensal de ${selectedGoalHabit.title}`} className="habit-month-calendar">
                      {weekdayLabels.map((weekday) => (
                        <span className="habit-calendar-weekday" key={weekday}>{weekday}</span>
                      ))}
                      {selectedCalendarCells.map((cell) => {
                        if (cell.day === null || cell.dateKey === null) {
                          return <span aria-hidden="true" className="habit-calendar-empty" key={cell.key} />;
                        }

                        const isCompleted = selectedGoalHabit.completionDates.includes(cell.dateKey);
                        const isToday = cell.dateKey === todayKey;

                        return (
                          <span
                            aria-label={`${cell.day} de ${monthCalendar.title}: ${isCompleted ? "concluído" : "não concluído"}`}
                            className={`habit-calendar-day ${isCompleted ? "completed" : ""} ${isToday ? "today" : ""}`}
                            key={cell.key}
                            title={`${cell.day}: ${isCompleted ? "Concluído" : "Não concluído"}`}
                          >
                            {cell.day}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                )}
              </div>
            )}
          </section>
        ) : activeTab === "settings" ? (
          <section aria-labelledby="settings-appearance-title" className="settings-section">
            <div className="settings-section-heading">
              <h2 id="settings-appearance-title">Aparência</h2>
              <p>Modo de exibição do aplicativo.</p>
            </div>

            <div className="appearance-setting">
              <div>
                <strong>Modo claro</strong>
                <small>{isLightMode ? "Ativado: claro" : "Desativado: escuro"}</small>
              </div>
              <label className="appearance-switch">
                <input
                  aria-label="Modo claro"
                  checked={isLightMode}
                  onChange={(event) => setIsLightMode(event.target.checked)}
                  role="switch"
                  type="checkbox"
                />
                <span aria-hidden="true" />
              </label>
            </div>
          </section>
        ) : (
          <section className="tab-placeholder">
            <h2>{activeTabInfo.label}</h2>
            <p>{tabDescriptions[activeTab]}</p>
          </section>
        )}

        {isTaskDialogOpen && (
          <div
            className={`task-dialog-backdrop ${isTaskDialogClosing ? "closing" : ""}`}
            onAnimationEnd={handleTaskDialogAnimationEnd}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeTaskDialog();
            }}
          >
            <section
              aria-labelledby="task-dialog-title"
              aria-modal="true"
              className="task-dialog"
              role="dialog"
            >
              <header className="task-dialog-header">
                <div>
                  <h2 id="task-dialog-title">{editingTaskId ? "Editar hábito" : "Novo hábito"}</h2>
                  <p>Defina o título, a descrição e a frequência semanal.</p>
                </div>
                <button
                  aria-label="Fechar"
                  className="task-dialog-close"
                  onClick={closeTaskDialog}
                  type="button"
                >
                  ×
                </button>
              </header>

              <form className="task-form" onSubmit={handleSaveTask}>
                <label htmlFor="task-title">Nome do hábito</label>
                <input
                  autoFocus
                  id="task-title"
                  maxLength={80}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Ex.: Ler um capítulo"
                  required
                  value={taskTitle}
                />

                <label htmlFor="task-description">Descrição</label>
                <textarea
                  id="task-description"
                  maxLength={300}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  placeholder="Descreva o que você quer fazer"
                  required
                  rows={3}
                  value={taskDescription}
                />

                <label htmlFor="task-frequency">Quantas vezes por semana?</label>
                <select
                  id="task-frequency"
                  onChange={(event) => setTimesPerWeek(Number(event.target.value))}
                  value={timesPerWeek}
                >
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {frequency} {frequency === 1 ? "vez" : "vezes"} por semana
                    </option>
                  ))}
                </select>

                <div className="task-form-actions">
                  <button
                    className="task-cancel-button"
                    onClick={closeTaskDialog}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="task-submit-button" type="submit">
                    {editingTaskId ? "Salvar alterações" : "Adicionar hábito"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

      </main>

    </div>
  );
}

export default MainPage;