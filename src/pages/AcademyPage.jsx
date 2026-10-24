import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transitionUI } from '../utils/transitionUI';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  History,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  Trash2,
  Trophy,
  TrendingUp,
  Weight,
  X,
} from 'lucide-react';
import NumberInput from '../components/NumberInput';
import { focuserApi } from '../services/focuserApi';
import { loadAcademySections, readWorkoutTimer, workoutSessionStorageKey } from './academy/academyDataLoader';
import { createCalendarDayLoader } from './academy/calendarDayLoader';
import './AcademyPage.css';

const EMPTY_EXERCISE = { name: '', plannedSets: 3, repTarget: '8-12', restSeconds: 90 };
const ACADEMY_TODAY = new Date();
const NAV_ITEMS = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'plans', label: 'Fichas', icon: BookOpen },
  { id: 'workout', label: 'Treino ativo', icon: Dumbbell },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'progress', label: 'Evolução', icon: TrendingUp },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
];

function dateLabel(value, options = { dateStyle: 'medium' }) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', options);
}

function dateTimeLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}min` : `${minutes}min ${remainder.toString().padStart(2, '0')}s`;
}

function exerciseImageKey(name) {
  return name.trim().toLocaleLowerCase();
}

function ExerciseThumbnail({ name, imageUrl }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0] || '').join('').toLocaleUpperCase();
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <span
      className="academy-exercise-thumbnail"
      role="img"
      aria-label={showImage ? `Demonstração de ${name}` : `Imagem indisponível para ${name}; exibindo iniciais`}
      title={showImage ? `Demonstração de ${name}` : 'Imagem indisponível'}
    >
      {showImage
        ? <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}

function emptyPlanForm() {
  return { name: '', exercises: [{ ...EMPTY_EXERCISE }] };
}

function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <article className="metric-card card academy-stat-card">
      <div className="metric-top"><span className="metric-label">{label}</span><Icon size={17} /></div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function VolumeChart({ series }) {
  if (!series.length) {
    return <p className="muted-state">Ainda não há séries válidas concluídas para mostrar volume.</p>;
  }
  const width = 640;
  const height = 190;
  const padding = { top: 16, right: 14, bottom: 32, left: 14 };
  const max = Math.max(1, ...series.map((item) => item.volume));
  const points = series.map((item, index) => ({
    ...item,
    x: padding.left + (series.length === 1 ? (width - padding.left - padding.right) / 2 : index * (width - padding.left - padding.right) / (series.length - 1)),
    y: height - padding.bottom - (item.volume / max) * (height - padding.top - padding.bottom),
  }));
  const path = points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  return (
    <div className="academy-chart-wrap">
      <svg className="academy-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de evolução do volume de treino">
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="academy-chart-axis" />
        <path d={path} className="academy-chart-line" />
        {points.map((point) => (
          <g key={point.period}>
            <circle cx={point.x} cy={point.y} r="4" className="academy-chart-point" />
            <text x={point.x} y={height - 9} textAnchor="middle" className="academy-chart-label">{point.label}</text>
          </g>
        ))}
      </svg>
      <div className="academy-chart-legend"><span>Volume (kg × repetições)</span><span>Pico: {Math.round(max).toLocaleString('pt-BR')}</span></div>
    </div>
  );
}

function ExerciseChart({ exercise }) {
  if (!exercise?.history?.length) {
    return <p className="muted-state">Este exercício ainda não tem histórico. Conclua séries registrando a carga para acompanhar a evolução.</p>;
  }
  const history = exercise.history.slice(-30);
  const width = 640;
  const height = 190;
  const padding = { top: 18, right: 14, bottom: 34, left: 14 };
  const max = Math.max(1, ...history.map((entry) => entry.weight));
  const points = history.map((entry, index) => ({
    ...entry,
    x: padding.left + (history.length === 1 ? (width - padding.left - padding.right) / 2 : index * (width - padding.left - padding.right) / (history.length - 1)),
    y: height - padding.bottom - (entry.weight / max) * (height - padding.top - padding.bottom),
  }));
  const path = points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  return (
    <div className="academy-chart-wrap">
      <svg className="academy-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Histórico de carga para ${exercise.name}`}>
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="academy-chart-axis" />
        <path d={path} className="academy-chart-line" />
        {points.map((point) => (
          <g key={`${point.sessionId}-${point.date}`}>
            <circle cx={point.x} cy={point.y} r="4" className="academy-chart-point" />
            <text x={point.x} y={height - 9} textAnchor="middle" className="academy-chart-label">{dateLabel(point.date, { day: '2-digit', month: '2-digit' })}</text>
            <title>{`${dateLabel(point.date)}: ${point.weight} kg, média de ${point.averageReps.toFixed(1)} repetições`}</title>
          </g>
        ))}
      </svg>
      <div className="academy-chart-legend"><span>Carga máxima por sessão (kg)</span><span>Máxima: {exercise.bestWeight} kg</span></div>
    </div>
  );
}

function SessionExercise({ exercise, session, imageUrl, onAddSet, busy, draftSets, onDraftChange, onCompleteSet, onSaveSet, onRest }) {
  const previous = session.previousByExercise?.[exercise.name.trim().toLocaleLowerCase()];
  return (
    <article className="card academy-exercise-card">
      <header className="academy-exercise-heading">
        <div className="academy-exercise-heading-main">
          <ExerciseThumbnail key={`${exercise.name}-${imageUrl || 'initials'}`} name={exercise.name} imageUrl={imageUrl} />
          <div>
            <p className="eyebrow">EXERCÍCIO {exercise.order + 1}</p>
            <h3>{exercise.name}</h3>
            <p className="muted-state">{exercise.plannedSets} séries planejadas · {exercise.repTarget} repetições · descanso {exercise.restSeconds}s</p>
          </div>
        </div>
        <button type="button" className="button button-secondary academy-small-button" onClick={() => onAddSet(exercise)} disabled={busy || exercise.sets.length >= 30}>
          <Plus size={15} /> Série
        </button>
      </header>
      {previous?.sets?.length ? (
        <div className="academy-previous-reference">
          <strong>Último treino · {dateLabel(previous.date)}</strong>
          <span>{previous.sets.map((set) => `${set.weight} kg × ${set.reps}`).join('  ·  ')}</span>
          <button type="button" className="text-button" onClick={() => {
            previous.sets.forEach((set, index) => {
              const targetSet = exercise.sets[index];
              if (targetSet && !targetSet.completed) {
                onDraftChange(targetSet.id, { weight: String(set.weight), reps: String(set.reps) });
              }
            });
          }}>Usar como referência</button>
        </div>
      ) : null}
      <div className="academy-set-table" role="table" aria-label={`Séries de ${exercise.name}`}>
        <div className="academy-set-row academy-set-header" role="row">
          <span role="columnheader">Série</span><span role="columnheader">Carga (kg)</span><span role="columnheader">Repetições</span><span role="columnheader">Concluir</span>
        </div>
        {exercise.sets.map((set) => {
          const draft = draftSets[set.id] || { weight: set.weight ?? '', reps: set.reps ?? '' };
          return (
            <div
              className={`academy-set-row${set.completed ? ' is-completed' : ''}`}
              role="row"
              key={set.id}
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget) || event.relatedTarget?.closest('.academy-set-complete') || set.completed) return;
                if (draft.weight !== '' && draft.reps !== '') onSaveSet(exercise, set, draft);
              }}
            >
              <span className="academy-set-number" role="cell">{set.setNumber}</span>
              <NumberInput aria-label={`carga da série ${set.setNumber} de ${exercise.name}`} min="0" step="0.25" value={draft.weight} disabled={busy || set.completed} onValueChange={(value) => onDraftChange(set.id, { weight: value, reps: draft.reps })} />
              <NumberInput aria-label={`repetições da série ${set.setNumber} de ${exercise.name}`} min="1" step="1" value={draft.reps} disabled={busy || set.completed} onValueChange={(value) => onDraftChange(set.id, { weight: draft.weight, reps: value })} />
              {set.completed ? (
                <span className="academy-set-done" role="cell" aria-label="Série concluída"><Check size={17} /></span>
              ) : (
                <button type="button" className="academy-set-complete" aria-label={`Concluir série ${set.setNumber}`} disabled={busy || draft.weight === '' || draft.reps === ''} onClick={() => onCompleteSet(exercise, set, draft)}>
                  <Check size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {exercise.sets.some((set) => set.completed) ? (
        <button type="button" className="button button-ghost academy-rest-trigger" onClick={() => onRest(exercise.restSeconds)}>
          <Timer size={15} /> Iniciar descanso de {exercise.restSeconds}s
        </button>
      ) : null}
    </article>
  );
}

function WorkoutSessionCard({ session, exerciseImages, onRemoveExercise, busy, onOpen }) {
  return (
    <article className="card academy-history-card">
      <button type="button" className="academy-history-toggle" aria-expanded={session.open} onClick={() => onOpen(session.id)}>
        <span className="academy-history-date">{dateTimeLabel(session.completedAt)}</span>
        <span>{session.planName || 'Treino livre'}</span>
        <span>{session.exercises.length} exercícios</span>
        <span>{formatDuration(session.durationSeconds)}</span>
        <ChevronDown size={17} />
      </button>
      {session.open ? (
        <div className="academy-history-detail">
          {!session.exercises.length ? <p className="muted-state">Esta sessão não contém exercícios registrados.</p> : null}
          {session.exercises.map((exercise) => (
            <div className="academy-history-exercise" key={exercise.id}>
              <ExerciseThumbnail key={`${exercise.name}-${exerciseImages[exerciseImageKey(exercise.name)] || 'initials'}`} name={exercise.name} imageUrl={exerciseImages[exerciseImageKey(exercise.name)]} />
              <div><strong>{exercise.name}</strong><small>{exercise.sets.filter((set) => set.completed).map((set) => `${set.weight} kg × ${set.reps}`).join(' · ') || 'Sem séries concluídas'}</small></div>
              <button type="button" className="text-button" aria-label={`Apagar ${exercise.name} desta sessão`} title="Apagar exercício desta sessão" disabled={busy} onClick={() => onRemoveExercise(session, exercise)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function AcademyModule({ confirm, PageHeader }) {
  const [section, setSection] = useState('overview');
  const [plans, setPlans] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [planForm, setPlanForm] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [volumePeriod, setVolumePeriod] = useState('session');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [openHistoryId, setOpenHistoryId] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [daySessions, setDaySessions] = useState([]);
  const [daySessionsError, setDaySessionsError] = useState('');
  const [isLoadingDaySessions, setIsLoadingDaySessions] = useState(false);
  const [draftSets, setDraftSets] = useState({});
  const [timer, setTimer] = useState(null);
  const [timerNow, setTimerNow] = useState(0);
  const [addExerciseForm, setAddExerciseForm] = useState(null);
  const [exerciseImages, setExerciseImages] = useState({});
  const requestedExerciseImages = useRef(new Set());
  const calendarDayLoader = useMemo(() => createCalendarDayLoader(focuserApi.gym.calendarDay), []);

  const loadData = useCallback(async (page = 1) => {
    await Promise.resolve();
    setError('');
    try {
      const { values, errors } = await loadAcademySections(focuserApi, page);
      if (values.plans) setPlans(values.plans.items);
      if (values.activeSession) {
        setActiveSession(values.activeSession.session);
        if (values.activeSession.session) {
          const restored = readWorkoutTimer(() => window.localStorage, values.activeSession.session.id);
          setTimer(restored.timer);
          if (restored.error) errors.timer = restored.error;
        } else {
          setTimer(null);
        }
        setTimerNow(Date.now());
      }
      if (values.history) {
        setHistory(values.history.items);
        setHistoryPage(values.history.pagination.page);
        setHistoryPages(values.history.pagination.totalPages);
      }
      if (values.stats) setStats(values.stats);
      if (values.calendar) setCalendar(values.calendar.days);
      setError(Object.values(errors).join(' '));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimeout = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(loadTimeout);
  }, [loadData]);

  useEffect(() => () => calendarDayLoader.cancel(), [calendarDayLoader]);

  useEffect(() => {
    if (!timer?.endsAt) return undefined;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setTimerNow(now);
      if (now >= timer.endsAt) window.clearInterval(intervalId);
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [timer?.endsAt]);

  useEffect(() => {
    if (!activeSession || !timer) return;
    Promise.resolve()
      .then(() => localStorage.setItem(workoutSessionStorageKey(activeSession.id), JSON.stringify(timer)))
      .catch((storageError) => setError(`Não foi possível salvar o estado do cronômetro: ${storageError.message}`));
  }, [activeSession, timer]);

  const exerciseNamesForImages = useMemo(() => {
    let exercises = [];
    if (section === 'plans') {
      exercises = plans.flatMap((plan) => plan.exercises);
    } else if (section === 'workout') {
      exercises = activeSession?.exercises || [];
    } else if (section === 'history' && openHistoryId) {
      exercises = history.find((session) => session.id === openHistoryId)?.exercises || [];
    }
    return [...new Map(exercises
      .map((exercise) => [exerciseImageKey(exercise.name), exercise.name.trim()])
      .filter(([key, name]) => key && name)).values()].slice(0, 50);
  }, [activeSession, history, openHistoryId, plans, section]);

  useEffect(() => {
    const names = exerciseNamesForImages.filter((name) => {
      const key = exerciseImageKey(name);
      if (requestedExerciseImages.current.has(key)) return false;
      requestedExerciseImages.current.add(key);
      return true;
    });
    if (!names.length) return;

    focuserApi.gym.exerciseImages(names)
      .then(({ items }) => {
        setExerciseImages((current) => {
          const updated = { ...current };
          for (const item of items) updated[exerciseImageKey(item.name)] = item.imageUrl || null;
          for (const name of names) {
            const key = exerciseImageKey(name);
            if (!Object.hasOwn(updated, key)) updated[key] = null;
          }
          return updated;
        });
      })
      .catch(() => {
        setExerciseImages((current) => ({
          ...current,
          ...Object.fromEntries(names.map((name) => [exerciseImageKey(name), null])),
        }));
      });
  }, [exerciseNamesForImages]);

  const selectedExerciseStats = useMemo(() => (
    stats?.exercises?.find((exercise) => exercise.name === selectedExercise) || null
  ), [selectedExercise, stats]);

  const volumeSeries = useMemo(() => {
    if (!stats) return [];
    const source = volumePeriod === 'week'
      ? stats.volumeByWeek
      : volumePeriod === 'month'
        ? stats.volumeByMonth
        : stats.volumeBySession;
    return (source || []).map((item) => ({
      ...item,
      period: item.period || item.sessionId,
      label: volumePeriod === 'month'
        ? item.period.slice(5)
        : volumePeriod === 'week'
          ? dateLabel(item.period, { day: '2-digit', month: '2-digit' })
          : dateLabel(item.date, { day: '2-digit', month: '2-digit' }),
    }));
  }, [stats, volumePeriod]);

  const timerRemaining = timer
    ? timer.endsAt
      ? Math.max(0, Math.ceil((timer.endsAt - timerNow) / 1000))
      : Math.max(0, timer.remaining || 0)
    : 0;

  const runAction = async (action, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const openNewPlan = () => setPlanForm({ id: null, ...emptyPlanForm() });
  const openEditPlan = (plan) => setPlanForm({
    id: plan.id,
    name: plan.name,
    exercises: plan.exercises.map((exercise) => ({ ...exercise })),
  });
  const updatePlanExercise = (index, field, value) => {
    setPlanForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) => exerciseIndex === index
        ? { ...exercise, [field]: value }
        : exercise),
    }));
  };
  const reorderPlanExercise = (index, offset) => {
    setPlanForm((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
      return { ...current, exercises };
    });
  };

  const savePlan = async (event) => {
    event.preventDefault();
    const data = {
      name: planForm.name.trim(),
      exercises: planForm.exercises
        .filter((exercise) => exercise.name.trim())
        .map((exercise) => ({
          ...(exercise.id ? { id: exercise.id } : {}),
          name: exercise.name.trim(),
          plannedSets: Number(exercise.plannedSets),
          repTarget: exercise.repTarget.trim(),
          restSeconds: Number(exercise.restSeconds),
        })),
    };
    await runAction(async () => {
      const response = planForm.id
        ? await focuserApi.gym.updatePlan(planForm.id, data)
        : await focuserApi.gym.createPlan(data);
      setPlans((current) => [
        response.plan,
        ...current.filter((plan) => plan.id !== response.plan.id),
      ]);
      setPlanForm(null);
    }, planForm.id ? 'Ficha atualizada.' : 'Ficha criada.');
  };

  const deletePlan = async (plan) => {
    const accepted = await confirm({
      title: 'Excluir ficha de treino?',
      message: `A ficha “${plan.name}” será removida. Sessões já realizadas serão preservadas.`,
      confirmLabel: 'Excluir ficha',
    });
    if (!accepted) return;
    await runAction(async () => {
      await focuserApi.gym.removePlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
    }, 'Ficha excluída. Os treinos realizados foram preservados.');
  };

  const startWorkout = async (planId) => {
    await runAction(async () => {
      const response = await focuserApi.gym.startSession(planId ? { planId } : {});
      setActiveSession(response.session);
      setSection('workout');
      setAddExerciseForm(null);
      setTimer(null);
      setNotice(response.resumed ? 'Treino em andamento retomado.' : 'Treino iniciado.');
    }, null);
  };

  const clearStoredTimer = (sessionId) => {
    try {
      localStorage.removeItem(workoutSessionStorageKey(sessionId));
    } catch (storageError) {
      setError(`Não foi possível limpar o cronômetro salvo: ${storageError.message}`);
    }
  };

  const updateSessionFromResponse = (response) => {
    const updatedSession = {
      ...response.session,
      previousByExercise: response.session.previousByExercise || activeSession?.previousByExercise,
    };
    setActiveSession(updatedSession);
    const incompleteSetIds = new Set(updatedSession.exercises.flatMap((exercise) => exercise.sets.filter((set) => !set.completed).map((set) => set.id)));
    setDraftSets((current) => Object.fromEntries(Object.entries(current).filter(([setId]) => incompleteSetIds.has(setId))));
  };

  const addSessionExercise = async (event) => {
    event.preventDefault();
    if (!activeSession || !addExerciseForm) return;
    await runAction(async () => {
      const response = await focuserApi.gym.addExercise(activeSession.id, {
        name: addExerciseForm.name.trim(),
        plannedSets: Number(addExerciseForm.plannedSets),
        repTarget: addExerciseForm.repTarget.trim(),
        restSeconds: Number(addExerciseForm.restSeconds),
      });
      updateSessionFromResponse(response);
      setAddExerciseForm(null);
    }, 'Exercício adicionado ao treino.');
  };

  const addSessionSet = async (exercise) => runAction(async () => {
    const response = await focuserApi.gym.addSet(activeSession.id, exercise.id);
    updateSessionFromResponse(response);
  }, 'Série adicionada.');

  const saveSet = async (exercise, set, draft, completed = true) => {
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) {
      setError('Informe uma carga válida e uma quantidade de repetições maior que zero.');
      return false;
    }
    let succeeded = false;
    await runAction(async () => {
      const response = await focuserApi.gym.updateSet(activeSession.id, exercise.id, set.id, {
        weight,
        reps,
        completed,
      });
      updateSessionFromResponse(response);
      if (completed) startRest(exercise.restSeconds);
      succeeded = true;
    }, completed ? 'Série registrada.' : null);
    return succeeded;
  };

  const saveDraftSet = (exercise, set, draft) => {
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    if (draft.weight === '' || draft.reps === '' || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) return;
    if (weight === set.weight && reps === set.reps) return;
    saveSet(exercise, set, draft, false);
  };

  const completeWorkout = async () => {
    const accepted = await confirm({
      title: 'Concluir treino?',
      message: 'O treino será salvo no histórico e contará nas suas estatísticas.',
      confirmLabel: 'Concluir treino',
    });
    if (!accepted || !activeSession) return;
    await runAction(async () => {
      await focuserApi.gym.completeSession(activeSession.id);
      clearStoredTimer(activeSession.id);
      setActiveSession(null);
      setTimer(null);
      await loadData(historyPage);
      setSection('history');
    }, 'Treino concluído e salvo no histórico.');
  };

  const abandonWorkout = async () => {
    const accepted = await confirm({
      title: 'Abandonar treino?',
      message: 'A sessão será encerrada sem entrar no histórico de treinos concluídos.',
      confirmLabel: 'Abandonar treino',
    });
    if (!accepted || !activeSession) return;
    await runAction(async () => {
      await focuserApi.gym.abandonSession(activeSession.id);
      clearStoredTimer(activeSession.id);
      setActiveSession(null);
      setTimer(null);
      setDraftSets({});
      await loadData(historyPage);
      setSection('overview');
    }, 'Treino abandonado. Ele não contará como concluído.');
  };

  const startRest = (seconds) => {
    const duration = Math.max(0, Number(seconds) || 0);
    setTimerNow(Date.now());
    setTimer({ endsAt: Date.now() + duration * 1000, duration, remaining: duration, paused: false });
  };

  const pauseRest = () => {
    const remaining = timer?.endsAt ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)) : timerRemaining;
    setTimer({ ...timer, endsAt: null, remaining, paused: true });
  };

  const resumeRest = () => {
    if (timerRemaining <= 0) return;
    setTimerNow(Date.now());
    setTimer({ ...timer, endsAt: Date.now() + timerRemaining * 1000, remaining: timerRemaining, paused: false });
  };

  const adjustRest = (change) => {
    const remaining = Math.max(0, timerRemaining + change);
    setTimerNow(Date.now());
    setTimer({
      ...timer,
      endsAt: timer?.endsAt ? Date.now() + remaining * 1000 : null,
      remaining,
      paused: !timer?.endsAt,
    });
  };

  const skipRest = () => {
    try {
      if (activeSession) localStorage.removeItem(workoutSessionStorageKey(activeSession.id));
    } catch (storageError) {
      setError(`Não foi possível limpar o cronômetro: ${storageError.message}`);
    }
    setTimer(null);
  };

  const openHistorySession = (sessionId) => setOpenHistoryId((current) => current === sessionId ? '' : sessionId);

  const deleteHistory = async () => {
    const accepted = await confirm({
      title: 'Apagar histórico de treinos?',
      message: 'Todas as sessões concluídas serão apagadas permanentemente. Fichas e treinos em andamento serão preservados.',
      confirmLabel: 'Apagar histórico',
    });
    if (!accepted) return;
    await runAction(async () => {
      await focuserApi.gym.removeHistory();
      setHistory([]);
      setHistoryPages(1);
      setHistoryPage(1);
      setOpenHistoryId('');
      await loadData(1);
    }, 'Histórico de treinos apagado.');
  };

  const deleteHistoryExercise = async (session, exercise) => {
    const accepted = await confirm({
      title: 'Apagar exercício desta sessão?',
      message: `“${exercise.name}” será removido apenas desta sessão. As demais sessões serão preservadas.`,
      confirmLabel: 'Apagar exercício',
    });
    if (!accepted) return;
    await runAction(async () => {
      const response = await focuserApi.gym.removeSessionExercise(session.id, exercise.id);
      setHistory((current) => current.map((item) => item.id === session.id ? { ...item, ...response.session, open: true } : item));
      setStats(await focuserApi.gym.stats());
    }, 'Exercício removido da sessão.');
  };

  const showCalendarDay = async (date) => {
    setSelectedDay(date);
    setDaySessions([]);
    setDaySessionsError('');
    setIsLoadingDaySessions(true);
    const result = await calendarDayLoader.load(date);
    if (result.stale) return;
    if (result.error) setDaySessionsError(result.error.message || 'Não foi possível carregar os treinos deste dia.');
    else setDaySessions(result.response.items);
    setIsLoadingDaySessions(false);
  };

  const closeCalendarDay = () => {
    calendarDayLoader.cancel();
    setSelectedDay(null);
    setDaySessions([]);
    setDaySessionsError('');
    setIsLoadingDaySessions(false);
  };

  const deleteAllHistory = history.length > 0 || historyPage > 1;
  const visibleHistory = history.map((session) => ({ ...session, open: openHistoryId === session.id }));
  const monthDate = new Date(ACADEMY_TODAY);
  monthDate.setMonth(monthDate.getMonth() + monthOffset, 1);
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const monthDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const mondayOffset = (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7;
  const calendarCounts = new Map(calendar.map((day) => [day.date, day.count]));
  const canGoForward = monthOffset < 0;

  return (
    <div className="academy-page">
      <PageHeader title="Academia" eyebrow="Treino de força" subtitle="Organize suas fichas, acompanhe cada série e veja sua evolução." action={activeSession ? (
          <button type="button" className="button button-primary" onClick={() => setSection('workout')}><Dumbbell size={16} /> Retomar treino</button>
        ) : null} />
      <nav className="academy-tabs" aria-label="Seções da Academia">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={`academy-tab${section === id ? ' active' : ''}`} aria-current={section === id ? 'page' : undefined} onClick={() => transitionUI(() => setSection(id))}>
            {section === id ? <span className="academy-tab-highlight" aria-hidden="true" /> : null}
            <Icon size={16} />{label}
            {id === 'workout' && activeSession ? <span className="academy-live-dot" aria-label="Treino em andamento" /> : null}
          </button>
        ))}
      </nav>
      {error ? <p className="academy-feedback is-error" role="alert">{error}</p> : null}
      {notice ? <p className="academy-feedback is-success" role="status">{notice}</p> : null}
      {isLoading ? <p className="muted-state">Carregando dados da Academia…</p> : null}

      {!isLoading && section === 'overview' ? (
        <div className="academy-content">
          <section className="metrics-grid academy-metrics">
            <StatCard label="Fichas" value={plans.length} hint="Rotinas organizadas" icon={BookOpen} />
            <StatCard label="Treinos concluídos" value={stats?.sessionsTotal ?? 0} hint="No histórico disponível" icon={CheckCheck} />
            <StatCard label="Esta semana" value={stats?.weeklyCount ?? 0} hint="Sessões concluídas" icon={CalendarDays} />
            <StatCard label="Volume total" value={`${Math.round(stats?.totalVolume || 0).toLocaleString('pt-BR')} kg`} hint="Carga × repetições registradas" icon={Weight} />
          </section>
          {activeSession ? (
            <section className="card academy-active-banner">
              <div><span className="academy-live-dot" /><div><p className="eyebrow">EM ANDAMENTO</p><h2>{activeSession.planName || 'Treino livre'}</h2><p className="muted-state">Iniciado {dateTimeLabel(activeSession.startedAt)}</p></div></div>
              <button type="button" className="button button-primary" onClick={() => setSection('workout')}>Continuar treino <ChevronRight size={16} /></button>
            </section>
          ) : null}
          <section className="academy-subsection">
            <div className="section-heading"><div><p className="eyebrow">Sua rotina</p><h2>Fichas de treino</h2></div><button type="button" className="button button-secondary" onClick={() => setSection('plans')}>Ver fichas <ChevronRight size={16} /></button></div>
            {plans.length ? (
              <div className="academy-plan-grid">
                {plans.slice(0, 3).map((plan) => (
                  <article className="card academy-plan-card" key={plan.id}>
                    <div><h3>{plan.name}</h3><p>{plan.exercises.length} exercícios</p></div>
                    <button type="button" className="button button-primary" disabled={busy || Boolean(activeSession)} onClick={() => startWorkout(plan.id)}><Play size={15} /> Iniciar</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="card academy-empty"><Dumbbell size={22} /><strong>Monte sua primeira ficha</strong><p>Adicione exercícios, séries, repetições e descansos recomendados.</p><button type="button" className="button button-primary" onClick={() => { setSection('plans'); openNewPlan(); }}>Criar ficha</button></div>
            )}
          </section>
          <section className="card academy-overview-history">
            <div className="section-heading"><div><p className="eyebrow">Registros recentes</p><h2>Últimos treinos</h2></div><button type="button" className="button button-ghost" onClick={() => setSection('history')}>Abrir histórico <ChevronRight size={15} /></button></div>
            {history.length ? history.slice(0, 4).map((session) => <div className="academy-recent-session" key={session.id}><span>{session.planName || 'Treino livre'}</span><time>{dateTimeLabel(session.completedAt)}</time><strong>{formatDuration(session.durationSeconds)}</strong></div>) : <p className="muted-state">Seus treinos concluídos aparecerão aqui.</p>}
          </section>
          {!activeSession ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => startWorkout(null)}><Plus size={16} /> Iniciar treino livre</button> : null}
        </div>
      ) : null}

      {!isLoading && section === 'plans' ? (
        <section className="academy-content academy-plans-section">
          <div className="section-heading"><div><p className="eyebrow">Rotinas personalizadas</p><h2>Suas fichas</h2><p className="section-subtitle">Crie qualquer divisão e organize os exercícios na ordem que preferir.</p></div><button type="button" className="button button-primary" disabled={busy || Boolean(activeSession)} onClick={openNewPlan}><Plus size={16} /> Nova ficha</button></div>
          {planForm ? (
            <form className="card academy-plan-form" onSubmit={savePlan}>
              <div className="academy-form-heading"><h3>{planForm.id ? 'Editar ficha' : 'Nova ficha'}</h3><button type="button" className="text-button" aria-label="Fechar formulário" onClick={() => setPlanForm(null)}><X size={17} /></button></div>
              <label><span>Nome da ficha</span><input required minLength="1" maxLength="80" value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Treino A, Push, Pernas" /></label>
              <div className="academy-plan-exercise-list">
                {planForm.exercises.map((exercise, index) => (
                  <div className="academy-plan-exercise-row" key={exercise.id || `new-${index}`}>
                    <label className="academy-plan-exercise-name"><span>Exercício {index + 1}</span><input required maxLength="100" value={exercise.name} onChange={(event) => updatePlanExercise(index, 'name', event.target.value)} placeholder="Ex.: Agachamento" /></label>
                    <label><span>Séries</span><NumberInput aria-label={`séries do exercício ${index + 1}`} min="1" max="30" required value={exercise.plannedSets} onValueChange={(value) => updatePlanExercise(index, 'plannedSets', value)} /></label>
                    <label><span>Repetições</span><input required maxLength="9" pattern="\d{1,4}(\s*-\s*\d{1,4})?" value={exercise.repTarget} onChange={(event) => updatePlanExercise(index, 'repTarget', event.target.value)} placeholder="8-12" /></label>
                    <label><span>Descanso (s)</span><NumberInput aria-label={`descanso do exercício ${index + 1}`} min="0" max="900" required value={exercise.restSeconds} onValueChange={(value) => updatePlanExercise(index, 'restSeconds', value)} /></label>
                    <div className="academy-order-actions">
                      <button type="button" className="text-button" aria-label={`Mover exercício ${index + 1} para cima`} disabled={index === 0} onClick={() => reorderPlanExercise(index, -1)}><ArrowUp size={16} /></button>
                      <button type="button" className="text-button" aria-label={`Mover exercício ${index + 1} para baixo`} disabled={index === planForm.exercises.length - 1} onClick={() => reorderPlanExercise(index, 1)}><ArrowDown size={16} /></button>
                      <button type="button" className="text-button" aria-label={`Remover exercício ${index + 1}`} disabled={planForm.exercises.length <= 1} onClick={() => setPlanForm((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="academy-form-actions"><button type="button" className="button button-secondary" disabled={planForm.exercises.length >= 50} onClick={() => setPlanForm((current) => ({ ...current, exercises: [...current.exercises, { ...EMPTY_EXERCISE }] }))}><Plus size={15} /> Adicionar exercício</button><span /><button type="button" className="button button-secondary" onClick={() => setPlanForm(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar ficha'}</button></div>
            </form>
          ) : null}
          {plans.length ? <div className="academy-plan-grid">{plans.map((plan) => (
            <article className="card academy-plan-card academy-plan-card-full" key={plan.id}>
              <div className="academy-plan-card-heading"><div><p className="eyebrow">FICHA DE TREINO</p><h3>{plan.name}</h3></div><div className="academy-icon-actions">
                <button type="button" className="text-button" aria-label={`Editar ficha ${plan.name}`} disabled={busy || Boolean(activeSession)} onClick={() => openEditPlan(plan)}><Activity size={16} /></button>
                <button type="button" className="text-button" aria-label={`Excluir ficha ${plan.name}`} disabled={busy} onClick={() => deletePlan(plan)}><Trash2 size={16} /></button>
              </div></div>
              {plan.exercises.length ? <ol className="academy-plan-exercises">{plan.exercises.map((exercise) => <li key={exercise.id}><span className="academy-plan-exercise-label"><ExerciseThumbnail key={`${exercise.name}-${exerciseImages[exerciseImageKey(exercise.name)] || 'initials'}`} name={exercise.name} imageUrl={exerciseImages[exerciseImageKey(exercise.name)]} />{exercise.name}</span><small>{exercise.plannedSets} × {exercise.repTarget} · {exercise.restSeconds}s descanso</small></li>)}</ol> : <p className="muted-state">Ficha sem exercícios. Edite para adicionar movimentos.</p>}
              <button type="button" className="button button-primary" disabled={busy || Boolean(activeSession)} onClick={() => startWorkout(plan.id)}><Play size={15} /> Iniciar treino</button>
            </article>
          ))}</div> : !planForm ? <div className="card academy-empty"><Dumbbell size={22} /><strong>Nenhuma ficha criada ainda</strong><p>Crie sua rotina e escolha livremente os exercícios.</p><button type="button" className="button button-primary" onClick={openNewPlan}>Criar primeira ficha</button></div> : null}
        </section>
      ) : null}

      {!isLoading && section === 'workout' ? (
        <section className="academy-content">
          {!activeSession ? (
            <div className="card academy-empty"><Dumbbell size={24} /><strong>Nenhum treino em andamento</strong><p>Inicie uma ficha ou comece uma sessão livre.</p><div className="academy-empty-actions"><button type="button" className="button button-primary" onClick={() => setSection('plans')}>Escolher ficha</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => startWorkout(null)}>Treino livre</button></div></div>
          ) : (
            <>
              <section className="card academy-session-heading">
                <div><p className="eyebrow">TREINO EM ANDAMENTO</p><h2>{activeSession.planName || 'Treino livre'}</h2><p className="muted-state">Iniciado {dateTimeLabel(activeSession.startedAt)}</p></div>
                <div className="academy-session-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={abandonWorkout}>Abandonar</button><button type="button" className="button button-primary" disabled={busy} onClick={completeWorkout}><CheckCheck size={16} /> Concluir treino</button></div>
              </section>
              <section className={`card academy-rest-timer${timerRemaining === 0 && timer ? ' is-finished' : ''}`} aria-live="polite">
                <div className="academy-timer-face"><Timer size={18} /><strong>{String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:{String(timerRemaining % 60).padStart(2, '0')}</strong><span>{timer?.endsAt && timerRemaining > 0 ? 'Descanso em andamento' : timer && timerRemaining === 0 ? 'Descanso finalizado' : 'Cronômetro de descanso'}</span></div>
                <div className="academy-timer-controls">
                  <button type="button" className="button button-secondary" aria-label="Diminuir 15 segundos" disabled={!timer} onClick={() => adjustRest(-15)}><Minus size={15} />15s</button>
                  {timer?.endsAt && timerRemaining > 0 ? <button type="button" className="button button-secondary" onClick={pauseRest}><Pause size={15} /> Pausar</button> : <button type="button" className="button button-secondary" disabled={!timer || timerRemaining === 0} onClick={resumeRest}><Play size={15} /> Retomar</button>}
                  <button type="button" className="button button-secondary" aria-label="Aumentar 15 segundos" disabled={!timer} onClick={() => adjustRest(15)}><Plus size={15} />15s</button>
                  <button type="button" className="button button-ghost" disabled={!timer} onClick={() => startRest(timer.duration ?? timer.remaining)}><RotateCcw size={15} /> Reiniciar</button>
                  <button type="button" className="button button-ghost" disabled={!timer} onClick={skipRest}><SkipForward size={15} /> Pular</button>
                </div>
              </section>
              {activeSession.exercises.length ? activeSession.exercises.map((exercise) => (
                <SessionExercise
                  key={exercise.id}
                  exercise={exercise}
                  session={activeSession}
                  imageUrl={exerciseImages[exerciseImageKey(exercise.name)]}
                  busy={busy}
                  draftSets={draftSets}
                  onDraftChange={(setId, draft) => setDraftSets((current) => ({ ...current, [setId]: draft }))}
                  onCompleteSet={(exerciseItem, set, draft) => saveSet(exerciseItem, set, draft, true)}
                  onSaveSet={saveDraftSet}
                  onAddSet={addSessionSet}
                  onRest={startRest}
                />
              )) : <div className="card academy-empty"><strong>Treino livre pronto para começar</strong><p>Adicione o primeiro exercício para registrar suas séries.</p></div>}
              {addExerciseForm ? (
                <form className="card academy-add-exercise-form" onSubmit={addSessionExercise}>
                  <div className="academy-form-heading"><h3>Adicionar exercício</h3><button type="button" className="text-button" aria-label="Cancelar adição de exercício" onClick={() => setAddExerciseForm(null)}><X size={16} /></button></div>
                  <label><span>Nome</span><input required maxLength="100" value={addExerciseForm.name} onChange={(event) => setAddExerciseForm((current) => ({ ...current, name: event.target.value }))} autoFocus /></label>
                  <div className="academy-inline-fields"><label><span>Séries</span><NumberInput aria-label="séries do exercício" min="1" max="30" value={addExerciseForm.plannedSets} onValueChange={(value) => setAddExerciseForm((current) => ({ ...current, plannedSets: value }))} /></label><label><span>Repetições</span><input value={addExerciseForm.repTarget} onChange={(event) => setAddExerciseForm((current) => ({ ...current, repTarget: event.target.value }))} /></label><label><span>Descanso (s)</span><NumberInput aria-label="descanso em segundos" min="0" max="900" value={addExerciseForm.restSeconds} onValueChange={(value) => setAddExerciseForm((current) => ({ ...current, restSeconds: value }))} /></label></div>
                  <button type="submit" className="button button-primary" disabled={busy}>Adicionar ao treino</button>
                </form>
              ) : <button type="button" className="button button-secondary" disabled={busy || activeSession.exercises.length >= 50} onClick={() => setAddExerciseForm({ ...EMPTY_EXERCISE })}><Plus size={16} /> Adicionar exercício</button>}
            </>
          )}
        </section>
      ) : null}

      {!isLoading && section === 'history' ? (
        <section className="academy-content">
          <div className="section-heading"><div><p className="eyebrow">Sessões concluídas</p><h2>Histórico de treinos</h2><p className="section-subtitle">Treinos abandonados não aparecem neste histórico.</p></div><button type="button" className="button button-secondary academy-danger-action" disabled={busy || !deleteAllHistory} onClick={deleteHistory}><Trash2 size={15} /> Apagar histórico</button></div>
          {history.length ? <div className="academy-history-list">{visibleHistory.map((session) => <WorkoutSessionCard key={session.id} session={session} exerciseImages={exerciseImages} onOpen={openHistorySession} onRemoveExercise={deleteHistoryExercise} busy={busy} />)}</div> : <div className="card academy-empty"><History size={22} /><strong>Seu histórico está vazio</strong><p>Conclua seu primeiro treino para encontrar os detalhes aqui.</p><button type="button" className="button button-primary" onClick={() => setSection('plans')}>Ver fichas</button></div>}
          {historyPages > 1 ? <div className="academy-pagination"><button type="button" className="button button-secondary" disabled={historyPage <= 1 || busy} onClick={() => { const next = historyPage - 1; setHistoryPage(next); loadData(next); }}><ChevronLeft size={16} /> Anterior</button><span>Página {historyPage} de {historyPages}</span><button type="button" className="button button-secondary" disabled={historyPage >= historyPages || busy} onClick={() => { const next = historyPage + 1; setHistoryPage(next); loadData(next); }}>Próxima <ChevronRight size={16} /></button></div> : null}
        </section>
      ) : null}

      {!isLoading && section === 'progress' ? (
        <section className="academy-content">
          <div className="section-heading"><div><p className="eyebrow">Dados reais dos seus treinos</p><h2>Evolução e recordes</h2></div></div>
          <div className="metrics-grid academy-metrics">
            <StatCard label="Sessões concluídas" value={stats?.sessionsTotal ?? 0} hint="Últimos 12 meses" icon={CheckCheck} />
            <StatCard label="Esta semana" value={stats?.weeklyCount ?? 0} hint="Treinos concluídos" icon={CalendarDays} />
            <StatCard label="Este mês" value={stats?.monthlyCount ?? 0} hint="Treinos concluídos" icon={Activity} />
            <StatCard label="Média de repetições" value={stats?.averageReps == null ? '—' : stats.averageReps.toFixed(1)} hint="Por série concluída" icon={TrendingUp} />
          </div>
          {stats?.truncated ? <p className="muted-state">As estatísticas consideram as 500 sessões concluídas mais recentes do período.</p> : null}
          <section className="card academy-chart-card">
            <div className="section-heading"><div><p className="eyebrow">Carga × repetições</p><h3>Volume de treino</h3></div><select aria-label="Agrupar volume de treino" value={volumePeriod} onChange={(event) => setVolumePeriod(event.target.value)}><option value="session">Por sessão</option><option value="week">Por semana</option><option value="month">Por mês</option></select></div>
            <VolumeChart series={volumeSeries} />
          </section>
          <section className="card academy-chart-card">
            <div className="section-heading"><div><p className="eyebrow">Por exercício</p><h3>Evolução de carga</h3></div>
              <select aria-label="Selecionar exercício para ver evolução" value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}><option value="">Selecione um exercício</option>{(stats?.exercises || []).map((exercise) => <option value={exercise.name} key={exercise.name}>{exercise.name}</option>)}</select>
            </div>
            {selectedExerciseStats ? (
              <>
                <div className="academy-records"><div><Trophy size={17} /><span>Maior carga <strong>{selectedExerciseStats.bestWeight} kg</strong></span></div><div><CheckCheck size={17} /><span>Mais repetições <strong>{selectedExerciseStats.bestRepSet ? `${selectedExerciseStats.bestRepSet.reps} × ${selectedExerciseStats.bestRepSet.weight} kg` : '—'}</strong></span></div><div><TrendingUp size={17} /><span>Melhor 1RM estimado <strong>{selectedExerciseStats.bestSet ? `${selectedExerciseStats.bestSet.estimatedOneRepMax.toFixed(1)} kg` : '—'}</strong></span></div><p>Estimativa de 1RM baseada na fórmula de Epley; não é uma medição direta.</p></div>
                <ExerciseChart exercise={selectedExerciseStats} />
              </>
            ) : <p className="muted-state">Selecione um exercício com séries concluídas para ver o histórico de carga e os recordes.</p>}
          </section>
        </section>
      ) : null}

      {!isLoading && section === 'calendar' ? (
        <section className="academy-content">
          <div className="section-heading"><div><p className="eyebrow">Consistência sem cobranças</p><h2>Calendário de treinos</h2><p className="section-subtitle">Cada marca representa sessões concluídas. Dias sem treino ficam apenas sem marcação.</p></div></div>
          <section className="card academy-calendar-card">
            <div className="academy-calendar-heading"><button type="button" className="text-button" aria-label="Mês anterior" disabled={monthOffset <= -11} onClick={() => setMonthOffset((offset) => offset - 1)}><ChevronLeft size={19} /></button><h3>{monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3><button type="button" className="text-button" aria-label="Próximo mês" disabled={!canGoForward} onClick={() => setMonthOffset((offset) => offset + 1)}><ChevronRight size={19} /></button></div>
            <div className="academy-calendar-grid" role="grid" aria-label={`Calendário de ${monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`}>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => <span className="academy-calendar-weekday" key={day}>{day}</span>)}
              {Array.from({ length: mondayOffset }, (_, index) => <span className="academy-calendar-blank" key={`blank-${monthKey}-${index}`} />)}
              {Array.from({ length: monthDays }, (_, index) => {
                const day = index + 1;
                const date = `${monthKey}-${String(day).padStart(2, '0')}`;
                const count = calendarCounts.get(date) || 0;
                const future = date > (calendar.at(-1)?.date || '');
                return (
                  <button type="button" role="gridcell" key={date} className={`academy-calendar-day level-${Math.min(count, 3)}${selectedDay === date ? ' selected' : ''}`} aria-label={`${dateLabel(`${date}T12:00:00`, { day: 'numeric', month: 'long' })}, ${count} treinos concluídos`} title={`${count} treinos concluídos`} disabled={future} onClick={() => showCalendarDay(date)}>
                    <span>{day}</span>{count ? <small>{count}</small> : null}
                  </button>
                );
              })}
            </div>
            <div className="academy-calendar-legend"><span>Menos</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>Mais</span></div>
          </section>
          {selectedDay ? (
            <section className="card academy-calendar-day-detail">
              <div className="section-heading"><h3>Treinos de {dateLabel(`${selectedDay}T12:00:00`, { dateStyle: 'full' })}</h3><button type="button" className="text-button" aria-label="Fechar detalhes do dia" onClick={closeCalendarDay}><X size={16} /></button></div>
              {daySessionsError ? <p className="error-text" role="alert">{daySessionsError}</p>
                : isLoadingDaySessions ? <p className="muted-state" role="status">Carregando treinos…</p>
                  : daySessions.length ? daySessions.map((session) => <div className="academy-recent-session" key={session.id}><span>{session.planName || 'Treino livre'}</span><time>{dateTimeLabel(session.completedAt)}</time><strong>{session.exercises.length} exercícios</strong></div>)
                    : <p className="muted-state">Nenhum treino concluído nesta data.</p>}
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
