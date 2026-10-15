import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  History,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
  TimerReset,
  Trophy,
  X,
} from 'lucide-react';
import { focuserApi } from '../services/focuserApi';
import './AcademyPage.css';

const TABS = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'plans', label: 'Fichas', icon: Dumbbell },
  { id: 'workout', label: 'Treino', icon: Play },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'evolution', label: 'Evolução', icon: BarChart3 },
];
const TIMER_STORAGE_KEY = 'focuser.gym.restTimer';

function createExercise() {
  return { name: '', plannedSets: 3, repTarget: '8-12', restSeconds: 90 };
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'long' }).format(new Date(value));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min${remainder ? ` ${remainder} s` : ''}`;
}

function readStoredTimer() {
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function SessionChart({ points }) {
  if (!points.length) {
    return <p className="muted-state gym-empty-hint">Registre séries concluídas para ver a evolução deste exercício.</p>;
  }
  const width = 720;
  const height = 220;
  const values = points.map((point) => point.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : 24 + (index / (points.length - 1)) * (width - 48),
    y: height - 24 - ((point.weight - min) / range) * (height - 48),
    point,
  }));
  const line = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="gym-chart-wrap">
      <svg className="gym-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolução das cargas de ${points[0].exerciseName || 'exercício'}`}>
        <line x1="24" y1={height - 24} x2={width - 24} y2={height - 24} className="gym-chart-axis" />
        <polyline points={line} className="gym-chart-line" />
        {coordinates.map(({ x, y, point }) => (
          <circle key={`${point.sessionId}-${x}`} cx={x} cy={y} r="5" className="gym-chart-point">
            <title>{`${formatDate(point.date)} · ${point.weight} kg`}</title>
          </circle>
        ))}
      </svg>
      <div className="gym-chart-labels">
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function PlanEditor({ plan, onSave, onCancel, isSaving, error }) {
  const [name, setName] = useState(plan?.name || '');
  const [exercises, setExercises] = useState(plan?.exercises?.map((exercise) => ({ ...exercise })) || []);
  const [formError, setFormError] = useState('');

  const updateExercise = (index, patch) => {
    setExercises((current) => current.map((exercise, itemIndex) => itemIndex === index
      ? { ...exercise, ...patch }
      : exercise));
  };

  const moveExercise = (index, offset) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= exercises.length) return;
    setExercises((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError('Dê um nome para esta ficha.');
      return;
    }
    if (exercises.some((exercise) => !exercise.name.trim())) {
      setFormError('Preencha o nome de todos os exercícios adicionados.');
      return;
    }
    setFormError('');
    onSave({
      name: name.trim(),
      exercises: exercises.map(({ id, name: exerciseName, plannedSets, repTarget, restSeconds }) => ({
        ...(id ? { id } : {}),
        name: exerciseName.trim(),
        plannedSets: Number(plannedSets),
        repTarget: repTarget.trim(),
        restSeconds: Number(restSeconds),
      })),
    });
  };

  return (
    <form className="card gym-plan-editor" onSubmit={submit}>
      <div className="gym-card-heading">
        <div>
          <h2>{plan ? 'Editar ficha' : 'Nova ficha'}</h2>
          <p className="muted-state">Monte uma rotina do seu jeito e organize a ordem dos exercícios.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Fechar edição" onClick={onCancel}><X size={18} /></button>
      </div>
      <label className="gym-field">
        <span>Nome da ficha</span>
        <input maxLength="80" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Treino A, Push, Pernas" required />
      </label>
      <div className="gym-editor-exercises">
        {exercises.map((exercise, index) => (
          <fieldset className="gym-exercise-fields" key={exercise.id || `exercise-${index}`}>
            <legend>Exercício {index + 1}</legend>
            <div className="gym-exercise-form-grid">
              <label className="gym-field gym-exercise-name">
                <span>Exercício</span>
                <input maxLength="100" value={exercise.name} onChange={(event) => updateExercise(index, { name: event.target.value })} placeholder="Ex.: Agachamento livre" />
              </label>
              <label className="gym-field">
                <span>Séries</span>
                <input type="number" min="1" max="30" value={exercise.plannedSets} onChange={(event) => updateExercise(index, { plannedSets: event.target.value })} />
              </label>
              <label className="gym-field">
                <span>Repetições</span>
                <input maxLength="30" value={exercise.repTarget} onChange={(event) => updateExercise(index, { repTarget: event.target.value })} placeholder="8-12" />
              </label>
              <label className="gym-field">
                <span>Descanso (s)</span>
                <input type="number" min="0" max="900" value={exercise.restSeconds} onChange={(event) => updateExercise(index, { restSeconds: event.target.value })} />
              </label>
            </div>
            <div className="gym-exercise-controls">
              <button type="button" className="icon-button" aria-label={`Mover exercício ${index + 1} para cima`} disabled={index === 0} onClick={() => moveExercise(index, -1)}><ArrowUp size={16} /></button>
              <button type="button" className="icon-button" aria-label={`Mover exercício ${index + 1} para baixo`} disabled={index === exercises.length - 1} onClick={() => moveExercise(index, 1)}><ArrowDown size={16} /></button>
              <button type="button" className="text-button danger-text" onClick={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>
            </div>
          </fieldset>
        ))}
        {!exercises.length ? <p className="muted-state gym-empty-hint">Adicione exercícios agora ou salve uma ficha vazia para preencher depois.</p> : null}
      </div>
      <button type="button" className="button button-secondary gym-inline-button" onClick={() => setExercises((current) => [...current, createExercise()])}><Plus size={17} /> Adicionar exercício</button>
      {formError || error ? <p className="error-text" role="alert">{formError || error}</p> : null}
      <div className="gym-form-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar ficha'}</button>
      </div>
    </form>
  );
}

function WorkoutSetRow({ session, exercise, set, previousSet, onSave, isSaving }) {
  const [weight, setWeight] = useState(set.weight == null ? '' : String(set.weight));
  const [reps, setReps] = useState(set.reps == null ? '' : String(set.reps));
  const [error, setError] = useState('');

  const save = async (completed) => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    if (weight === '' || reps === '' || !Number.isFinite(parsedWeight) || parsedWeight < 0 || !Number.isInteger(parsedReps) || parsedReps < 1) {
      setError('Informe uma carga válida e pelo menos 1 repetição.');
      return;
    }
    setError('');
    await onSave(exercise.id, set.id, { weight: parsedWeight, reps: parsedReps, completed }, completed ? exercise.restSeconds : 0);
  };

  return (
    <div className={`gym-set-row ${set.completed ? 'completed' : ''}`}>
      <span className="gym-set-number">{set.setNumber}</span>
      <label className="gym-field">
        <span>Carga (kg)</span>
        <input inputMode="decimal" type="number" min="0" max="100000" step="0.25" value={weight} onChange={(event) => setWeight(event.target.value)} aria-label={`Carga da série ${set.setNumber} de ${exercise.name}`} />
      </label>
      <label className="gym-field">
        <span>Repetições</span>
        <input inputMode="numeric" type="number" min="1" max="1000" step="1" value={reps} onChange={(event) => setReps(event.target.value)} aria-label={`Repetições da série ${set.setNumber} de ${exercise.name}`} />
      </label>
      {previousSet ? (
        <button type="button" className="gym-reference-button" onClick={() => { setWeight(String(previousSet.weight)); setReps(String(previousSet.reps)); }}>
          Anterior: {previousSet.weight} kg × {previousSet.reps}
        </button>
      ) : null}
      {set.completed
        ? <button type="button" className="gym-complete-set completed" onClick={() => save(false)} disabled={isSaving}><Check size={16} /> Concluída</button>
        : <button type="button" className="gym-complete-set" onClick={() => save(true)} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Registrar'}</button>}
      {error ? <span className="error-text gym-set-error" role="alert">{error}</span> : null}
    </div>
  );
}

function AcademyPage() {
  const [tab, setTab] = useState('overview');
  const [plans, setPlans] = useState([]);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [deletingExerciseId, setDeletingExerciseId] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingPlan, setEditingPlan] = useState(undefined);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busySetId, setBusySetId] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [plannedSets, setPlannedSets] = useState(3);
  const [repTarget, setRepTarget] = useState('8-12');
  const [restSeconds, setRestSeconds] = useState(90);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [repetitionView, setRepetitionView] = useState('session');
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [calendar, setCalendar] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedDaySessions, setSelectedDaySessions] = useState([]);
  const [timer, setTimer] = useState(readStoredTimer);
  const [now, setNow] = useState(Date.now());
  const [timerStorageError, setTimerStorageError] = useState('');
  const startingSession = useRef(false);
  const confirmationCancelRef = useRef(null);
  const confirmationBusyRef = useRef(false);

  const loadCore = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [plansResponse, activeResponse] = await Promise.all([
        focuserApi.gym.listPlans(),
        focuserApi.gym.activeSession(),
      ]);
      setPlans(plansResponse.items);
      setSession(activeResponse.session);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    if (!timer) {
      try {
        window.localStorage.removeItem(TIMER_STORAGE_KEY);
      } catch {
        setTimerStorageError('O cronômetro não pôde ser atualizado no armazenamento deste dispositivo.');
      }
      return;
    }
    try {
      window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
      setTimerStorageError('');
    } catch {
      setTimerStorageError('O cronômetro está ativo, mas não foi possível guardá-lo neste dispositivo.');
    }
  }, [timer]);
  useEffect(() => {
    if (!confirmation) return undefined;
    const previousFocus = document.activeElement;
    confirmationCancelRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !confirmationBusyRef.current) setConfirmation(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [confirmation]);
  useEffect(() => {
    if (timer && session && timer.sessionId !== session.id) setTimer(null);
  }, [session, timer]);

  useEffect(() => {
    if (tab !== 'overview' && tab !== 'evolution') return;
    let active = true;
    setStatsLoading(true);
    setStatsError('');
    focuserApi.gym.stats()
      .then((statsResponse) => {
        if (!active) return;
        setStats(statsResponse);
      })
      .catch((loadError) => { if (active) setStatsError(loadError.message); })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [tab, statsRefreshKey]);

  useEffect(() => {
    if ((tab !== 'overview' && tab !== 'evolution') || calendar) return;
    let active = true;
    focuserApi.gym.calendar()
      .then((response) => { if (active) setCalendar(response); })
      .catch((loadError) => { if (active) setStatsError(loadError.message); });
    return () => { active = false; };
  }, [calendar, tab]);

  useEffect(() => {
    if (tab !== 'history') return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    focuserApi.gym.listSessions({ page: String(historyPage), limit: '20' })
      .then((response) => {
        if (!active) return;
        setHistory(response.items);
        setHistoryPagination(response.pagination);
      })
      .catch((loadError) => { if (active) setHistoryError(loadError.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyPage, tab]);

  const sessionPrevious = useMemo(() => {
    const values = session?.previousByExercise || {};
    return (exerciseName) => values[exerciseName.toLocaleLowerCase()] || null;
  }, [session]);
  const focusedExercise = stats?.exercises?.find((exercise) => exercise.name === selectedExercise);
  const applySession = (nextSession) => {
    setSession((current) => ({
      ...nextSession,
      previousByExercise: nextSession.previousByExercise || current?.previousByExercise || {},
    }));
  };

  const savePlan = async (data) => {
    setSavingPlan(true);
    setPlanError('');
    try {
      const response = editingPlan?.id
        ? await focuserApi.gym.updatePlan(editingPlan.id, data)
        : await focuserApi.gym.createPlan(data);
      setPlans((current) => editingPlan?.id
        ? current.map((plan) => plan.id === response.plan.id ? response.plan : plan)
        : [response.plan, ...current]);
      setEditingPlan(undefined);
      setNotice('Ficha salva.');
    } catch (saveError) {
      setPlanError(saveError.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const removePlan = async (plan) => {
    setError('');
    try {
      await focuserApi.gym.removePlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      setNotice('Ficha excluída. O histórico de sessões foi preservado.');
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const startSession = async (planId) => {
    if (startingSession.current) return;
    startingSession.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await focuserApi.gym.startSession(planId ? { planId } : {});
      applySession(response.session);
      setTab('workout');
      setNotice(response.resumed
        ? 'Você já tinha uma sessão em andamento. Ela foi recuperada para continuar seu treino.'
        : 'Treino iniciado. Suas séries serão salvas na sessão atual.');
    } catch (startError) {
      setError(startError.message);
      if (startError.status === 409) {
        try {
          const activeResponse = await focuserApi.gym.activeSession();
          setSession(activeResponse.session);
          setTab('workout');
        } catch (refreshError) {
          setError(refreshError.message);
        }
      }
    } finally {
      startingSession.current = false;
      setBusy(false);
    }
  };

  const addExercise = async (event) => {
    event.preventDefault();
    if (!session || !exerciseName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await focuserApi.gym.addExercise(session.id, {
        name: exerciseName.trim(),
        plannedSets: Number(plannedSets),
        repTarget: repTarget.trim(),
        restSeconds: Number(restSeconds),
      });
      applySession(response.session);
      setExerciseName('');
      setPlannedSets(3);
      setRepTarget('8-12');
      setRestSeconds(90);
    } catch (addError) {
      setError(addError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSet = async (exerciseId, setId, data, restTime) => {
    setBusySetId(setId);
    setError('');
    try {
      const response = await focuserApi.gym.updateSet(session.id, exerciseId, setId, data);
      applySession(response.session);
      if (data.completed && restTime > 0) {
        setTimer({
          sessionId: session.id,
          exerciseId,
          endAt: Date.now() + restTime * 1000,
          remaining: restTime,
          paused: false,
        });
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusySetId('');
    }
  };

  const addSet = async (exerciseId) => {
    setBusy(true);
    setError('');
    try {
      const response = await focuserApi.gym.addSet(session.id, exerciseId);
      applySession(response.session);
    } catch (addError) {
      setError(addError.message);
    } finally {
      setBusy(false);
    }
  };

  const finishSession = async (abandon = false) => {
    if (!session || busy) return;
    if (abandon && !window.confirm('Abandonar este treino? Ele será preservado como não concluído e não contará no histórico ou nas estatísticas.')) return;
    setBusy(true);
    setError('');
    try {
      if (abandon) await focuserApi.gym.abandonSession(session.id);
      else await focuserApi.gym.completeSession(session.id);
      setSession(null);
      setTimer(null);
      setTab(abandon ? 'overview' : 'history');
      setNotice(abandon ? 'Treino abandonado e preservado como sessão incompleta.' : 'Treino concluído e adicionado ao histórico.');
    } catch (finishError) {
      setError(finishError.message);
    } finally {
      setBusy(false);
    }
  };

  const openHistorySession = async (id) => {
    setHistoryError('');
    try {
      const response = await focuserApi.gym.getSession(id);
      setSelectedHistory(response.session);
    } catch (loadError) {
      setHistoryError(loadError.message);
    }
  };

  const deleteAllHistory = async () => {
    setDeletingHistory(true);
    setHistoryError('');
    try {
      const response = await focuserApi.gym.deleteHistory();
      setHistory([]);
      setHistoryPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
      setHistoryPage(1);
      setSelectedHistory(null);
      setStats(null);
      setCalendar(null);
      setStatsRefreshKey((key) => key + 1);
      setNotice(`${response.deletedCount} ${response.deletedCount === 1 ? 'treino concluído apagado' : 'treinos concluídos apagados'}. Fichas e treino em andamento foram preservados.`);
    } catch (deleteError) {
      setHistoryError(deleteError.message);
    } finally {
      setDeletingHistory(false);
    }
  };

  const deleteHistoryExercise = async (exercise) => {
    if (!selectedHistory) return;
    setDeletingExerciseId(exercise.id);
    setHistoryError('');
    try {
      const response = await focuserApi.gym.removeSessionExercise(selectedHistory.id, exercise.id);
      setSelectedHistory(response.session);
      setHistory((current) => current.map((item) => item.id === response.session.id ? response.session : item));
      setStats(null);
      setCalendar(null);
      setStatsRefreshKey((key) => key + 1);
      setNotice(`“${exercise.name}” foi removido deste treino do histórico.`);
    } catch (deleteError) {
      setHistoryError(deleteError.message);
    } finally {
      setDeletingExerciseId('');
    }
  };

  const confirmPendingAction = async () => {
    if (!confirmation || confirmationBusy) return;
    confirmationBusyRef.current = true;
    setConfirmationBusy(true);
    try {
      await confirmation.onConfirm();
      setConfirmation(null);
    } finally {
      confirmationBusyRef.current = false;
      setConfirmationBusy(false);
    }
  };

  const openCalendarDay = async (day) => {
    setSelectedDay(day.date);
    setSelectedDaySessions([]);
    if (!day.count) return;
    try {
      const response = await focuserApi.gym.sessionsForDay(day.date);
      setSelectedDaySessions(response.items);
    } catch (loadError) {
      setStatsError(loadError.message);
    }
  };

  const timerRemaining = timer && !timer.paused
    ? Math.max(0, Math.ceil((timer.endAt - now) / 1000))
    : timer?.remaining || 0;
  const timerLabel = `${String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:${String(timerRemaining % 60).padStart(2, '0')}`;
  const timerExercise = session?.exercises?.find((exercise) => exercise.id === timer?.exerciseId);

  const startRestTimer = (seconds = timer?.remaining || 60) => {
    if (!timer) return;
    const duration = Math.max(0, Number(seconds) || 0);
    setTimer((current) => current && ({
      ...current,
      remaining: duration,
      endAt: Date.now() + duration * 1000,
      paused: false,
    }));
  };
  const beginRestTimer = (exerciseId, seconds) => {
    setTimer({
      sessionId: session.id,
      exerciseId,
      endAt: Date.now() + seconds * 1000,
      remaining: seconds,
      paused: false,
    });
  };
  const pauseRestTimer = () => setTimer((current) => current && ({
    ...current,
    remaining: Math.max(0, Math.ceil((current.endAt - Date.now()) / 1000)),
    paused: true,
  }));
  const adjustRestTimer = (offset) => {
    if (!timer) return;
    startRestTimer(Math.max(0, timerRemaining + offset));
  };

  const calendarCells = useMemo(() => {
    if (!calendar?.days) return [];
    const leading = new Date(`${calendar.from}T12:00:00`).getDay();
    return [...Array.from({ length: leading }, () => null), ...calendar.days];
  }, [calendar]);

  return (
    <div className="gym-page">
      <header className="page-header gym-page-header">
        <div>
          <p className="eyebrow">Treino e consistência</p>
          <h1>Academia</h1>
          <p className="section-subtitle">Organize suas fichas, registre cada série e acompanhe sua evolução real.</p>
        </div>
        {session ? <button type="button" className="button button-primary gym-resume-button" onClick={() => setTab('workout')}><Dumbbell size={17} /> Treino em andamento</button> : null}
      </header>

      {notice ? <div className="gym-notice" role="status">{notice}<button type="button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={16} /></button></div> : null}
      {error ? <div className="error-text gym-global-error" role="alert">{error}<button type="button" className="text-button" onClick={() => setError('')}>Fechar</button></div> : null}

      <nav className="gym-tabs" aria-label="Seções da Academia">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`gym-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </nav>

      {isLoading ? <div className="card state-card" role="status">Carregando sua Academia…</div> : null}

      {!isLoading && tab === 'overview' ? (
        <section className="gym-section">
          {session ? (
            <article className="card gym-active-callout">
              <div className="gym-active-icon"><Dumbbell size={22} /></div>
              <div><h2>{session.planName || 'Treino livre'} em andamento</h2><p className="muted-state">Iniciado {formatDate(session.startedAt, true)}. Continue de onde parou.</p></div>
              <button type="button" className="button button-primary" onClick={() => setTab('workout')}>Continuar treino</button>
            </article>
          ) : (
            <article className="card gym-start-callout">
              <div><h2>Pronto para o próximo treino?</h2><p className="muted-state">Comece com uma ficha existente ou registre um treino livre.</p></div>
              <div className="gym-callout-actions">
                <button type="button" className="button button-secondary" onClick={() => setTab('plans')}>Ver fichas</button>
                <button type="button" className="button button-primary" disabled={busy} onClick={() => startSession()}>Treino livre</button>
              </div>
            </article>
          )}
          {statsError ? <p className="error-text" role="alert">{statsError}</p> : null}
          <div className="gym-metrics-grid">
            <article className="card gym-metric"><span>Treinos nesta semana</span><strong>{stats?.weeklyCount ?? '—'}</strong><small>Somente sessões concluídas</small></article>
            <article className="card gym-metric"><span>Treinos neste mês</span><strong>{stats?.monthlyCount ?? '—'}</strong><small>Com base nos seus registros</small></article>
            <article className="card gym-metric"><span>Média de repetições</span><strong>{stats?.averageReps == null ? '—' : stats.averageReps.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong><small>{stats?.totalCompletedSets || 0} séries concluídas · últimos 365 dias</small></article>
          </div>
          <section className="card gym-calendar-card">
            <div className="gym-card-heading">
              <div><p className="eyebrow">Constância sem cobranças</p><h2>Seu calendário</h2><p className="muted-state">Dias com treinos concluídos nos últimos 12 meses.</p></div>
              <CalendarDays size={20} />
            </div>
            {calendar?.days?.length ? (
              <>
                <div className="gym-calendar" role="group" aria-label="Calendário de treinos dos últimos 365 dias">
                  {calendarCells.map((day, index) => day
                    ? <button key={day.date} type="button" className={`gym-calendar-day level-${Math.min(day.count, 4)} ${selectedDay === day.date ? 'selected' : ''}`} title={`${day.date}: ${day.count} ${day.count === 1 ? 'treino concluído' : 'treinos concluídos'}`} aria-label={`${formatDate(`${day.date}T12:00:00`)}: ${day.count} treinos concluídos`} onClick={() => openCalendarDay(day)} />
                    : <span key={`blank-${index}`} className="gym-calendar-day blank" aria-hidden="true" />)}
                </div>
                <div className="gym-calendar-legend"><span>Menos</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>Mais</span></div>
              </>
            ) : <p className="muted-state gym-empty-hint">Os dias de treino aparecerão aqui depois que você concluir sua primeira sessão.</p>}
            {selectedDay ? (
              <div className="gym-day-detail">
                <h3>{formatDate(`${selectedDay}T12:00:00`)}</h3>
                {selectedDaySessions.length
                  ? selectedDaySessions.map((item) => <button className="gym-day-session" key={item.id} onClick={() => { setTab('history'); setSelectedHistory(item); }} type="button">{item.planName || 'Treino livre'} · {formatDate(item.completedAt, true)}</button>)
                  : <p className="muted-state">Nenhum treino concluído neste dia.</p>}
              </div>
            ) : null}
          </section>
          <section className="card gym-quick-plans">
            <div className="gym-card-heading"><div><h2>Suas fichas</h2><p className="muted-state">Acesse rapidamente uma rotina salva.</p></div><button type="button" className="text-button" onClick={() => setTab('plans')}>Ver todas</button></div>
            {plans.length
              ? <div className="gym-quick-plan-list">{plans.slice(0, 4).map((plan) => <button key={plan.id} type="button" className="gym-quick-plan" disabled={busy || Boolean(session)} onClick={() => startSession(plan.id)}><span><strong>{plan.name}</strong><small>{plan.exercises.length} exercícios</small></span><Play size={16} /></button>)}</div>
              : <p className="muted-state">Você ainda não criou fichas. <button type="button" className="text-button" onClick={() => { setTab('plans'); setEditingPlan(null); }}>Criar uma ficha</button></p>}
          </section>
        </section>
      ) : null}

      {!isLoading && tab === 'plans' ? (
        <section className="gym-section">
          {editingPlan !== undefined ? (
            <PlanEditor plan={editingPlan} onSave={savePlan} onCancel={() => { setEditingPlan(undefined); setPlanError(''); }} isSaving={savingPlan} error={planError} />
          ) : (
            <div className="gym-card-heading gym-plan-heading">
              <div><h2>Fichas de treino</h2><p className="muted-state">As fichas organizam seus exercícios; as sessões concluídas ficam guardadas no histórico.</p></div>
              <button type="button" className="button button-primary" onClick={() => { setPlanError(''); setEditingPlan(null); }}><Plus size={17} /> Nova ficha</button>
            </div>
          )}
          {plans.length ? <div className="gym-plan-grid">{plans.map((plan) => (
            <article className="card gym-plan-card" key={plan.id}>
              <div className="gym-card-heading"><div><h3>{plan.name}</h3><span className="muted-state">{plan.exercises.length} exercícios</span></div><Dumbbell size={19} /></div>
              {plan.exercises.length
                ? <ol className="gym-plan-exercises">{plan.exercises.map((exercise) => <li key={exercise.id}><span>{exercise.name}</span><small>{exercise.plannedSets} × {exercise.repTarget} · {exercise.restSeconds}s</small></li>)}</ol>
                : <p className="muted-state">Esta ficha ainda não tem exercícios.</p>}
              <div className="gym-plan-actions">
                <button type="button" className="button button-primary" disabled={busy || Boolean(session)} onClick={() => startSession(plan.id)}><Play size={16} /> Iniciar</button>
                <button type="button" className="button button-secondary" onClick={() => { setPlanError(''); setEditingPlan(plan); }}>Editar</button>
                <button type="button" className="gym-delete-plan" aria-label={`Excluir ficha ${plan.name}`} title="Excluir ficha" onClick={() => setConfirmation({ title: `Excluir ficha “${plan.name}”?`, description: 'A ficha será removida, mas os treinos já realizados e o histórico serão preservados.', confirmLabel: 'Excluir ficha', onConfirm: () => removePlan(plan) })}><Trash2 size={16} /><span>Excluir</span></button>
              </div>
            </article>
          ))}</div> : editingPlan === undefined ? (
            <div className="card state-card gym-empty-card"><Dumbbell size={25} /><h3>Nenhuma ficha criada</h3><p>Crie sua própria divisão e adicione exercícios, séries, repetições e intervalos de descanso.</p><button type="button" className="button button-primary" onClick={() => { setPlanError(''); setEditingPlan(null); }}><Plus size={17} /> Criar primeira ficha</button></div>
          ) : null}
          {session ? <p className="muted-state">Um treino já está em andamento. Conclua ou abandone-o antes de iniciar outra ficha.</p> : null}
        </section>
      ) : null}

      {!isLoading && tab === 'workout' ? (
        <section className="gym-section">
          {!session ? (
            <div className="card state-card gym-empty-card"><Dumbbell size={25} /><h2>Nenhum treino em andamento</h2><p>Escolha uma ficha ou comece um treino livre. O Focuser salva suas sessões para você continuar depois.</p><div className="gym-callout-actions"><button type="button" className="button button-secondary" onClick={() => setTab('plans')}>Escolher ficha</button><button type="button" className="button button-primary" disabled={busy} onClick={() => startSession()}>Iniciar treino livre</button></div></div>
          ) : (
            <>
              <article className="card gym-session-heading">
                <div><p className="eyebrow">Sessão em andamento</p><h2>{session.planName || 'Treino livre'}</h2><p className="muted-state">Iniciado {formatDate(session.startedAt, true)} · {session.exercises.length} exercícios</p></div>
                <div className="gym-session-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => finishSession(true)}><X size={16} /> Abandonar</button><button type="button" className="button button-primary" disabled={busy} onClick={() => finishSession(false)}><Check size={16} /> Concluir treino</button></div>
              </article>
              {timer ? (
                <section className="card gym-timer" aria-live="polite">
                  <div className="gym-timer-info"><Clock3 size={21} /><div><span>Descanso {timerExercise ? `· ${timerExercise.name}` : ''}</span><strong>{timerLabel}</strong></div></div>
                  <div className="gym-timer-controls">
                    <button type="button" className="icon-button" aria-label="Diminuir 15 segundos" onClick={() => adjustRestTimer(-15)}>−15s</button>
                    <button type="button" className="icon-button" aria-label={timer.paused ? 'Retomar descanso' : 'Pausar descanso'} onClick={() => timer.paused ? startRestTimer(timer.remaining) : pauseRestTimer()}>{timer.paused ? <Play size={17} /> : <Pause size={17} />}</button>
                    <button type="button" className="icon-button" aria-label="Aumentar 15 segundos" onClick={() => adjustRestTimer(15)}>+15s</button>
                    <button type="button" className="icon-button" aria-label="Reiniciar descanso" onClick={() => startRestTimer(timer.remaining || 60)}><TimerReset size={17} /></button>
                    <button type="button" className="icon-button" aria-label="Pular descanso" onClick={() => setTimer(null)}><SkipForward size={17} /></button>
                  </div>
                  <p className="gym-timer-hint">{timerRemaining === 0 ? 'Descanso concluído.' : timer.paused ? 'Cronômetro pausado.' : 'O cronômetro continua enquanto você navega pela Academia.'}</p>
                  {timerStorageError ? <p className="muted-state gym-timer-hint">{timerStorageError}</p> : null}
                </section>
              ) : null}
              {session.exercises.map((exercise) => {
                const previous = sessionPrevious(exercise.name);
                return (
                  <article className="card gym-session-exercise" key={exercise.id}>
                    <div className="gym-card-heading"><div><h3>{exercise.order + 1}. {exercise.name}</h3><p className="muted-state">{exercise.plannedSets} × {exercise.repTarget} · descanso recomendado {exercise.restSeconds}s</p></div><span className="gym-exercise-progress">{exercise.sets.filter((set) => set.completed).length}/{exercise.sets.length} séries</span></div>
                    {previous ? <p className="gym-previous-reference">Último treino ({formatDate(previous.date)}): {previous.sets.map((set) => `${set.weight} kg × ${set.reps}`).join(' · ')}</p> : null}
                    {exercise.restSeconds > 0 ? <button type="button" className="text-button gym-add-set" onClick={() => beginRestTimer(exercise.id, exercise.restSeconds)}><Clock3 size={15} /> Iniciar descanso de {exercise.restSeconds}s</button> : null}
                    <div className="gym-set-list">{exercise.sets.map((set) => (
                      <WorkoutSetRow key={set.id} session={session} exercise={exercise} set={set} previousSet={previous?.sets.find((item) => item.setNumber === set.setNumber)} isSaving={busySetId === set.id} onSave={saveSet} />
                    ))}</div>
                    <button type="button" className="text-button gym-add-set" disabled={busy} onClick={() => addSet(exercise.id)}><Plus size={15} /> Adicionar série</button>
                  </article>
                );
              })}
              <form className="card gym-add-exercise" onSubmit={addExercise}>
                <h3>Adicionar exercício à sessão</h3>
                <div className="gym-add-exercise-grid">
                  <label className="gym-field"><span>Exercício</span><input maxLength="100" value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Nome do exercício" required /></label>
                  <label className="gym-field"><span>Séries</span><input type="number" min="1" max="30" value={plannedSets} onChange={(event) => setPlannedSets(event.target.value)} /></label>
                  <label className="gym-field"><span>Repetições</span><input maxLength="30" value={repTarget} onChange={(event) => setRepTarget(event.target.value)} /></label>
                  <label className="gym-field"><span>Descanso (s)</span><input type="number" min="0" max="900" value={restSeconds} onChange={(event) => setRestSeconds(event.target.value)} /></label>
                  <button type="submit" className="button button-secondary" disabled={busy}><Plus size={16} /> Adicionar</button>
                </div>
              </form>
            </>
          )}
        </section>
      ) : null}

      {!isLoading && tab === 'history' ? (
        <section className="gym-section">
          <div className="gym-card-heading gym-history-heading"><div><h2>Histórico de treinos</h2><p className="muted-state">Somente sessões concluídas aparecem aqui. Sessões abandonadas são preservadas, mas não contabilizadas.</p></div>{historyPagination?.total ? <button type="button" className="gym-delete-history" disabled={deletingHistory} onClick={() => setConfirmation({ title: 'Apagar todo o histórico?', description: 'Esta ação remove permanentemente todas as sessões concluídas. Fichas e treinos em andamento serão preservados.', confirmLabel: 'Apagar histórico', onConfirm: deleteAllHistory })}><Trash2 size={16} />{deletingHistory ? 'Apagando…' : 'Apagar histórico'}</button> : <History size={20} />}</div>
          {historyLoading ? <div className="card state-card" role="status">Carregando seu histórico…</div> : null}
          {historyError ? <p className="error-text" role="alert">{historyError}</p> : null}
          {selectedHistory ? (
            <article className="card gym-history-detail">
              <div className="gym-card-heading"><div><p className="eyebrow">{formatDate(selectedHistory.completedAt, true)}</p><h2>{selectedHistory.planName || 'Treino livre'}</h2><p className="muted-state">Duração: {formatDuration(selectedHistory.durationSeconds)}</p></div><button type="button" className="button button-secondary" onClick={() => setSelectedHistory(null)}><ChevronLeft size={16} /> Voltar à lista</button></div>
              {selectedHistory.exercises.map((exercise) => (
                <section className="gym-history-exercise" key={exercise.id}>
                  <div className="gym-history-exercise-heading"><h3>{exercise.order + 1}. {exercise.name}</h3><button type="button" className="gym-delete-exercise" disabled={deletingExerciseId === exercise.id} onClick={() => setConfirmation({ title: `Apagar “${exercise.name}” deste treino?`, description: 'O exercício será removido somente desta sessão e das estatísticas correspondentes. Ele continuará nas outras sessões e fichas.', confirmLabel: 'Apagar exercício', onConfirm: () => deleteHistoryExercise(exercise) })} aria-label={`Apagar ${exercise.name} desta sessão`} title="Apagar este exercício desta sessão"><Trash2 size={15} />{deletingExerciseId === exercise.id ? 'Apagando…' : 'Apagar exercício'}</button></div>
                  {exercise.sets.filter((set) => set.completed).length
                    ? <ul>{exercise.sets.filter((set) => set.completed).map((set) => <li key={set.id}>Série {set.setNumber}: {set.weight} kg × {set.reps}</li>)}</ul>
                    : <p className="muted-state">Nenhuma série concluída.</p>}
                </section>
              ))}
            </article>
          ) : historyLoading ? null : history.length ? (
            <div className="gym-history-list">{history.map((item) => (
              <button type="button" className="card gym-history-row" key={item.id} onClick={() => openHistorySession(item.id)}>
                <span className="gym-history-icon"><Dumbbell size={18} /></span>
                <span className="gym-history-summary"><strong>{item.planName || 'Treino livre'}</strong><small>{formatDate(item.completedAt, true)} · {formatDuration(item.durationSeconds)} · {item.exercises.length} exercícios</small><small>{item.exercises.map((exercise) => exercise.name).join(' · ') || 'Sem exercícios registrados'}</small></span>
                <ChevronRight size={18} />
              </button>
            ))}</div>
          ) : <div className="card state-card gym-empty-card"><History size={25} /><h3>Ainda sem treinos concluídos</h3><p>Conclua uma sessão para ver os exercícios, as séries, as repetições, as cargas e a duração aqui.</p><button type="button" className="button button-primary" onClick={() => session ? setTab('workout') : setTab('plans')}>{session ? 'Continuar treino' : 'Ver fichas'}</button></div>}
          {historyPagination?.totalPages > 1 && !selectedHistory ? <div className="gym-pagination"><button type="button" className="button button-secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}><ChevronLeft size={16} /> Anterior</button><span>Página {historyPage} de {historyPagination.totalPages}</span><button type="button" className="button button-secondary" disabled={historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage((page) => page + 1)}>Próxima <ChevronRight size={16} /></button></div> : null}
        </section>
      ) : null}

      {!isLoading && tab === 'evolution' ? (
        <section className="gym-section">
          <div className="gym-card-heading"><div><h2>Evolução e recordes</h2><p className="muted-state">Indicadores calculados apenas a partir das suas séries concluídas.</p></div><Trophy size={20} /></div>
          {statsLoading ? <div className="card state-card" role="status">Calculando sua evolução…</div> : null}
          {statsError ? <p className="error-text" role="alert">{statsError}</p> : null}
          {statsLoading || statsError ? null : stats?.exercises?.length ? (
            <>
              <label className="gym-field gym-exercise-select"><span>Exercício</span><select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}><option value="">Todos os exercícios</option>{stats.exercises.map((exercise) => <option key={exercise.name} value={exercise.name}>{exercise.name}</option>)}</select></label>
              {selectedExercise && focusedExercise ? (
                <div className="gym-evolution-grid">
                  <article className="card gym-chart-card"><div className="gym-card-heading"><div><h3>Cargas ao longo do tempo</h3><p className="muted-state">Maior carga válida por sessão, em kg.</p></div><BarChart3 size={18} /></div><SessionChart points={focusedExercise.history} /></article>
                  <article className="card gym-record-card"><h3>Recordes registrados</h3><strong>{focusedExercise.bestWeight} kg</strong><span>Maior carga concluída</span>{focusedExercise.bestSet ? <p>Melhor série: {focusedExercise.bestSet.weight} kg × {focusedExercise.bestSet.reps}<br /><small>1RM estimada: {focusedExercise.bestSet.estimatedOneRepMax.toFixed(1)} kg · fórmula de Epley</small></p> : <p className="muted-state">Ainda não há séries com carga positiva e até 12 repetições para estimar 1RM.</p>}</article>
                </div>
              ) : (
                <div className="gym-exercise-stat-list">{stats.exercises.map((exercise) => <button className="card gym-exercise-stat" key={exercise.name} type="button" onClick={() => setSelectedExercise(exercise.name)}><span><strong>{exercise.name}</strong><small>{exercise.history.length} sessões registradas</small></span><span>Máx. {exercise.bestWeight} kg <ChevronRight size={16} /></span></button>)}</div>
              )}
              <article className="card gym-volume-card"><div className="gym-card-heading"><div><h3>Média de repetições</h3><p className="muted-state">Média por série concluída, calculada com os registros reais.</p></div><div className="gym-volume-controls">{[['session', 'Sessões'], ['week', 'Semanas'], ['month', 'Meses']].map(([id, label]) => <button type="button" key={id} className={`gym-volume-toggle ${repetitionView === id ? 'active' : ''}`} aria-pressed={repetitionView === id} onClick={() => setRepetitionView(id)}>{label}</button>)}</div></div>{(() => {
                const items = repetitionView === 'session' ? stats.repetitionsBySession.slice(-10).reverse()
                  : repetitionView === 'week' ? stats.repetitionsByWeek.slice(-10).reverse()
                    : stats.repetitionsByMonth.slice(-10).reverse();
                return items.length ? <div className="gym-volume-list">{items.map((item) => <div className="gym-volume-row" key={item.sessionId || item.period}><span>{repetitionView === 'session' ? `${formatDate(item.date)} · ${item.planName || 'Treino livre'} · ${item.sets} séries` : `${repetitionView === 'week' ? 'Semana de' : 'Mês'} ${item.period} · ${item.sessions} treinos · ${item.sets} séries`}</span><strong>{item.averageReps.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} reps</strong></div>)}</div> : <p className="muted-state">Não há séries concluídas neste período para calcular a média.</p>;
              })()}</article>
              {stats.truncated ? <p className="muted-state">As estatísticas mostram até 500 sessões recentes dos últimos 365 dias.</p> : null}
            </>
          ) : (
            <div className="card state-card gym-empty-card"><BarChart3 size={25} /><h3>Sem dados de evolução ainda</h3><p>Quando você concluir treinos com séries registradas, verá aqui cargas, recordes, médias de repetições e estimativas baseados nos seus dados.</p><button type="button" className="button button-primary" onClick={() => session ? setTab('workout') : setTab('plans')}>{session ? 'Continuar treino' : 'Começar com uma ficha'}</button></div>
          )}
        </section>
      ) : null}

      {confirmation ? (
        <div className="gym-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirmationBusy) setConfirmation(null); }}>
          <section className="gym-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gym-confirm-title" aria-describedby="gym-confirm-description">
            <div className="gym-confirm-icon"><Trash2 size={20} /></div>
            <p className="eyebrow">CONFIRMAÇÃO</p>
            <h2 id="gym-confirm-title">{confirmation.title}</h2>
            <p id="gym-confirm-description" className="gym-confirm-description">{confirmation.description}</p>
            <div className="gym-confirm-actions">
              <button ref={confirmationCancelRef} type="button" className="button button-secondary" disabled={confirmationBusy} onClick={() => setConfirmation(null)}>Cancelar</button>
              <button type="button" className="button gym-confirm-delete" disabled={confirmationBusy} onClick={confirmPendingAction}><Trash2 size={16} />{confirmationBusy ? 'Aguarde…' : confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default AcademyPage;
