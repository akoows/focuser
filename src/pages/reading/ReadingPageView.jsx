import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BookOpen, Check, Clock3, Expand, Focus, Headphones, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Shrink, Trash2, User, Users, VolumeX, Waves, X } from 'lucide-react';
import { focuserApi } from '../../services/focuserApi';
import { activateModalFocus } from '../../utils/modalFocus';
import { appendUniqueBooks, loadBookPages } from './bookPagination';
function ReadingFeedCover({ book }) {
  const coverSource = book.coverUrl || (book.coverId
    ? `https://covers.openlibrary.org/b/id/${book.coverId}-S.jpg`
    : null);
  const [hasCover, setHasCover] = useState(Boolean(coverSource));
  return (
    <span className="reading-feed-cover">
      {coverSource && hasCover
        ? <img src={coverSource} alt="" loading="lazy" onError={() => setHasCover(false)} />
        : <BookOpen size={18} aria-hidden="true" />}
    </span>
  );
}

function CoverOption({ book, selected, onSelect }) {
  const [hasCover, setHasCover] = useState(true);
  return (
    <button
      type="button"
      className={`cover-option ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {hasCover
        ? <img src={book.coverUrl} alt={`Capa: ${book.title}`} loading="lazy" onError={() => setHasCover(false)} />
        : <span className="cover-option-fallback" aria-hidden="true"><BookOpen size={24} /></span>}
      <span className="cover-option-title">{book.title}</span>
      <span className="cover-option-author">{book.author || 'Autor não informado'}{book.year ? ` · ${book.year}` : ''}</span>
      <span className="cover-option-isbn">{book.isbn ? `ISBN ${book.isbn}` : 'ISBN indisponível'}</span>
      <span className="cover-option-source">{book.source}</span>
      {book.recommended ? <span className="cover-option-badge">Sugestão Groq</span> : null}
      {selected ? <span className="cover-option-selected">Selecionada</span> : null}
    </button>
  );
}

function formatReadingTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

const READING_SOUNDS = [
  { value: 'none', label: 'Silêncio', detail: 'Sem áudio', icon: VolumeX },
  { value: 'rain', label: 'Chuva', detail: 'Chuva suave', icon: Waves },
  { value: 'waves', label: 'Ondas', detail: 'Mar tranquilo', icon: Waves },
];

function ReadingSoundPicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);
  const selectedSound = READING_SOUNDS.find(({ value: sound }) => sound === value) || READING_SOUNDS[0];
  const SelectedIcon = selectedSound.icon;

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="reading-sound-picker" ref={pickerRef}>
      <button
        type="button"
        className="reading-sound-trigger"
        aria-label={`Som ambiente: ${selectedSound.label}`}
        title={`Som ambiente: ${selectedSound.label}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="reading-sound-trigger-icon"><SelectedIcon size={18} /></span>
        <span><small>Som ambiente</small><strong>{selectedSound.label}</strong></span>
        <Headphones size={17} className="reading-sound-trigger-action" />
      </button>
      {isOpen ? (
        <div className="reading-sound-popover" role="dialog" aria-label="Escolher som ambiente">
          <div className="reading-sound-popover-heading"><strong>Escolha um som</strong><button type="button" className="text-button" aria-label="Fechar escolha de som" onClick={() => setIsOpen(false)}><X size={17} /></button></div>
          <div className="reading-sound-options">
            {READING_SOUNDS.map(({ value: sound, label, detail, icon: SoundIcon }) => (
              <button
                key={sound}
                type="button"
                className={`reading-sound-option ${value === sound ? 'selected' : ''}`}
                aria-pressed={value === sound}
                onClick={() => { onChange(sound); setIsOpen(false); }}
              >
                <SoundIcon size={18} />
                <span><strong>{label}</strong><small>{detail}</small></span>
                {value === sound ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReadingPageView({ confirm, user, AppLayout, PageHeader, ApiState, MetricCard, formatReadingDuration, createFocusStatusSessionId, READING_BOOK_PAGE_SIZE, NumberInput, ReadingBookCover }) {
  const [books, setBooks] = useState([]);
  const [booksPagination, setBooksPagination] = useState(null);
  const [booksPage, setBooksPage] = useState(1);
  const [isLoadingMoreBooks, setIsLoadingMoreBooks] = useState(false);
  const [booksPageError, setBooksPageError] = useState('');
  const [today, setToday] = useState(null);
  const [readingFeed, setReadingFeed] = useState([]);
  const [isFeedLoading, setIsFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [feedPagination, setFeedPagination] = useState(null);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [feedPageError, setFeedPageError] = useState('');
  const feedRequestIdRef = useRef(0);
  const [filter, setFilter] = useState('active');
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [sessionSetup, setSessionSetup] = useState(null);
  const [readingSession, setReadingSession] = useState(null);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const readingFinishDialogRef = useRef(null);
  const readingPagesInputRef = useRef(null);
  const [sessionForm, setSessionForm] = useState({ pagesRead: '' });
  const [sessionClock, setSessionClock] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusNotice, setFocusNotice] = useState('');
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', coverId: null, coverUrl: null, totalPages: '', currentPage: '0' });
  const [coverOptions, setCoverOptions] = useState([]);
  const [coverSources, setCoverSources] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLookingUpIsbn, setIsLookingUpIsbn] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const sessionPanelRef = useRef(null);
  const ambientAudioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const booksRequestIdRef = useRef(0);

  const loadReadingFeed = useCallback(async () => {
    const requestId = ++feedRequestIdRef.current;
    setIsFeedLoading(true);
    setFeedError('');
    setFeedPageError('');
    try {
      const response = await focuserApi.reading.feed();
      if (requestId !== feedRequestIdRef.current) return;
      setReadingFeed(response.items);
      setFeedPagination(response.pagination);
    } catch (requestError) {
      if (requestId === feedRequestIdRef.current) setFeedError(requestError.message);
    } finally {
      if (requestId === feedRequestIdRef.current) setIsFeedLoading(false);
    }
  }, []);

  const loadMoreFeed = async () => {
    if (isLoadingMoreFeed || !feedPagination?.hasMore) return;
    const requestId = feedRequestIdRef.current;
    setIsLoadingMoreFeed(true);
    setFeedPageError('');
    try {
      const response = await focuserApi.reading.feed({ limit: 20, cursor: feedPagination.nextCursor });
      if (requestId !== feedRequestIdRef.current) return;
      setReadingFeed((current) => [...current, ...response.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setFeedPagination(response.pagination);
    } catch (requestError) {
      if (requestId === feedRequestIdRef.current) setFeedPageError(requestError.message);
    } finally {
      if (requestId === feedRequestIdRef.current) setIsLoadingMoreFeed(false);
    }
  };

  const loadReading = useCallback(async (throughPage = 1) => {
    const requestId = ++booksRequestIdRef.current;
    setIsLoading(true);
    setError('');
    setBooksPageError('');
    try {
      const [booksResponse, todayResponse] = await Promise.all([
        loadBookPages(focuserApi.reading.listBooks, {
          status: filter,
          limit: READING_BOOK_PAGE_SIZE,
          pageCount: throughPage,
        }),
        focuserApi.reading.today(),
      ]);
      if (requestId !== booksRequestIdRef.current) return false;
      setBooks(booksResponse.items);
      setBooksPagination(booksResponse.pagination);
      setBooksPage(booksResponse.pagination.page);
      setToday(todayResponse);
      return true;
    } catch (requestError) {
      if (requestId === booksRequestIdRef.current) setError(requestError.message);
      return false;
    } finally {
      if (requestId === booksRequestIdRef.current) setIsLoading(false);
    }
  }, [filter, READING_BOOK_PAGE_SIZE]);

  const loadMoreBooks = async () => {
    if (isLoadingMoreBooks || !booksPagination || booksPage >= booksPagination.totalPages) return;
    const requestId = booksRequestIdRef.current;
    const nextPage = booksPage + 1;
    setIsLoadingMoreBooks(true);
    setBooksPageError('');
    try {
      const response = await focuserApi.reading.listBooks({
        status: filter,
        page: String(nextPage),
        limit: String(READING_BOOK_PAGE_SIZE),
      });
      if (requestId !== booksRequestIdRef.current) return;
      setBooks((current) => appendUniqueBooks(current, response.items));
      setBooksPagination(response.pagination);
      setBooksPage(response.pagination.page);
    } catch (requestError) {
      if (requestId === booksRequestIdRef.current) setBooksPageError(requestError.message);
    } finally {
      if (requestId === booksRequestIdRef.current) setIsLoadingMoreBooks(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) return loadReadingFeed();
      return undefined;
    });
    return () => {
      active = false;
      feedRequestIdRef.current += 1;
    };
  }, [loadReadingFeed]);

  useEffect(() => {
    let active = true;
    const requestId = ++booksRequestIdRef.current;
    Promise.all([
      loadBookPages(focuserApi.reading.listBooks, {
        status: filter,
        limit: READING_BOOK_PAGE_SIZE,
        pageCount: 1,
      }),
      focuserApi.reading.today(),
    ])
      .then(([booksResponse, todayResponse]) => {
        if (!active || requestId !== booksRequestIdRef.current) return;
        setBooks(booksResponse.items);
        setBooksPagination(booksResponse.pagination);
        setBooksPage(booksResponse.pagination.page);
        setToday(todayResponse);
      })
      .catch((requestError) => {
        if (active && requestId === booksRequestIdRef.current) setError(requestError.message);
      })
      .finally(() => {
        if (active && requestId === booksRequestIdRef.current) setIsLoading(false);
      });
    return () => {
      active = false;
      if (booksRequestIdRef.current === requestId) booksRequestIdRef.current += 1;
    };
  }, [filter, READING_BOOK_PAGE_SIZE]);

  useEffect(() => {
    if (readingSession?.stage !== 'active' || !readingSession.startedAt) return undefined;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = readingSession.elapsedSeconds + Math.floor((now - readingSession.startedAt) / 1000);
      setSessionClock(now);
      if (readingSession.durationSeconds && elapsed >= readingSession.durationSeconds) {
        setReadingSession((current) => current?.stage === 'active'
          ? { ...current, elapsedSeconds: current.durationSeconds, startedAt: null, timerExpired: true }
          : current);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [readingSession]);

  useEffect(() => {
    if (!isFinishingSession) return undefined;
    return activateModalFocus(readingFinishDialogRef.current, {
      initialFocus: readingPagesInputRef.current,
      fallbackFocus: () => sessionPanelRef.current,
      onEscape: () => {
        setReadingSession((current) => current ? { ...current, stage: 'active', startedAt: null } : current);
        setIsFinishingSession(false);
        setError('');
      },
    });
  }, [isFinishingSession]);

  const readingFocusSessionId = readingSession?.focusStatusSessionId;
  const readingFocusBookId = readingSession?.book?.id;
  const isReadingFocusActive = readingSession?.stage === 'active' && Boolean(readingSession.startedAt);

  useEffect(() => {
    const sessionId = readingFocusSessionId;
    if (!sessionId) return undefined;
    if (!isReadingFocusActive) {
      focuserApi.reading.clearFocusStatus(sessionId)
        .catch((requestError) => setFocusNotice(`Não foi possível atualizar o status de foco: ${requestError.message}`));
      return undefined;
    }

    const updateFocusStatus = () => {
      focuserApi.reading.setFocusStatus({ bookId: readingFocusBookId, sessionId })
        .catch((requestError) => setFocusNotice(`Não foi possível atualizar o status de foco: ${requestError.message}`));
    };
    updateFocusStatus();
    const interval = window.setInterval(updateFocusStatus, 30000);
    return () => window.clearInterval(interval);
  }, [readingFocusBookId, readingFocusSessionId, isReadingFocusActive]);

  useEffect(() => {
    if (readingSession?.stage !== 'active' || !readingSession.startedAt) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [readingSession?.stage, readingSession?.startedAt]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === sessionPanelRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (readingSession?.stage !== 'active' || readingSession.startedAt || isFullscreen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      sessionPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [readingSession?.stage, readingSession?.startedAt, isFullscreen]);

  const stopAmbientAudio = () => {
    const audio = ambientAudioRef.current;
    ambientAudioRef.current = null;
    if (!audio) return;
    audio.source.stop();
    audio.modulator?.stop();
    audio.context.close();
  };

  const playAmbientAudio = (sound) => {
    if (sound === 'none') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setFocusNotice('Seu navegador não oferece suporte ao áudio ambiente.');
      return;
    }
    try {
      const context = new AudioContextClass();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      const filterNode = context.createBiquadFilter();
      const volume = context.createGain();
      const modulator = sound === 'waves' ? context.createOscillator() : null;
      const modulationDepth = sound === 'waves' ? context.createGain() : null;
      source.buffer = buffer;
      source.loop = true;
      filterNode.type = sound === 'waves' ? 'lowpass' : 'bandpass';
      filterNode.frequency.value = sound === 'waves' ? 420 : 1150;
      filterNode.Q.value = 0.45;
      volume.gain.value = 0.025;
      if (modulator && modulationDepth) {
        modulator.frequency.value = 0.12;
        modulationDepth.gain.value = 0.012;
        modulator.connect(modulationDepth);
        modulationDepth.connect(volume.gain);
        modulator.start();
      }
      source.connect(filterNode);
      filterNode.connect(volume);
      volume.connect(context.destination);
      source.start();
      ambientAudioRef.current = { context, source, modulator };
      context.resume().catch(() => setFocusNotice('Não foi possível iniciar o áudio. Verifique as permissões de som do navegador.'));
    } catch {
      setFocusNotice('Não foi possível iniciar o áudio ambiente neste navegador.');
    }
  };

  useEffect(() => {
    if (readingSession?.stage === 'active') return undefined;
    stopAmbientAudio();
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (sessionPanelRef.current && document.fullscreenElement === sessionPanelRef.current) {
      document.exitFullscreen().catch(() => setFocusNotice('Não foi possível fechar a tela cheia automaticamente.'));
    }
    return undefined;
  }, [readingSession?.stage]);

  useEffect(() => () => {
    stopAmbientAudio();
    if (wakeLockRef.current) wakeLockRef.current.release();
  }, []);

  const openBookForm = (book = null) => {
    setEditingBook(book);
    setCoverOptions([]);
    setCoverSources(null);
    setBookForm(book
      ? { title: book.title, author: book.author || '', isbn: book.isbn || '', coverId: book.coverId || null, coverUrl: book.coverUrl || null, totalPages: String(book.totalPages), currentPage: String(book.currentPage) }
      : { title: '', author: '', isbn: '', coverId: null, coverUrl: null, totalPages: '', currentPage: '0' });
    setShowBookForm(true);
    setError('');
  };

  const saveBook = async (event) => {
    event.preventDefault();
    const id = editingBook?.id || 'new-book';
    setBusyId(id);
    setError('');
    const data = {
      title: bookForm.title.trim(),
      author: bookForm.author.trim() || null,
      isbn: bookForm.isbn.trim() || null,
      coverId: bookForm.coverId,
      coverUrl: bookForm.coverUrl,
      totalPages: Number(bookForm.totalPages),
      currentPage: Number(bookForm.currentPage),
    };
    try {
      if (editingBook) await focuserApi.reading.updateBook(editingBook.id, data);
      else await focuserApi.reading.createBook(data);
      setShowBookForm(false);
      setEditingBook(null);
      await loadReading(editingBook ? booksPage : 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const lookupIsbn = async () => {
    const title = bookForm.title.trim();
    if (!title || isLookingUpIsbn) return;
    setIsLookingUpIsbn(true);
    setError('');
    setCoverOptions([]);
    setCoverSources(null);
    try {
      const result = await focuserApi.reading.lookupIsbn({
        title,
        ...(bookForm.author.trim() ? { author: bookForm.author.trim() } : {}),
        ...(bookForm.isbn.trim() ? { isbn: bookForm.isbn.trim() } : {}),
      });
      setCoverOptions(result.items);
      setCoverSources(result.sources);
      if (result.items.length === 0) setError('Não encontrei capas disponíveis para esse livro.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLookingUpIsbn(false);
    }
  };

  const selectCover = (edition) => {
    setBookForm((current) => ({
      ...current,
      isbn: edition.isbn || '',
      coverId: edition.coverId,
      coverUrl: edition.coverUrl,
      author: current.author.trim() || edition.author || '',
    }));
    setError('');
  };

  const startReadingSession = async (event) => {
    event.preventDefault();
    if (!sessionSetup) return;
    const fullscreenRequest = sessionPanelRef.current?.requestFullscreen
      ? sessionPanelRef.current.requestFullscreen().catch(() => {
        setFocusNotice('Não foi possível abrir a tela cheia. O modo foco continua disponível nesta página.');
      })
      : Promise.resolve().then(() => {
        setFocusNotice('A tela cheia não é compatível com este navegador; você ainda pode manter a sessão aberta.');
      });
    setFocusNotice('');
    const durationSeconds = sessionSetup.mode === 'free' ? null : Number(sessionSetup.minutes) * 60;
    const startedAt = Date.now();
    setSessionClock(startedAt);
    setReadingSession({
      book: sessionSetup.book,
      focusStatusSessionId: createFocusStatusSessionId(),
      stage: 'active',
      durationSeconds,
      elapsedSeconds: 0,
      startedAt,
      sound: 'none',
      timerExpired: false,
    });
    setSessionSetup(null);
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        setFocusNotice('O navegador não conseguiu manter a tela ligada. Ajuste o bloqueio automático do aparelho durante a leitura.');
      }
    }
    await fullscreenRequest;
  };

  const closeSessionSetup = () => {
    setSessionSetup(null);
    setFocusNotice('');
  };

  const pauseReadingSession = () => {
    setReadingSession((current) => {
      if (!current || current.stage !== 'active' || !current.startedAt) return current;
      return {
        ...current,
        elapsedSeconds: current.elapsedSeconds + Math.floor((Date.now() - current.startedAt) / 1000),
        startedAt: null,
      };
    });
  };

  const resumeReadingSession = () => {
    if (readingSession?.timerExpired) return;
    setSessionClock(Date.now());
    setReadingSession((current) => current?.stage === 'active' && !current.startedAt
      ? { ...current, focusStatusSessionId: createFocusStatusSessionId(), startedAt: Date.now() }
      : current);
  };

  const finishReadingSession = () => {
    setReadingSession((current) => {
      if (!current || current.stage !== 'active') return current;
      const elapsedSeconds = current.elapsedSeconds + (current.startedAt
        ? Math.floor((Date.now() - current.startedAt) / 1000)
        : 0);
      return { ...current, stage: 'complete', elapsedSeconds, startedAt: null };
    });
    setIsFinishingSession(true);
    setError('');
  };

  const resumeSessionAfterFinish = () => {
    setReadingSession((current) => current
      ? { ...current, stage: 'active', startedAt: null }
      : current);
    setIsFinishingSession(false);
    setError('');
  };

  const changeReadingSound = (sound) => {
    if (!readingSession || readingSession.stage !== 'active') return;
    stopAmbientAudio();
    setFocusNotice('');
    if (sound !== 'none') playAmbientAudio(sound);
    setReadingSession((current) => current ? { ...current, sound } : current);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === sessionPanelRef.current) {
      await document.exitFullscreen();
      return;
    }
    if (!sessionPanelRef.current?.requestFullscreen) {
      setFocusNotice('A tela cheia não é compatível com este navegador.');
      return;
    }
    try {
      await sessionPanelRef.current.requestFullscreen();
      setFocusNotice('');
    } catch {
      setFocusNotice('Não foi possível abrir a tela cheia neste navegador.');
    }
  };

  const saveReadingLog = async (event) => {
    event.preventDefault();
    if (!readingSession) return;
    const pagesRead = Number(sessionForm.pagesRead);
    const maxPages = Math.min(10000, readingSession.book.totalPages - readingSession.book.currentPage);
    if (!Number.isInteger(pagesRead) || pagesRead < 1 || pagesRead > maxPages) {
      setError(`Informe páginas entre 1 e ${maxPages} antes de finalizar a sessão.`);
      return;
    }
    const elapsedSeconds = readingSession.elapsedSeconds + (readingSession.stage === 'active' && readingSession.startedAt
      ? Math.floor((Date.now() - readingSession.startedAt) / 1000)
      : 0);
    setBusyId(readingSession.book.id);
    setError('');
    try {
      await focuserApi.reading.logSession(readingSession.book.id, {
        pagesRead,
        minutesRead: Math.max(1, Math.ceil(elapsedSeconds / 60)),
      });
      setReadingSession(null);
      setIsFinishingSession(false);
      setSessionForm({ pagesRead: '' });
      setFocusNotice('');
      await Promise.all([loadReading(booksPage), loadReadingFeed()]);
    } catch (requestError) {
      if (requestError.code === 'REQUEST_OUTCOME_UNKNOWN') {
        await Promise.allSettled([loadReading(booksPage), loadReadingFeed()]);
        setError(`${requestError.message} Atualizei a biblioteca e o histórico; confira o progresso do livro antes de tentar novamente.`);
      } else {
        setError(requestError.message);
      }
    } finally {
      setBusyId('');
    }
  };

  const elapsedReadingSeconds = readingSession
    ? readingSession.elapsedSeconds + (readingSession.stage === 'active' && readingSession.startedAt
      ? Math.floor((sessionClock - readingSession.startedAt) / 1000)
      : 0)
    : 0;

  const updateSessionPages = (value) => {
    setSessionForm({ pagesRead: value });
    setError('');
  };

  const toggleArchive = async (book) => {
    setBusyId(book.id);
    setError('');
    try {
      await focuserApi.reading.updateBook(book.id, { isActive: !book.isActive });
      await loadReading(booksPage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const removeBook = async (book) => {
    if (!await confirm({
      title: 'Excluir livro?',
      message: `Excluir "${book.title}" e seu histórico de leitura? Esta ação não pode ser desfeita.`,
    })) return;
    setBusyId(book.id);
    setError('');
    try {
      await focuserApi.reading.removeBook(book.id);
      await loadReading(booksPage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <AppLayout>
      <section className="reading-library">
        <PageHeader
          title="Leituras"
          subtitle="acompanhe os livros e registre seu ritmo diário."
          action={<button type="button" className="button button-primary" onClick={() => openBookForm()}><Plus size={17} /> Adicionar livro</button>}
        />
      <section className="metrics-grid reading-metrics" aria-label="Resumo de leitura de hoje">
        <MetricCard label="Páginas hoje" value={today?.totalPages ?? '—'} hint="Lidas hoje" icon={BookOpen} />
        <MetricCard label="Tempo hoje" value={`${today?.totalMinutes ?? '—'} min`} hint="Minutos de leitura" icon={Clock3} />
        <MetricCard label="Livros na lista" value={booksPagination?.total ?? books.length} hint={filter === 'active' ? 'Em leitura' : 'Nesta categoria'} icon={BookOpen} />
      </section>
      <section className="reading-feed-section" aria-labelledby="reading-feed-title">
        <div className="reading-feed-heading">
          <div className="reading-feed-title-group">
            <span className="reading-feed-community-icon"><Users size={20} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">seu círculo de leitura</p>
              <h2 id="reading-feed-title">Comunidade</h2>
              <p className="muted-state">Um pouco do que você e seus amigos estão lendo.</p>
            </div>
          </div>
          <div className="reading-feed-heading-actions">
            {!isFeedLoading && !feedError && readingFeed.length ? <span className="reading-feed-count">{readingFeed.length} recentes</span> : null}
            <button type="button" className="button button-secondary reading-feed-refresh" onClick={loadReadingFeed} disabled={isFeedLoading}>
              <Activity size={15} aria-hidden="true" />{isFeedLoading ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
        </div>
        {feedError ? (
          <div className="reading-feed-state reading-feed-error" role="alert">
            <span className="reading-feed-state-icon"><Activity size={19} aria-hidden="true" /></span>
            <div>
              <strong>O feed não carregou</strong>
              <p>{feedError}</p>
            </div>
            <button type="button" className="button button-secondary" onClick={loadReadingFeed} disabled={isFeedLoading}>Tentar novamente</button>
          </div>
        ) : isFeedLoading ? (
          <div className="reading-feed-skeleton-list" role="status" aria-label="Carregando leituras recentes">
            {[0, 1, 2].map((item) => (
              <div className="reading-feed-skeleton" key={item} aria-hidden="true">
                <span className="reading-feed-skeleton-avatar" />
                <span className="reading-feed-skeleton-content">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="reading-feed-skeleton-stats"><i /><i /></span>
              </div>
            ))}
          </div>
        ) : readingFeed.length ? (
          <ol className="reading-feed-list">
            {readingFeed.map((entry) => (
              <li className="reading-feed-item" key={entry.id}>
                {entry.user.username ? (
                  <Link className="reading-feed-reader" to={`/u/${encodeURIComponent(entry.user.username)}`} aria-label={`Ver perfil de ${entry.user.name}`}>
                    {entry.user.avatarUrl
                      ? <img src={entry.user.avatarUrl} alt="" loading="lazy" />
                      : <User size={19} aria-hidden="true" />}
                  </Link>
                ) : (
                  <span className="reading-feed-reader" aria-label={entry.user.name}>
                    {entry.user.avatarUrl
                      ? <img src={entry.user.avatarUrl} alt="" loading="lazy" />
                      : <User size={19} aria-hidden="true" />}
                  </span>
                )}
                <div className="reading-feed-content">
                  <div className="reading-feed-person">
                    {entry.user.username
                      ? <Link to={`/u/${encodeURIComponent(entry.user.username)}`}>{entry.user.id === user?.id ? 'Você' : entry.user.name}</Link>
                      : <span>{entry.user.id === user?.id ? 'Você' : entry.user.name}</span>}
                    <span>registrou uma leitura</span>
                    <time dateTime={entry.loggedAt}>{new Date(entry.loggedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</time>
                  </div>
                  <div className="reading-feed-book">
                    <ReadingFeedCover book={entry.book} />
                    <span className="reading-feed-book-info">
                      <strong>{entry.book.title}</strong>
                      {entry.book.author ? <small>{entry.book.author}</small> : null}
                    </span>
                  </div>
                </div>
                <div className="reading-feed-stats">
                  <span className="reading-feed-pages">{entry.pagesRead} pág.</span>
                  <span className="reading-feed-duration"><Clock3 size={14} aria-hidden="true" />{formatReadingDuration(entry.minutesRead)}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="reading-feed-state reading-feed-empty">
            <span className="reading-feed-state-icon"><BookOpen size={22} aria-hidden="true" /></span>
            <div>
              <strong>Seu círculo ainda está em silêncio</strong>
              <p>Quando você ou seus amigos registrarem uma leitura, ela aparecerá aqui.</p>
            </div>
            <Link className="button button-secondary" to="/app/amigos"><Users size={16} aria-hidden="true" />Ver amigos</Link>
          </div>
        )}
        {feedPageError ? <p role="alert" className="error-text">{feedPageError}</p> : null}
        {feedPagination?.hasMore ? <button type="button" className="button button-secondary" disabled={isLoadingMoreFeed} onClick={loadMoreFeed}>
          {isLoadingMoreFeed ? 'Carregando…' : 'Carregar mais leituras'}
        </button> : null}
      </section>
      <div className="filter-row" role="group" aria-label="Filtrar livros">
        {[['active', 'Lendo'], ['archived', 'Finalizados/arquivados'], ['all', 'Todos']].map(([value, label]) => (
          <button key={value} type="button" className={`filter-chip ${filter === value ? 'active' : ''}`} onClick={() => { setIsLoading(true); setError(''); setFilter(value); }}>{label}</button>
        ))}
      </div>
      {error && !showBookForm && !sessionSetup && !readingSession ? <div className="card state-card error-state" role="alert">{error}</div> : null}
      {sessionSetup || readingSession ? (
        <section className={`reading-session card ${readingSession?.stage === 'active' ? 'reading-session-focus' : ''} ${readingSession?.stage === 'active' && !readingSession.startedAt ? 'reading-session-paused' : ''}`} ref={sessionPanelRef} tabIndex="-1" aria-label="Sessão de leitura">
          {sessionSetup ? (
            <form onSubmit={startReadingSession}>
              <div className="reading-session-header">
                <div><p className="eyebrow">Sessão de leitura</p><h2>{sessionSetup.book.title}</h2><p>{sessionSetup.book.author || 'Escolha um tempo e comece a ler no seu ritmo.'}</p></div>
                <button type="button" className="text-button" aria-label="Fechar configuração" onClick={closeSessionSetup}><X size={20} /></button>
              </div>
              <div className="reading-session-options">
                <fieldset className="session-choice">
                  <legend>Quanto tempo você quer ler?</legend>
                  <div className="session-choice-buttons">
                    <button type="button" className={`filter-chip ${sessionSetup.mode === 'timed' ? 'active' : ''}`} aria-pressed={sessionSetup.mode === 'timed'} onClick={() => setSessionSetup({ ...sessionSetup, mode: 'timed' })}>Definir tempo</button>
                    <button type="button" className={`filter-chip ${sessionSetup.mode === 'free' ? 'active' : ''}`} aria-pressed={sessionSetup.mode === 'free'} onClick={() => setSessionSetup({ ...sessionSetup, mode: 'free' })}>Leitura livre</button>
                  </div>
                </fieldset>
                {sessionSetup.mode === 'timed' ? (
                  <div className="session-duration">
                    <div className="session-choice-buttons" role="group" aria-label="Tempos sugeridos">
                      {[15, 25, 45].map((minutes) => <button key={minutes} type="button" className={`filter-chip ${Number(sessionSetup.minutes) === minutes ? 'active' : ''}`} aria-pressed={Number(sessionSetup.minutes) === minutes} onClick={() => setSessionSetup({ ...sessionSetup, minutes: String(minutes) })}>{minutes} min</button>)}
                    </div>
                    <label><span>Ou escolha os minutos (1 a 1440)</span><NumberInput aria-label="minutos da sessão" required min="1" max="1440" step="1" value={sessionSetup.minutes} onValueChange={(value) => setSessionSetup({ ...sessionSetup, minutes: value })} /></label>
                  </div>
                ) : <p className="muted-state">Leia sem contagem regressiva; encerre quando quiser.</p>}
              </div>
              <p className="session-device-note">O modo foco abre em tela cheia e tenta manter a tela ligada. Por segurança, sites não podem ativar o “Não Perturbe” automaticamente; ative-o manualmente pelos ajustes rápidos do Android ou pela Central de Controle do iPhone.</p>
              <div className="inline-row"><button type="button" className="button button-secondary" onClick={closeSessionSetup}>Cancelar</button><button type="submit" className="button button-primary"><Focus size={17} /> Começar leitura</button></div>
            </form>
          ) : readingSession.stage === 'active' ? (
            <form onSubmit={saveReadingLog}>
              <div className="focus-topbar">
                <span className="focus-status">{readingSession.startedAt ? 'LEITURA EM FOCO' : 'LEITURA PAUSADA'}</span>
                <button type="button" className="focus-fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Ativar tela cheia'} title={isFullscreen ? 'Sair da tela cheia' : 'Ativar tela cheia'}>{isFullscreen ? <Shrink size={18} /> : <Expand size={18} />}</button>
              </div>
              <div className="focus-book">
                <h2>{readingSession.book.title}</h2>
                {readingSession.book.author ? <p>{readingSession.book.author}</p> : null}
              </div>
              <div className="focus-timer-panel">
                <div className="reading-session-clock" role="timer" aria-live="off">{formatReadingTime(readingSession.durationSeconds ? Math.max(0, readingSession.durationSeconds - elapsedReadingSeconds) : elapsedReadingSeconds)}</div>
                <span>{readingSession.durationSeconds ? `de ${formatReadingTime(readingSession.durationSeconds)}` : 'tempo de leitura'}</span>
              </div>
              <div className="focus-controls-row">
                {readingSession.timerExpired
                  ? <p className="focus-time-finished" role="status">Seu tempo acabou. Informe as páginas para finalizar.</p>
                  : !readingSession.startedAt
                  ? <button type="button" className="button button-primary" onClick={resumeReadingSession}><Play size={17} /> Continuar</button>
                  : <button type="button" className="button button-primary" onClick={pauseReadingSession}><Pause size={17} /> Pausar</button>}
                <ReadingSoundPicker value={readingSession.sound} onChange={changeReadingSound} />
                <button type="button" className="focus-finish-button" onClick={finishReadingSession}><Check size={17} strokeWidth={2} /> Finalizar sessão</button>
              </div>
              {focusNotice ? <p className="session-notice" role="status">{focusNotice}</p> : null}
            </form>
          ) : (
            isFinishingSession ? (
              <div className="session-finish-backdrop">
                <form ref={readingFinishDialogRef} className="session-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="session-finish-title" onSubmit={saveReadingLog}>
                  <div className="session-finish-icon"><BookOpen size={22} /></div>
                  <p className="eyebrow">SESSÃO CONCLUÍDA · {formatReadingTime(readingSession.elapsedSeconds)}</p>
                  <h2 id="session-finish-title">Quantas páginas você leu?</h2>
                  <p className="session-finish-book">{readingSession.book.title}</p>
                  <label className="session-pages"><span>Páginas lidas</span><NumberInput ref={readingPagesInputRef} aria-label="páginas lidas" required min="1" max={Math.min(10000, readingSession.book.totalPages - readingSession.book.currentPage)} step="1" value={sessionForm.pagesRead} onValueChange={updateSessionPages} placeholder="Ex.: 12" /></label>
                  {error ? <p className="error-text" role="alert">{error}</p> : null}
                  <div className="session-finish-actions">
                    <button type="button" className="button button-secondary" onClick={resumeSessionAfterFinish}>Voltar à leitura</button>
                    <button type="submit" className="button button-primary" disabled={Boolean(busyId) || !sessionForm.pagesRead}>{busyId ? 'Salvando…' : 'Salvar leitura'}</button>
                  </div>
                </form>
              </div>
            ) : null
          )}
        </section>
      ) : null}
      {showBookForm ? (
        <form className="goal-form card" onSubmit={saveBook}>
          <h3>{editingBook ? 'Editar livro' : 'Adicionar livro'}</h3>
          <div className="goal-form-grid">
            <label><span>Livro</span><input required maxLength={160} value={bookForm.title} onChange={(event) => { setBookForm({ ...bookForm, title: event.target.value, isbn: '', coverId: null, coverUrl: null }); setCoverOptions([]); setCoverSources(null); }} placeholder="Título do livro" /></label>
            <label><span>Autor(a)</span><input maxLength={120} value={bookForm.author} onChange={(event) => { setBookForm({ ...bookForm, author: event.target.value, isbn: '', coverId: null, coverUrl: null }); setCoverOptions([]); setCoverSources(null); }} placeholder="Nome do autor" /></label>
            <label className="isbn-field"><span>ISBN da edição selecionada</span><div className="isbn-input-row"><input maxLength={20} value={bookForm.isbn} onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value, coverId: null, coverUrl: null })} placeholder="Escolha uma capa ou informe o ISBN" /><button type="button" className="button button-secondary isbn-lookup-button" onClick={lookupIsbn} disabled={!bookForm.title.trim() || isLookingUpIsbn}>{isLookingUpIsbn ? 'Buscando…' : <><Search size={16} /> Buscar capas</>}</button></div></label>
            <label><span>Total de páginas</span><NumberInput aria-label="total de páginas" required min="1" max="100000" step="1" value={bookForm.totalPages} onValueChange={(value) => setBookForm({ ...bookForm, totalPages: value })} /></label>
            <label><span>Página atual</span><NumberInput aria-label="página atual" required min="0" max={bookForm.totalPages || 100000} step="1" value={bookForm.currentPage} onValueChange={(value) => setBookForm({ ...bookForm, currentPage: value })} /></label>
          </div>
          <p className="muted-state">Busque as edições disponíveis e escolha a capa. O Groq sugere uma correspondência quando possível.</p>
          {coverOptions.length ? (
            <section className="cover-picker" aria-label="Escolha uma capa">
              <h4>Capas encontradas · {coverOptions.length}</h4>
              {coverSources && !coverSources.googleBooks ? (
                <p className="muted-state" role="status">Google Books está indisponível no momento; exibindo resultados do Open Library. Configure uma chave própria em <code>GOOGLE_BOOKS_API_KEY</code> para usar sua quota.</p>
              ) : null}
              <div className="cover-options-grid">
                {coverOptions.map((edition, index) => (
                  <CoverOption
                    key={`${edition.source}-${edition.coverId || edition.coverUrl}-${index}`}
                    book={edition}
                    selected={bookForm.coverUrl === edition.coverUrl}
                    onSelect={() => selectCover(edition)}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <div className="inline-row">
            <button type="button" className="button button-secondary" onClick={() => setShowBookForm(false)}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={Boolean(busyId)}>{busyId ? 'Salvando…' : 'Salvar livro'}</button>
          </div>
        </form>
      ) : null}
      <ApiState loading={isLoading} error={error && !showBookForm && !sessionSetup && !readingSession ? error : ''} empty={books.length === 0 ? 'Nenhum livro nesta lista. Adicione o livro que está lendo.' : null}>
        <div className="reading-book-grid">
          {books.map((book) => {
            const progress = Math.min(100, (book.currentPage / book.totalPages) * 100);
            return (
              <article className="reading-book-card card" key={book.id}>
                <ReadingBookCover key={`${book.id}-${book.coverId || book.isbn || 'none'}`} book={book} />
                <div className="reading-book-content">
                  <div className="reading-book-heading"><div><h3>{book.title}</h3><small>{book.author || 'Autor não informado'}</small></div><span className="status-pill">{book.isActive ? 'Lendo' : 'Arquivado'}</span></div>
                  <p className="reading-pages">{book.currentPage} / {book.totalPages} páginas</p>
                  <div className="progress-bar" role="progressbar" aria-label={`Leitura de ${book.title}`} aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
                  <div className="goal-actions">
                    <button type="button" className="button button-secondary" disabled={!book.isActive || book.currentPage >= book.totalPages || busyId === book.id} onClick={() => { setSessionSetup({ book, mode: 'timed', minutes: '25', sound: 'none' }); setSessionForm({ pagesRead: '' }); setError(''); setFocusNotice(''); }}>Começar leitura</button>
                    <button type="button" className="text-button" disabled={busyId === book.id} aria-label={`Editar ${book.title}`} onClick={() => openBookForm(book)}><Pencil size={16} /></button>
                    <button type="button" className="text-button" disabled={busyId === book.id} aria-label={book.isActive ? `Arquivar ${book.title}` : `Reativar ${book.title}`} onClick={() => toggleArchive(book)}>{book.isActive ? <MoreHorizontal size={16} /> : <Check size={16} />}</button>
                    <button type="button" className="text-button" disabled={busyId === book.id} aria-label={`Excluir ${book.title}`} onClick={() => removeBook(book)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {booksPageError ? <p className="error-text" role="alert">Não foi possível carregar mais livros: {booksPageError}</p> : null}
        {booksPagination && books.length > 0 ? (
          <div className="reading-book-pagination">
            <span className="muted-state">Mostrando {books.length} de {booksPagination.total} livros</span>
            {booksPage < booksPagination.totalPages
              ? <button type="button" className="button button-secondary" onClick={loadMoreBooks} disabled={isLoadingMoreBooks}>
                {isLoadingMoreBooks ? 'Carregando…' : 'Carregar mais livros'}
              </button>
              : <span className="muted-state">Todos os livros carregados</span>}
          </div>
        ) : null}
      </ApiState>
      {today?.items?.length ? (
        <section className="card today-list">
          <div className="section-heading"><h3>Leituras de hoje</h3><span className="metric-label">{today.date}</span></div>
          {today.items.map((log) => (
            <div className="today-habit" key={log.id}>
              <span>{log.book.title}</span>
              <span>{log.pagesRead} pág. · {log.minutesRead} min</span>
            </div>
          ))}
        </section>
      ) : null}
      </section>
    </AppLayout>
  );
}

