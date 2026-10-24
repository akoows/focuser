import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { focuserApi } from '../../services/focuserApi';
import { activateModalFocus } from '../../utils/modalFocus';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = () => toDateKey(new Date());

export default function HabitHistoryDrawer({ habit, onClose, fallbackFocus, onChanged }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [month, setMonth] = useState(() => {
    const date = habit.weeklyProgress?.find((day) => day.isToday)?.date;
    return date ? new Date(`${date}T12:00:00`) : new Date();
  });
  const [series, setSeries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [records, setRecords] = useState({ items: [], pagination: { totalPages: 1 } });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const today = habit.weeklyProgress?.find((day) => day.isToday)?.date ?? todayKey();
  const from = toDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const to = monthEnd > today ? today : monthEnd;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month);
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const isCurrentMonth = month.getFullYear() === todayYear && month.getMonth() + 1 === todayMonth;
  const valuesByDate = useMemo(() => new Map(series.map((day) => [day.date, day])), [series]);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingDays = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const cells = [...Array(leadingDays).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];

  useEffect(() => {
    let active = true;
    Promise.all([
      focuserApi.habits.history(habit.id, { from, to }),
      focuserApi.habits.progress(habit.id, { from, to }),
      focuserApi.habits.checkIns(habit.id, { from, to, page, limit: 10 }),
    ])
      .then(([history, stats, logs]) => { if (active) { setSeries(history.series); setProgress(stats); setRecords(logs); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [habit.id, from, to, page, revision]);

  const removeRecord = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    setError('');
    try {
      await focuserApi.habits.deleteCheckIn(habit.id, deleteId);
      setDeleteId(null);
      setIsLoading(true);
      setPage(1);
      setRevision((value) => value + 1);
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const changeMonth = (offset) => {
    setIsLoading(true);
    setError('');
    setPage(1);
    setDeleteId(null);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  useEffect(() => {
    return activateModalFocus(dialogRef.current, {
      initialFocus: closeButtonRef.current,
      fallbackFocus,
      onEscape: onClose,
    });
  }, [fallbackFocus, onClose]);

  const calendar = (
    <div className="app-dialog-backdrop habit-history-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="habit-history-dialog" style={{ '--habit-color': habit.color || 'var(--accent)' }} role="dialog" aria-modal="true" aria-labelledby="habit-history-title">
        <header className="habit-history-heading">
          <span className="habit-history-icon"><CalendarDays size={19} /></span>
          <div><p className="eyebrow">HISTÓRICO</p><h2 id="habit-history-title">{habit.name}</h2></div>
          <button ref={closeButtonRef} type="button" className="habit-category-filter-close" aria-label="Fechar histórico" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="habit-history-month-nav">
          <button type="button" disabled={isDeleting} aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
          <h3>{monthLabel}</h3>
          <button type="button" aria-label="Próximo mês" disabled={isDeleting || isCurrentMonth} onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
        </div>
        {isLoading ? <p className="muted-state" role="status">Carregando histórico…</p> : null}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        {!isLoading && progress ? <div className="habit-history-summary">
          <span>{progress.completed}/{progress.scheduled} dias concluídos</span>
          <span>{Math.round(progress.completionRate * 100)}% de conclusão</span>
          <span>Sequência: {progress.currentStreak ?? 0} dias</span>
          <span>Melhor: {progress.bestStreak ?? progress.longestStreak ?? 0} dias</span>
        </div> : null}
        {!isLoading && !error ? (
          <div className="habit-history-calendar" aria-label={`Calendário de ${monthLabel}`}>
            {WEEKDAYS.map((weekday) => <span className="habit-history-weekday" key={weekday}>{weekday}</span>)}
            {cells.map((day, index) => {
              if (!day) return <span className="habit-history-empty" key={`empty-${index}`} aria-hidden="true" />;
              const date = toDateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const value = valuesByDate.get(date);
              const isFuture = date > today;
              const level = !value?.scheduled || !value.value ? 0 : value.completed ? 4 : Math.min(3, Math.ceil((value.value / value.target) * 3));
              const status = isFuture ? 'Futuro' : !value?.scheduled ? 'Descanso' : `${value.value} de ${value.target}`;
              return (
                <span
                  className={`habit-history-day${isFuture ? ' is-future' : ''}`}
                  data-level={level}
                  title={`${date}: ${status}`}
                  aria-label={`${day}: ${status}`}
                  key={date}
                >{day}</span>
              );
            })}
          </div>
        ) : null}
        <footer className="habit-history-footer">
          <span className="habit-history-legend"><i data-level="0" />Sem registro</span>
          <span className="habit-history-legend"><i data-level="2" />Parcial</span>
          <span className="habit-history-legend"><i data-level="4" />Concluído</span>
        </footer>
        {!isLoading ? <section aria-label="Registros do hábito">
          <h3>Registros do mês</h3>
          {records.items.length ? <ul className="habit-records">{records.items.map((record) => <li key={record.id}>
            <span>{record.dateKey} · {record.occurrence} {habit.unit || 'conclusões'}</span>
            {deleteId === record.id ? <div className="inline-row"><span>Excluir este registro?</span><button className="button button-danger" disabled={isDeleting} onClick={removeRecord}>Confirmar exclusão</button><button className="text-button" disabled={isDeleting} onClick={() => setDeleteId(null)}>Cancelar</button></div>
              : <button className="text-button" disabled={isDeleting} aria-label={`Excluir registro de ${record.dateKey}`} onClick={() => setDeleteId(record.id)}>Excluir</button>}
          </li>)}</ul> : <p className="muted-state">Nenhum registro neste mês.</p>}
          <div className="inline-row history-pagination">
            <button className="button button-secondary" disabled={isDeleting || page === 1} onClick={() => { setIsLoading(true); setError(''); setDeleteId(null); setPage(page - 1); }}>Anterior</button>
            <span>Página {page} de {Math.max(1, records.pagination.totalPages)}</span>
            <button className="button button-secondary" disabled={isDeleting || page >= records.pagination.totalPages} onClick={() => { setIsLoading(true); setError(''); setDeleteId(null); setPage(page + 1); }}>Próxima</button>
          </div>
        </section> : null}
      </section>
    </div>
  );

  return createPortal(calendar, document.body);
}
