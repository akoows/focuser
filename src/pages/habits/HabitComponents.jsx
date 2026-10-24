import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HABIT_ICONS, WEEKDAY_NAMES, WEEKDAY_SHORT_NAMES, formatFrequency, getHabitUnit } from "./habitConfig";
import { ConfettiBurst } from "./ConfettiBurst";
import { activateModalFocus } from '../../utils/modalFocus';
import {
  Archive, CalendarDays, Check, CheckCheck, Clock3, Flame, Focus, MoreHorizontal, Pencil, Target, Trash2, X,
} from "lucide-react";
import NumberInput from "../../components/NumberInput";

const LOCAL_TODAY_DATE = new Intl.DateTimeFormat("en-CA").format(new Date());

export function HabitIcon({ name, size = 20, strokeWidth = 1.8 }) {
  const Icon = HABIT_ICONS[name] || Target;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function HabitWeek({ habit, weeklyProgress = [], onCheckIn, isBusy, compact = false }) {
  const [selectedCheckInDate, setSelectedCheckInDate] = useState('');
  const pastCheckInDialogRef = useRef(null);
  const pastCheckInTriggerRef = useRef(null);
  const [checkInAmount, setCheckInAmount] = useState(habit.step ?? 1);
  const [checkInMode, setCheckInMode] = useState('add');
  const [celebration, setCelebration] = useState({ date: '', id: 0 });
  const [progressAnimation, setProgressAnimation] = useState({ date: '', id: 0 });
  const checkInAmountRef = useRef(null);
  const previousCompletionRef = useRef(new Map(weeklyProgress.map((day) => [day.date, Boolean(day.scheduled && day.completed)])));
  const previousCountsRef = useRef(new Map(weeklyProgress.map((day) => [day.date, day.checkInCount ?? (day.completed ? day.dailyTarget ?? habit.dailyTarget ?? 1 : 0)])));
  const scheduledDays = weeklyProgress.filter((day) => day.scheduled).length;
  const completedDays = weeklyProgress.filter((day) => day.scheduled && day.completed).length;
  const todayDate = weeklyProgress.find((day) => day.isToday)?.date ?? LOCAL_TODAY_DATE;
  const selectedDay = weeklyProgress.find((day) => day.date === selectedCheckInDate);

  useEffect(() => {
    const previousCompletion = previousCompletionRef.current;
    const completedDay = weeklyProgress.find((day) => day.scheduled && day.completed && !previousCompletion.get(day.date));
    previousCompletionRef.current = new Map(weeklyProgress.map((day) => [day.date, Boolean(day.scheduled && day.completed)]));
    if (completedDay) {
      setCelebration((current) => ({ date: completedDay.date, id: current.id + 1 }));
    }
  }, [weeklyProgress]);

  useEffect(() => {
    const previousCounts = previousCountsRef.current;
    const changedDay = weeklyProgress.find((day) => {
      const count = day.checkInCount ?? (day.completed ? day.dailyTarget ?? habit.dailyTarget ?? 1 : 0);
      return previousCounts.has(day.date) && previousCounts.get(day.date) !== count;
    });
    previousCountsRef.current = new Map(weeklyProgress.map((day) => [day.date, day.checkInCount ?? (day.completed ? day.dailyTarget ?? habit.dailyTarget ?? 1 : 0)]));
    if (changedDay) setProgressAnimation((current) => ({ date: changedDay.date, id: current.id + 1 }));
  }, [habit.dailyTarget, weeklyProgress]);

  useEffect(() => {
    if (!celebration.date) return undefined;
    const timer = window.setTimeout(() => setCelebration((current) => ({ ...current, date: '' })), 1400);
    return () => window.clearTimeout(timer);
  }, [celebration.id, celebration.date]);

  useEffect(() => {
    if (!progressAnimation.date) return undefined;
    const timer = window.setTimeout(() => setProgressAnimation((current) => ({ ...current, date: '' })), 720);
    return () => window.clearTimeout(timer);
  }, [progressAnimation.id, progressAnimation.date]);

  useEffect(() => {
    if (!selectedCheckInDate) return undefined;
    return activateModalFocus(pastCheckInDialogRef.current, {
      initialFocus: checkInAmountRef.current,
      fallbackFocus: () => pastCheckInTriggerRef.current,
      onEscape: () => setSelectedCheckInDate(''),
    });
  }, [selectedCheckInDate]);

  if (!weeklyProgress.length) return null;

  const closePastCheckIn = () => setSelectedCheckInDate('');
  const submitPastCheckIn = async (event) => {
    event.preventDefault();
    if (!selectedDay || isBusy) return;
    const succeeded = await onCheckIn(habit.id, checkInAmount, selectedDay.date, checkInMode);
    if (succeeded) closePastCheckIn();
  };

  const pastCheckInDialog = selectedDay ? (() => {
    const target = selectedDay.dailyTarget ?? habit.dailyTarget ?? 1;
    const count = selectedDay.checkInCount ?? (selectedDay.completed ? target : 0);
    const remaining = Math.max(0, target - count);
    const maxAmount = checkInMode === 'remove' ? count : remaining;
    const dateLabel = new Date(`${selectedDay.date}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return createPortal(
      <div
        className="app-dialog-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isBusy) closePastCheckIn();
        }}
      >
        <form
          ref={pastCheckInDialogRef}
          className="habit-past-checkin-dialog"
          style={{ '--habit-color': habit.color || 'var(--accent)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="habit-past-checkin-title"
          onSubmit={submitPastCheckIn}
        >
          <button
            type="button"
            className="habit-past-checkin-close"
            aria-label="Fechar registro retroativo"
            disabled={isBusy}
            onClick={closePastCheckIn}
          >
            <X size={17} />
          </button>
          <p className="eyebrow">{selectedDay.isToday ? 'PROGRESSO DE HOJE' : 'PROGRESSO RETROATIVO'}</p>
          <h2 id="habit-past-checkin-title">{habit.name}</h2>
          <p className="habit-past-checkin-date">{dateLabel}</p>
          <p className="habit-past-checkin-count">{count} de {target} {habit.unit ? getHabitUnit(habit.unit).plural : 'conclusões'} registradas</p>
          {target > 1 ? (
            <div className="habit-checkin-mode" role="group" aria-label="Tipo de alteração">
              <button
                type="button"
                className={checkInMode === 'add' ? 'active' : ''}
                aria-pressed={checkInMode === 'add'}
                disabled={remaining === 0 || isBusy}
                onClick={() => {
                  setCheckInMode('add');
                  setCheckInAmount(Math.min(habit.step ?? 1, remaining));
                }}
              >
                Adicionar
              </button>
              <button
                type="button"
                className={checkInMode === 'remove' ? 'active' : ''}
                aria-pressed={checkInMode === 'remove'}
                disabled={count === 0 || isBusy}
                onClick={() => {
                  setCheckInMode('remove');
                  setCheckInAmount(Math.min(habit.step ?? 1, count));
                }}
              >
                Remover
              </button>
            </div>
          ) : null}
          {maxAmount > 0 ? (
            <label className="habit-past-checkin-amount">
              <span>{checkInMode === 'remove' ? 'Quantas conclusões deseja remover?' : selectedDay.isToday ? 'Quantas vezes você concluiu hoje?' : 'Quantas vezes você concluiu?'}</span>
              <NumberInput
                ref={checkInAmountRef}
                min="1"
                max={maxAmount}
                step="1"
                value={Math.min(checkInAmount, maxAmount)}
                disabled={isBusy}
                aria-label="quantidade de conclusões"
                onValueChange={(value) => setCheckInAmount(Math.max(1, Math.min(maxAmount, Number(value) || 1)))}
              />
            </label>
          ) : <p className="habit-past-checkin-count">{checkInMode === 'remove' ? 'Não há conclusões para remover.' : 'A meta diária já foi atingida.'}</p>}
          <div className="habit-past-checkin-actions">
            <button type="button" className="button button-secondary" disabled={isBusy} onClick={closePastCheckIn}>
              Cancelar
            </button>
            {maxAmount > 0 ? (
              <button type="submit" className="button button-primary" disabled={isBusy}>
                {isBusy ? 'Salvando…' : checkInMode === 'remove' ? 'Remover conclusões' : 'Registrar'}
              </button>
            ) : null}
          </div>
        </form>
      </div>,
      document.body
    );
  })() : null;

  return (
    <>
    <section className={`habit-week${compact ? ' is-compact' : ''}`} aria-label={`Semana de ${habit.name}`}>
      {!compact ? (
        <>
          <div className="habit-week-heading">
            <span>Semana</span>
            <span>{completedDays} de {scheduledDays} dias programados</span>
          </div>
          <p className="habit-week-hint">Selecione um dia passado para registrar conclusões retroativas.</p>
        </>
      ) : null}
      <ol className="habit-week-grid">
        {weeklyProgress.map((day) => {
          const target = day.dailyTarget ?? habit.dailyTarget ?? 1;
          const count = day.checkInCount ?? (day.completed ? target : 0);
          const progress = day.scheduled ? Math.min(100, (count / target) * 100) : 0;
          const partial = day.scheduled && count > 0 && !day.completed;
          const canEditDay = day.scheduled && (count < target || count > 0) && todayDate && day.date <= todayDate;
          const status = day.completed
            ? `${target} de ${target} conclusões`
            : partial
              ? `${count} de ${target} conclusões`
            : !day.scheduled
              ? 'Não programado'
              : day.isToday
                ? 'Pendente hoje'
                : todayDate && day.date > todayDate
                  ? 'Programado'
                  : 'Pendente';
          const stateClass = day.completed
            ? 'is-completed'
            : partial
              ? 'is-partial'
            : !day.scheduled
              ? 'is-off'
              : day.isToday
                ? 'is-today'
                : todayDate && day.date > todayDate
                  ? 'is-upcoming'
                  : 'is-pending';
          const isCelebrating = celebration.date === day.date;
          const isProgressing = progressAnimation.date === day.date;
          const marker = (
            <span className={`habit-week-marker${isCelebrating ? ' has-confetti' : ''}${isProgressing ? ' is-progressing' : ''}`} aria-hidden="true">
              {isCelebrating ? <ConfettiBurst className="habit-week-confetti confetti-burst" /> : null}
            </span>
          );

          return (
            <li
              className={`habit-week-day ${stateClass}${isCelebrating ? ' is-celebrating' : ''}`}
              key={`${day.date}-${isCelebrating ? celebration.id : 0}`}
              style={{ '--habit-day-progress': `${progress}%` }}
              aria-label={`${WEEKDAY_NAMES[day.weekday]} ${day.date}: ${status}`}
              title={`${WEEKDAY_NAMES[day.weekday]} ${day.date} · ${status}`}
            >
              <span className="habit-week-day-name">{WEEKDAY_SHORT_NAMES[day.weekday]}</span>
              {canEditDay ? (
                <button
                  type="button"
                  className="habit-week-marker-button"
                  aria-label={count > 0
                    ? `Editar conclusões de ${WEEKDAY_NAMES[day.weekday]} ${day.date}`
                    : `Registrar conclusões de ${WEEKDAY_NAMES[day.weekday]} ${day.date}`}
                  disabled={isBusy || (day.isToday && !habit.isActive)}
                  onClick={() => {
                    const remaining = target - count;
                    if (target === 1) {
                      if (count > 0) onCheckIn(habit.id, 1, day.date, 'remove');
                      else onCheckIn(habit.id, 1, day.date);
                      return;
                    }
                    pastCheckInTriggerRef.current = document.activeElement;
                    setSelectedCheckInDate(day.date);
                    const mode = count > 0 ? 'remove' : 'add';
                    setCheckInMode(mode);
                    setCheckInAmount(mode === 'remove'
                      ? Math.min(habit.step ?? 1, count)
                      : Math.min(habit.step ?? 1, remaining));
                  }}
                >
                  {marker}
                </button>
              ) : marker}
              {!compact ? <time className="habit-week-date" dateTime={day.date}>{day.date.slice(-2)}</time> : null}
            </li>
          );
        })}
      </ol>
      {pastCheckInDialog}
    </section>
    </>
  );
}

export function HabitCard({ habit, completedToday, scheduledToday, isBusy, error, onClearError, onCheckIn, onHistory, onEdit, onArchive, onDelete }) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [recordCelebration, setRecordCelebration] = useState(false);
  const actionsButtonRef = useRef(null);
  const actionsDialogRef = useRef(null);
  const editActionRef = useRef(null);
  const previousCompletedRef = useRef(completedToday);
  const previousRecordRef = useRef(habit.longestStreak ?? 0);
  const todayProgress = habit.weeklyProgress?.find((day) => day.isToday);
  const dailyTarget = habit.dailyTarget ?? 1;
  const checkInCount = todayProgress?.checkInCount ?? (completedToday ? dailyTarget : 0);
  const remaining = Math.max(0, dailyTarget - checkInCount);
  const amountToRegister = Math.min(habit.step ?? 1, remaining);
  const unitLabel = getHabitUnit(habit.unit).plural;

  useEffect(() => {
    if (completedToday && !previousCompletedRef.current) {
      window.dispatchEvent(new Event('focuser:habit-completed'));
    }
    previousCompletedRef.current = completedToday;
  }, [completedToday]);

  useEffect(() => {
    const longestStreak = habit.longestStreak ?? 0;
    if (longestStreak > previousRecordRef.current) {
      setRecordCelebration(true);
      const timer = window.setTimeout(() => setRecordCelebration(false), 1500);
      previousRecordRef.current = longestStreak;
      return () => window.clearTimeout(timer);
    }
    previousRecordRef.current = longestStreak;
    return undefined;
  }, [habit.longestStreak]);

  useEffect(() => {
    if (!isActionsOpen) return undefined;
    return activateModalFocus(actionsDialogRef.current, {
      initialFocus: editActionRef.current,
      fallbackFocus: () => actionsButtonRef.current,
      onEscape: () => setIsActionsOpen(false),
    });
  }, [isActionsOpen]);

  const runAction = (action) => {
    const returnFocus = actionsButtonRef.current;
    setIsActionsOpen(false);
    if (action === onHistory || action === onEdit) action(habit, returnFocus);
    else action(habit);
  };

  const actionsDialog = isActionsOpen ? createPortal(
    <div
      className="app-dialog-backdrop habit-actions-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) setIsActionsOpen(false);
      }}
    >
      <section
        ref={actionsDialogRef}
        className="habit-actions-dialog"
        style={{ '--habit-color': habit.color || 'var(--accent)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`habit-actions-title-${habit.id}`}
      >
        <button
          type="button"
          className="habit-actions-dialog-close"
          aria-label="Fechar menu de ações"
          onClick={() => setIsActionsOpen(false)}
        >
          <X size={18} />
        </button>
        <header className="habit-actions-dialog-heading">
          <div className={`habit-icon habit-icon-${habit.icon || 'TARGET'}`}><HabitIcon name={habit.icon} size={21} /></div>
          <h2 id={`habit-actions-title-${habit.id}`}>{habit.name}</h2>
        </header>
        <div className="habit-actions-dialog-options">
          <button type="button" onClick={() => runAction(onHistory)}>
            <CalendarDays size={17} />
            <span>Ver histórico</span>
          </button>
          <button ref={editActionRef} type="button" disabled={isBusy} onClick={() => runAction(onEdit)}>
            <Pencil size={17} />
            <span>Editar Hábito</span>
          </button>
          <button type="button" disabled={isBusy} onClick={() => runAction(onArchive)}>
            {habit.isActive ? <Archive size={17} /> : <Check size={17} />}
            <span>{habit.isActive ? 'Arquivar Hábito' : 'Reativar Hábito'}</span>
          </button>
          <button className="is-danger" type="button" disabled={isBusy} onClick={() => runAction(onDelete)}>
            <Trash2 size={17} />
            <span>Excluir Hábito</span>
          </button>
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <article className={`habit-card card${completedToday ? ' is-completed' : ''}`} style={{ '--habit-color': habit.color || 'var(--accent)' }}>
      <div className="habit-card-heading">
        <div className="habit-card-icon-wrap">
          <div className={`habit-icon habit-icon-${habit.icon || 'TARGET'}`}><HabitIcon name={habit.icon} size={21} /></div>
        </div>
        <div className="habit-card-copy">
          <span className="habit-card-title"><span className="habit-card-title-text">{habit.name}</span></span>
        </div>
        <button
          ref={actionsButtonRef}
          type="button"
          className="habit-card-menu-trigger"
          aria-label={`Abrir ações de ${habit.name}`}
          aria-haspopup="dialog"
          aria-expanded={isActionsOpen}
          disabled={isBusy}
          onClick={() => setIsActionsOpen(true)}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </div>
      <HabitWeek
        habit={habit}
        weeklyProgress={habit.weeklyProgress}
        onCheckIn={onCheckIn}
        isBusy={isBusy}
        compact
      />
      <div className="habit-card-meta habit-card-meta-compact" aria-label={`Tags de ${habit.name}`}>
        <span className={`habit-status-pill${habit.isActive ? ' is-active' : ''}`}>{habit.isActive ? 'Ativo' : 'Arquivado'}</span>
        <span className="habit-frequency"><Clock3 size={13} />{formatFrequency(habit)}</span>
        {habit.category ? <span className="habit-category"><Focus size={12} strokeWidth={2} />{habit.category}</span> : null}
        {(habit.unit || habit.currentStreak > 0 || habit.longestStreak > 0) ? (
          <span className="habit-card-metrics">
            {habit.unit ? <span className="habit-unit">{getHabitUnit(habit.unit).label}</span> : null}
            {(habit.currentStreak > 0 || habit.longestStreak > 0) ? <span className={`habit-streak-badge${recordCelebration ? ' is-record' : ''}`} title={`Sequência atual: ${habit.currentStreak ?? 0} dias · Recorde: ${habit.longestStreak ?? 0} dias`}><Flame size={13} />{habit.currentStreak ?? 0} d</span> : null}
          </span>
        ) : null}
      </div>
      {habit.isActive ? (
        <div className="habit-card-footer">
          <button type="button" className={`button habit-checkin-button${completedToday ? ' is-completed' : ''}`} disabled={isBusy || completedToday || !scheduledToday || amountToRegister < 1} onClick={() => onCheckIn(habit.id, amountToRegister)}>
            {completedToday ? <Check size={16} /> : <CheckCheck size={16} />}
            {completedToday ? 'Meta diária atingida' : scheduledToday ? dailyTarget > 1 ? `Registrar ${amountToRegister} ${habit.unit ? unitLabel : amountToRegister === 1 ? 'conclusão' : 'conclusões'}` : 'Marcar como feito' : 'Não programado hoje'}
          </button>
        </div>
      ) : null}
      {error ? <p className="error-text habit-card-error" role="alert">{error}<button type="button" aria-label={`Dispensar erro de ${habit.name}`} onClick={() => onClearError(habit.id)}><X size={14} /></button></p> : null}
      {actionsDialog}
    </article>
  );
}

