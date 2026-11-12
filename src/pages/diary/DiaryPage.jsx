import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, Search, ShieldCheck } from 'lucide-react';
import { focuserApi } from '../services/focuserApi';
import './DiaryPage.css';

const REFLECTION_PROMPTS = [
  'O que aconteceu hoje?',
  'Como me senti durante o dia?',
  'Qual foi a melhor parte do meu dia?',
  'O que aprendi?',
  'O que gostaria de fazer diferente amanhã?',
];
const SAVE_DELAY_MS = 650;
const MAX_SAVE_ATTEMPTS = 3;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const INITIAL_HISTORY_MONTH = monthKey(new Date());

function shiftMonth(key, offset) {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(Date.UTC(year, month - 1 + offset, 1)));
}

function monthDates(key) {
  const [year, month] = key.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: offset }, (_, index) => `outside-${index}`),
    ...Array.from({ length: days }, (_, index) => `${key}-${String(index + 1).padStart(2, '0')}`),
  ];
}

function displayDate(dateKey, options = { dateStyle: 'full' }) {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' })
    .format(new Date(`${dateKey}T12:00:00.000Z`));
}

function pendingStorageKey(userId, dateKey) {
  return `focuser:diary:pending:${userId}:${dateKey}`;
}

function readPending(userId, dateKey) {
  try {
    const value = window.localStorage.getItem(pendingStorageKey(userId, dateKey));
    if (!value) return null;
    const pending = JSON.parse(value);
    return typeof pending.content === 'string'
      && Number.isInteger(pending.version)
      && pending.version >= 0
      ? pending
      : null;
  } catch {
    return null;
  }
}

function findPreviousPending(userId, dateKey) {
  const prefix = `focuser:diary:pending:${userId}:`;
  const previous = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const pendingDate = key.slice(prefix.length);
      if (pendingDate >= dateKey) continue;
      const value = window.localStorage.getItem(key);
      if (!value) continue;
      const content = JSON.parse(value);
      if (typeof content.content === 'string') previous.push({ dateKey: pendingDate, content: content.content });
    }
  } catch {
    return previous;
  }
  return previous.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

function savePending(userId, dateKey, content, version) {
  try {
    window.localStorage.setItem(pendingStorageKey(userId, dateKey), JSON.stringify({
      content,
      version,
    }));
  } catch {
    return false;
  }
  return true;
}

function clearPending(userId, dateKey) {
  try {
    window.localStorage.removeItem(pendingStorageKey(userId, dateKey));
  } catch {
    return false;
  }
  return true;
}

function isTransientError(error) {
  return !error.status || error.status >= 500 || error.status === 429;
}

export default function DiaryPage({ userId }) {
  const [today, setToday] = useState(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [saveState, setSaveState] = useState('loading');
  const [pageError, setPageError] = useState('');
  const [pendingConflicts, setPendingConflicts] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [historyMonth, setHistoryMonth] = useState(INITIAL_HISTORY_MONTH);
  const [calendarDates, setCalendarDates] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const currentDateRef = useRef(null);
  const currentVersionRef = useRef(0);
  const inFlightRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const contentRef = useRef('');
  const historyQueryRef = useRef('');

  const loadToday = useCallback(async ({ preserveContent = false } = {}) => {
    try {
      const result = await focuserApi.diary.today();
      const previousDate = currentDateRef.current;
      const changedDay = previousDate && previousDate !== result.dateKey;
      const priorPendings = changedDay
        ? [readPending(userId, previousDate)].filter(Boolean).map((pending) => ({ dateKey: previousDate, content: pending.content }))
        : !previousDate ? findPreviousPending(userId, result.dateKey) : [];
      if (changedDay) requestGenerationRef.current += 1;
      currentDateRef.current = result.dateKey;
      setToday(result);
      setPageError('');

      const stored = readPending(userId, result.dateKey);
      const serverEntry = result.entry;
      const serverContent = serverEntry?.content || '';
      const serverVersion = serverEntry?.version || 0;
      if (stored && stored.content !== serverContent) {
        if (stored.version === serverVersion) {
          setContent(stored.content);
          contentRef.current = stored.content;
          setSavedContent(serverContent);
          currentVersionRef.current = serverVersion;
          setSaveState('pending');
          setPendingConflicts((current) => current.filter((pending) => pending.dateKey !== result.dateKey));
        } else {
          setContent(serverContent);
          contentRef.current = serverContent;
          setSavedContent(serverContent);
          currentVersionRef.current = serverVersion;
          setPendingConflicts((current) => [
            ...current.filter((pending) => pending.dateKey !== result.dateKey),
            { dateKey: result.dateKey, content: stored.content },
          ]);
          setSaveState('conflict');
        }
      } else {
        if (stored) clearPending(userId, result.dateKey);
        setContent(serverContent);
        contentRef.current = serverContent;
        setSavedContent(serverContent);
        currentVersionRef.current = serverVersion;
        setPendingConflicts((current) => current.filter((pending) => pending.dateKey !== result.dateKey));
        setSaveState('saved');
      }
      if (priorPendings.length) {
        setPendingConflicts((current) => [
          ...current.filter((pending) => !priorPendings.some((previous) => previous.dateKey === pending.dateKey)),
          ...priorPendings,
        ]);
        setSaveState('conflict');
      }
      if (!previousDate || changedDay) {
        setSelectedEntry(null);
        setHistoryMonth(result.dateKey.slice(0, 7));
      } else if (!preserveContent) {
        setSelectedEntry(null);
      }
    } catch (error) {
      setPageError(error.message);
      setSaveState('error');
    }
  }, [userId]);

  const loadHistory = useCallback(async (page = 1, append = false) => {
    setHistoryLoading(true);
    setHistoryError('');
    const query = historyQueryRef.current.trim();
    try {
      const [year, month] = historyMonth.split('-').map(Number);
      const from = `${historyMonth}-01`;
      const to = `${historyMonth}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
      const result = await focuserApi.diary.list({
        from,
        to,
        ...(query ? { q: query } : {}),
        page,
        pageSize: 20,
      });
      setHistoryItems((current) => append ? [...current, ...result.items] : result.items);
      setHistoryPage(page);
      setHistoryHasMore(result.hasMore);
    } catch (error) {
      setHistoryError(error.message);
      if (!append) setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMonth]);

  const loadCalendar = useCallback(async () => {
    try {
      const result = await focuserApi.diary.calendar({ month: historyMonth });
      setCalendarDates(result.dates);
    } catch (error) {
      setHistoryError(error.message);
    }
  }, [historyMonth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadToday(), 0);
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadToday({ preserveContent: true });
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadToday]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory();
      void loadCalendar();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory, loadCalendar]);

  useEffect(() => {
    historyQueryRef.current = historyQuery;
    const timeout = window.setTimeout(() => void loadHistory(), 300);
    return () => window.clearTimeout(timeout);
  }, [historyQuery, loadHistory]);

  const saveContent = useCallback(async (contentToSave, dateKey) => {
    if (inFlightRef.current || currentDateRef.current !== dateKey || pendingConflicts.some((pending) => pending.dateKey === dateKey)) return;
    inFlightRef.current = true;
    const generation = requestGenerationRef.current;
    setSaveState('saving');
    savePending(userId, dateKey, contentToSave, currentVersionRef.current);
    let lastError;
    try {
      for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
        if (currentDateRef.current !== dateKey || requestGenerationRef.current !== generation) return;
        try {
          const result = await focuserApi.diary.saveToday({
            content: contentToSave,
            expectedDateKey: dateKey,
            expectedVersion: currentVersionRef.current,
          });
          if (currentDateRef.current !== dateKey || requestGenerationRef.current !== generation) return;
          const persistedContent = result.entry?.content || '';
          currentVersionRef.current = result.entry?.version || 0;
          setSavedContent(persistedContent);
          if (!result.entry && !contentToSave.trim() && contentRef.current === contentToSave) {
            contentRef.current = '';
            setContent('');
          }
          if (contentRef.current === contentToSave) {
            setSaveState('saved');
            clearPending(userId, dateKey);
          } else {
            setSaveState('pending');
          }
          setToday(result);
          return;
        } catch (error) {
          lastError = error;
          if (!isTransientError(error) || attempt === MAX_SAVE_ATTEMPTS - 1) break;
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
        }
      }
      if (lastError?.code === 'DIARY_CONFLICT' || lastError?.code === 'DIARY_DATE_CHANGED') {
        setPendingConflicts((current) => [
          ...current.filter((pending) => pending.dateKey !== dateKey),
          { dateKey, content: contentToSave },
        ]);
        setSaveState('conflict');
      } else {
        setSaveState('error');
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [pendingConflicts, userId]);

  useEffect(() => {
    if (!today || !today.dateKey || !today.entry && !content || content === savedContent || pendingConflicts.some((pending) => pending.dateKey === today.dateKey)) return undefined;
    const dateKey = today.dateKey;
    const timeout = window.setTimeout(() => void saveContent(contentRef.current, dateKey), SAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [content, savedContent, today, pendingConflicts, saveContent]);

  const calendarSet = useMemo(() => new Set(calendarDates.map((item) => item.dateKey)), [calendarDates]);
  const selectedDate = selectedEntry?.entry?.dateKey;
  const displayingHistory = Boolean(selectedEntry);
  const calendarCells = useMemo(() => monthDates(historyMonth), [historyMonth]);

  const openEntry = async (dateKey) => {
    if (!dateKey || dateKey.startsWith('outside-') || dateKey === today?.dateKey) {
      setSelectedEntry(null);
      return;
    }
    try {
      const entry = await focuserApi.diary.entry(dateKey);
      setSelectedEntry(entry);
      setPageError('');
    } catch (error) {
      setHistoryError(error.message);
    }
  };

  const changeContent = (nextContent) => {
    contentRef.current = nextContent;
    setContent(nextContent);
    if (today?.dateKey) {
      if (nextContent === savedContent) {
        clearPending(userId, today.dateKey);
        setSaveState('saved');
      } else {
        savePending(userId, today.dateKey, nextContent, currentVersionRef.current);
        setSaveState('pending');
      }
    }
  };

  const insertPrompt = (prompt) => {
    const prefix = content ? `${content.replace(/\s*$/, '')}\n\n` : '';
    changeContent(`${prefix}${prompt}\n`);
    setPromptsOpen(false);
  };

  const copyPending = async (pendingConflict) => {
    try {
      await navigator.clipboard.writeText(pendingConflict.content);
      setCopyStatus('Texto pendente copiado.');
    } catch {
      setCopyStatus('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');
    }
  };

  const discardPendingConflict = async (pendingConflict) => {
    clearPending(userId, pendingConflict.dateKey);
    const discardedDate = pendingConflict.dateKey;
    setPendingConflicts((current) => current.filter((pending) => pending.dateKey !== discardedDate));
    setCopyStatus('');
    if (discardedDate === currentDateRef.current) {
      await loadToday({ preserveContent: true });
      return;
    }
    setSaveState(content === savedContent ? 'saved' : 'pending');
  };

  const historyMonthLabel = useMemo(() => {
    const [year, month] = historyMonth.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  }, [historyMonth]);

  const saveLabels = {
    loading: 'Carregando',
    pending: 'Alterações pendentes',
    saving: 'Salvando…',
    saved: 'Salvo',
    error: 'Erro ao salvar',
    conflict: 'Conflito de sincronização',
  };

  return (
    <div className="diary-page">
      <header className="diary-header">
        <div>
          <p className="eyebrow">Seu espaço pessoal</p>
          <h1>Diário</h1>
          <p className="section-subtitle">Um lugar tranquilo para registrar os dias como eles são.</p>
        </div>
        <div className={`diary-save-status diary-save-${saveState}`} role="status" aria-live="polite">
          <span className="diary-save-dot" />
          {saveLabels[saveState]}
        </div>
      </header>

      {pageError ? <p className="error-text diary-alert" role="alert">{pageError}</p> : null}
      {pendingConflicts.map((pendingConflict) => (
        <section className="diary-conflict" role="alert" key={pendingConflict.dateKey}>
          <div className="diary-conflict-copy">
            <strong>Uma alteração offline não foi sincronizada ({displayDate(pendingConflict.dateKey)}).</strong>
            <p>Essa entrada está fechada ou foi alterada em outra sessão. O rascunho local foi preservado e não será aplicado a outra data.</p>
            {copyStatus ? <small role="status">{copyStatus}</small> : null}
            <details>
              <summary>Ver e selecionar o texto para copiar</summary>
              <textarea aria-label={`Rascunho local de ${pendingConflict.dateKey}`} readOnly value={pendingConflict.content} />
            </details>
          </div>
          <button className="button button-secondary" type="button" onClick={() => void copyPending(pendingConflict)}><Copy size={16} /> Copiar rascunho</button>
          <button className="diary-discard-pending" type="button" onClick={() => void discardPendingConflict(pendingConflict)}>Descartar rascunho local</button>
        </section>
      ))}

      <div className="diary-layout">
        <main className="diary-writing">
          {displayingHistory ? (
            <article className="diary-entry-view">
              <button type="button" className="diary-back-link" onClick={() => setSelectedEntry(null)}><ArrowLeft size={16} /> Voltar para hoje</button>
              <div className="diary-entry-heading">
                <div className="diary-entry-icon"><BookOpen size={19} /></div>
                <div>
                  <p className="eyebrow">Entrada encerrada · somente leitura</p>
                  <h2>{displayDate(selectedDate)}</h2>
                </div>
              </div>
              <div className="diary-entry-content">{selectedEntry.entry.content}</div>
            </article>
          ) : (
            <section className="diary-editor-section">
              <div className="diary-today-heading">
                <div className="diary-entry-icon"><BookOpen size={19} /></div>
                <div>
                  <p className="eyebrow">Hoje · {today?.timezone || 'fuso local da conta'}</p>
                  <h2>{today?.dateKey ? displayDate(today.dateKey) : 'Sua página de hoje'}</h2>
                </div>
                <ShieldCheck className="diary-private-icon" size={18} aria-label="Privado" />
              </div>
              <label className="diary-editor-label" htmlFor="diary-content">Escreva o que quiser. Só você pode ver esta entrada.</label>
              <textarea
                id="diary-content"
                className="diary-editor"
                value={content}
                onChange={(event) => changeContent(event.target.value)}
                placeholder="Como foi o seu dia? Comece por qualquer lugar…"
                maxLength={20_000}
                disabled={!today}
                aria-describedby="diary-editor-hint"
              />
              <div className="diary-editor-footer">
                <span id="diary-editor-hint">{content.length.toLocaleString('pt-BR')} / 20.000</span>
                <button type="button" className="diary-prompts-toggle" aria-expanded={promptsOpen} onClick={() => setPromptsOpen((open) => !open)}>
                  Perguntas para refletir <ChevronDown size={15} />
                </button>
              </div>
              {promptsOpen ? (
                <div className="diary-prompts">
                  {REFLECTION_PROMPTS.map((prompt) => (
                    <button type="button" key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}</button>
                  ))}
                </div>
              ) : null}
            </section>
          )}
        </main>

        <aside className="diary-history">
          <div className="diary-history-title">
            <div>
              <p className="eyebrow">Suas memórias</p>
              <h2>Histórico</h2>
            </div>
            <CalendarDays size={19} />
          </div>

          <section className="diary-calendar" aria-label="Calendário do Diário">
            <div className="diary-calendar-heading">
              <strong>{historyMonthLabel}</strong>
              <div>
                <button type="button" aria-label="Mês anterior" onClick={() => setHistoryMonth((month) => shiftMonth(month, -1))}><ChevronLeft size={17} /></button>
                <button type="button" aria-label="Próximo mês" onClick={() => setHistoryMonth((month) => shiftMonth(month, 1))}><ChevronRight size={17} /></button>
              </div>
            </div>
            <div className="diary-calendar-grid" role="grid">
              {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <span className="diary-calendar-weekday" key={`${day}-${index}`}>{day}</span>)}
              {calendarCells.map((dateKey) => dateKey.startsWith('outside-')
                ? <span key={dateKey} aria-hidden="true" />
                : (
                  <button
                    type="button"
                    key={dateKey}
                    className={`diary-calendar-day${calendarSet.has(dateKey) ? ' has-entry' : ''}${dateKey === today?.dateKey ? ' is-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}`}
                    aria-label={`${displayDate(dateKey, { day: 'numeric', month: 'long', year: 'numeric' })}${calendarSet.has(dateKey) ? ', possui entrada' : ''}`}
                    aria-pressed={dateKey === selectedDate}
                    disabled={!today || dateKey > today.dateKey}
                    onClick={() => void openEntry(dateKey)}
                  >
                    {Number(dateKey.slice(-2))}
                  </button>
                ))}
            </div>
          </section>

          <form className="diary-history-search" onSubmit={(event) => { event.preventDefault(); void loadHistory(); }}>
            <Search size={16} />
            <input aria-label="Buscar no Diário" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Buscar nas entradas" maxLength={100} />
          </form>

          {historyError ? <p className="error-text diary-history-error" role="alert">{historyError}</p> : null}
          <section className="diary-history-list" aria-label="Entradas anteriores" aria-busy={historyLoading}>
            {historyItems.map((entry) => (
              <button className={`diary-history-item${entry.dateKey === selectedDate ? ' selected' : ''}`} type="button" key={entry.id} onClick={() => void openEntry(entry.dateKey)}>
                <span className="diary-history-item-date">{displayDate(entry.dateKey, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="diary-history-item-preview">{entry.preview}</span>
              </button>
            ))}
            {!historyLoading && historyItems.length === 0
              ? <p className="diary-empty-history">{historyQuery ? 'Nenhuma entrada corresponde à busca neste mês.' : 'Suas entradas anteriores aparecerão aqui.'}</p>
              : null}
            {historyHasMore ? <button type="button" className="diary-load-more" disabled={historyLoading} onClick={() => void loadHistory(historyPage + 1, true)}>{historyLoading ? 'Carregando…' : 'Carregar mais'}</button> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
