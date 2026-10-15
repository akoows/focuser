import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Expand,
  Flame,
  Focus,
  House,
  Headphones,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  Play,
  Search,
  Settings,
  Shrink,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  UserMinus,
  UserPlus,
  Users,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { focuserApi } from './services/focuserApi';
import focuserLogo from './assets/logo-wordmark.png';
import './App.css';

const AuthContext = createContext(null);
const createFocusStatusSessionId = () => window.crypto?.randomUUID?.()
  || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
const ACCENT_COLORS = [
  { value: '#ffffff', label: 'Branco' },
  { value: '#c4b5fd', label: 'Lavanda' },
  { value: '#93c5fd', label: 'Azul' },
  { value: '#6ee7b7', label: 'Menta' },
  { value: '#f9a8d4', label: 'Rosa' },
  { value: '#fcd34d', label: 'Âmbar' },
];

function ProfileImageCropper({ source, type, onCancel, onApply }) {
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const dragRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const isBanner = type === 'banner';

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isApplying) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isApplying, onCancel]);

  const scale = imageSize && frameSize.width && frameSize.height
    ? Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height) * zoom
    : 1;
  const displayedWidth = (imageSize?.width || 0) * scale;
  const displayedHeight = (imageSize?.height || 0) * scale;

  const clampPan = (nextPan, nextZoom = zoom) => {
    if (!imageSize || !frameSize.width || !frameSize.height) return nextPan;
    const nextScale = Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height) * nextZoom;
    return {
      x: Math.max((frameSize.width - imageSize.width * nextScale) / 2, Math.min((imageSize.width * nextScale - frameSize.width) / 2, nextPan.x)),
      y: Math.max((frameSize.height - imageSize.height * nextScale) / 2, Math.min((imageSize.height * nextScale - frameSize.height) / 2, nextPan.y)),
    };
  };

  const changeZoom = (value) => {
    const nextZoom = Number(value);
    setZoom(nextZoom);
    setPan((current) => clampPan(current, nextZoom));
  };

  const startDrag = (event) => {
    if (!imageSize || isApplying) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
  };

  const moveDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const drag = dragRef.current;
    setPan(clampPan({
      x: drag.pan.x + event.clientX - drag.x,
      y: drag.pan.y + event.clientY - drag.y,
    }));
  };

  const finishDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const applyCrop = async () => {
    if (!imageRef.current || !imageSize || !frameSize.width || !frameSize.height) return;
    setIsApplying(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = isBanner ? 1400 : 512;
      canvas.height = isBanner ? 400 : 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar o recorte da imagem.');
      const cropWidth = Math.min(frameSize.width, frameSize.height * (isBanner ? 3.5 : 1));
      const cropHeight = cropWidth / (isBanner ? 3.5 : 1);
      const frameX = (frameSize.width - cropWidth) / 2;
      const frameY = (frameSize.height - cropHeight) / 2;
      const imageX = (frameSize.width - displayedWidth) / 2 + pan.x;
      const imageY = (frameSize.height - displayedHeight) / 2 + pan.y;
      context.drawImage(
        imageRef.current,
        (frameX - imageX) / scale,
        (frameY - imageY) / scale,
        cropWidth / scale,
        cropHeight / scale,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const croppedImage = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Não foi possível gerar o recorte da imagem.'));
        }, 'image/webp', 0.92);
      });
      await onApply(croppedImage);
      onCancel();
    } catch (cropError) {
      setError(cropError.message || 'Não foi possível enviar a imagem.');
    } finally {
      setIsApplying(false);
    }
  };

  const closeOnBackdrop = (event) => {
    if (event.target === event.currentTarget && !isApplying) onCancel();
  };

  return (
    <div className="profile-crop-backdrop" onMouseDown={closeOnBackdrop}>
      <section className="profile-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title">
        <div className="profile-crop-heading">
          <div>
            <h2 id="profile-crop-title">{isBanner ? 'Ajustar banner' : 'Ajustar foto de perfil'}</h2>
            <p className="muted-state">Arraste a imagem para escolher o enquadramento.</p>
          </div>
          <button ref={cancelButtonRef} type="button" className="icon-button" aria-label="Fechar editor de recorte" disabled={isApplying} onClick={onCancel}><X size={19} /></button>
        </div>
        <div
          ref={frameRef}
          className={`profile-crop-frame ${isBanner ? 'banner' : 'avatar'}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {source ? (
            <img
              ref={imageRef}
              src={source}
              alt="Imagem para recortar"
              draggable="false"
              onLoad={(event) => {
                setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                setPan({ x: 0, y: 0 });
              }}
              style={{
                width: displayedWidth,
                height: displayedHeight,
                left: (frameSize.width - displayedWidth) / 2 + pan.x,
                top: (frameSize.height - displayedHeight) / 2 + pan.y,
              }}
            />
          ) : null}
          {!imageSize ? <span className="profile-crop-loading">Carregando imagem…</span> : null}
        </div>
        <label className="profile-crop-zoom">
          <span>Zoom</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => changeZoom(event.target.value)} disabled={!imageSize || isApplying} />
          <span>{zoom.toFixed(1)}×</span>
        </label>
        <p className="muted-state profile-crop-hint">Use o controle de zoom e arraste a imagem para mover o recorte.</p>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <div className="profile-crop-actions">
          <button type="button" className="button button-secondary" disabled={isApplying} onClick={onCancel}>Cancelar</button>
          <button type="button" className="button button-primary" disabled={!imageSize || isApplying} onClick={applyCrop}>{isApplying ? 'Enviando…' : 'Usar recorte'}</button>
        </div>
      </section>
    </div>
  );
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accentColor, setAccentColor] = useState('#ffffff');
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const sessionRequest = useRef(null);

  const ensureSession = useCallback(() => {
    if (user) return Promise.resolve(user);
    if (sessionRequest.current) return sessionRequest.current;
    setIsCheckingSession(true);
    setSessionError('');
    sessionRequest.current = focuserApi.me()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setAccentColor(/^#[\da-f]{6}$/i.test(currentUser.accentColor || '') ? currentUser.accentColor : '#ffffff');
        setHasCheckedSession(true);
        return currentUser;
      })
      .catch((error) => {
        setHasCheckedSession(true);
        if (error.status !== 401) setSessionError(error.message);
        return null;
      })
      .finally(() => setIsCheckingSession(false));
    return sessionRequest.current;
  }, [user]);

  const retrySession = () => {
    sessionRequest.current = null;
    setHasCheckedSession(false);
    setSessionError('');
  };

  const login = async (credentials) => {
    const result = credentials.code
      ? await focuserApi.verifyLogin(credentials)
      : await focuserApi.login(credentials);
    if (result.user) {
      setUser(result.user);
      setAccentColor(/^#[\da-f]{6}$/i.test(result.user.accentColor || '') ? result.user.accentColor : '#ffffff');
      setHasCheckedSession(true);
      setSessionError('');
    }
    return result;
  };

  const logout = async () => {
    await focuserApi.logout();
    setUser(null);
    setAccentColor('#ffffff');
    setHasCheckedSession(true);
  };

  useEffect(() => {
    const activeAccentColor = user ? accentColor : '#ffffff';
    document.documentElement.style.setProperty('--accent', activeAccentColor);
    document.documentElement.style.setProperty('--white', activeAccentColor);
  }, [accentColor, user]);

  const updateAccentColor = async (color) => {
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Use uma cor hexadecimal válida.');
    const { user: updatedUser } = await focuserApi.updateProfile({ accentColor: color });
    setUser(updatedUser);
    setAccentColor(/^#[\da-f]{6}$/i.test(updatedUser.accentColor || '') ? updatedUser.accentColor : '#ffffff');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, accentColor, updateAccentColor, isCheckingSession, hasCheckedSession, sessionError, ensureSession, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return context;
}

function RequireAuth({ children }) {
  const { user, isCheckingSession, hasCheckedSession, sessionError, ensureSession, retrySession } = useAuth();
  useEffect(() => {
    if (!user && !hasCheckedSession && !isCheckingSession) ensureSession();
  }, [user, hasCheckedSession, isCheckingSession, ensureSession]);
  if (isCheckingSession || (!user && !hasCheckedSession && !sessionError)) return <div className="auth-page"><p className="muted-state">Verificando sessão…</p></div>;
  if (sessionError) return <div className="auth-page"><div className="card state-card error-state" role="alert">{sessionError}<button className="button button-secondary" onClick={() => { retrySession(); }}>Tentar novamente</button></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function ApiState({ loading, error, empty, children }) {
  if (error) return <div className="card state-card error-state" role="alert">{error}</div>;
  if (loading) return <div className="card state-card" role="status">Carregando dados…</div>;
  if (empty) return <div className="card state-card">{empty}</div>;
  return children;
}

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatFrequency(habit) {
  if (habit.frequency === 'DAILY') return 'Todos os dias';
  return (habit.daysOfWeek || []).map((day) => WEEKDAY_NAMES[day]).join(', ');
}

const featureCards = [
  { title: 'Hábitos flexíveis', description: 'Crie rotinas diárias ou escolha os dias da semana em que cada hábito acontece.', icon: CheckCheck },
  { title: 'Check-ins', description: 'Registre hábitos concluídos e consulte o que está programado para hoje.', icon: Check },
  { title: 'Progresso real', description: 'Acompanhe taxas de conclusão, histórico e sequências calculadas pela API.', icon: BarChart3 },
  { title: 'Visão diária', description: 'Veja hábitos previstos, pendências e conclusões do dia em um só lugar.', icon: Activity },
  { title: 'Fuso horário', description: 'Os dias e check-ins respeitam o fuso horário configurado no seu perfil.', icon: Target },
  { title: 'Sua conta em qualquer tela', description: 'Entre com sua conta para consultar seus dados sincronizados no backend.', icon: ShieldCheck },
];

function Logo() {
  return (
    <span className="logo-image-wrap">
      <img className="logo-image" src={focuserLogo} alt="Focuser" />
      <span className="logo-star" aria-hidden="true" />
    </span>
  );
}

function PublicNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, hasCheckedSession, isCheckingSession, ensureSession } = useAuth();

  useEffect(() => {
    if (!user && !hasCheckedSession && !isCheckingSession) ensureSession();
  }, [user, hasCheckedSession, isCheckingSession, ensureSession]);

  return (
    <header className="public-header">
      <div className={`container nav-shell ${menuOpen ? 'menu-open' : ''}`}>
        <Link to="/" className="brand-link" onClick={() => setMenuOpen(false)}><Logo /></Link>
        <button
          type="button"
          className="public-menu-toggle"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="public-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav id="public-navigation" className="public-nav" aria-label="Navegação pública">
          <Link to="/recursos">Recursos</Link>
          <Link to="/pessoas">Encontrar perfis</Link>
          {user ? <Link to="/app">Meu espaço</Link> : hasCheckedSession ? <Link to="/login">Login</Link> : null}
        </nav>
        <div className="nav-actions">
          {user
            ? <Link to="/app" className="button button-primary">Meu espaço</Link>
            : hasCheckedSession
              ? <><Link to="/login" className="button button-secondary">Entrar</Link><Link to="/cadastro" className="button button-primary">Começar</Link></>
              : <span className="public-session-status" role="status">Verificando sessão…</span>}
        </div>
      </div>
    </header>
  );
}

function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const items = [
    { label: 'Hoje', icon: LayoutDashboard, to: '/app' },
    { label: 'Hábitos', icon: CheckCheck, to: '/app/habitos' },
    { label: 'Metas', icon: Target, to: '/app/metas' },
    { label: 'Leituras', icon: BookOpen, to: '/app/leituras' },
    { label: 'Amigos', icon: Users, to: '/app/amigos' },
    { label: 'Análises', icon: BarChart3, to: '/app/analises' },
    { label: 'Configurações', icon: Settings, to: '/app/configuracoes' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo />
        <nav className="sidebar-nav" aria-label="Navegação da aplicação">
          {items.map(({ label, icon: Icon, to }) => (
            <NavLink key={label} to={to} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <Link className="user-badge" to={user?.username ? `/u/${encodeURIComponent(user.username)}` : '/app/perfil'} aria-label={`Abrir perfil de ${user?.name || user?.email || 'usuário'}`}>
          <div className="avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <User size={16} />}</div>
          <div>
            <strong>{user?.name || user?.email}</strong>
            <small>{user?.username ? `@${user.username}` : user?.email}</small>
          </div>
        </Link>
        {logoutError ? <small className="error-text" role="alert">{logoutError}</small> : null}
        <button type="button" className="logout-button" onClick={async () => {
          setLogoutError('');
          try {
            await logout();
            navigate('/login');
          } catch (error) {
            setLogoutError(error.message);
          }
        }}><LogOut size={16} /> Sair</button>
      </div>
    </aside>
  );
}

function AppLayout({ children }) {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="app-main">
        <div className="mobile-topbar">
          <Logo />
        </div>
        {children}
        <nav className="mobile-nav" aria-label="Navegação móvel">
          <NavLink end to="/app" aria-label="Hoje" title="Hoje" className="mobile-nav-item"><House size={19} strokeWidth={1.8} /><span>Hoje</span></NavLink>
          <NavLink to="/app/habitos" aria-label="Hábitos" title="Hábitos" className="mobile-nav-item"><CheckCheck size={19} strokeWidth={1.8} /><span>Hábitos</span></NavLink>
          <NavLink to="/app/metas" aria-label="Metas" title="Metas" className="mobile-nav-item"><Target size={19} strokeWidth={1.8} /><span>Metas</span></NavLink>
          <NavLink to="/app/leituras" aria-label="Leituras" title="Leituras" className="mobile-nav-item"><BookOpen size={19} strokeWidth={1.8} /><span>Leituras</span></NavLink>
          <NavLink to="/app/amigos" aria-label="Amigos" title="Amigos" className="mobile-nav-item"><Users size={19} strokeWidth={1.8} /><span>Amigos</span></NavLink>
          <NavLink to="/app/analises" aria-label="Análises" title="Análises" className="mobile-nav-item"><BarChart3 size={19} strokeWidth={1.8} /><span>Análises</span></NavLink>
          <NavLink to={user?.username ? `/u/${encodeURIComponent(user.username)}` : '/app/perfil'} aria-label="Perfil" title="Perfil" className="mobile-nav-item"><User size={19} strokeWidth={1.8} /><span>Perfil</span></NavLink>
          <NavLink to="/app/configuracoes" aria-label="Configurações" title="Configurações" className="mobile-nav-item"><Settings size={19} strokeWidth={1.8} /><span>Ajustes</span></NavLink>
        </nav>
      </main>
    </div>
  );
}

function PageHeader({ title, subtitle, action, eyebrow = 'Hoje' }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="header-action">{action}</div> : null}
    </header>
  );
}

function MetricCard({ label, value, hint, icon: Icon }) {
  return (
    <article className="metric-card card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        {Icon ? <Icon size={16} /> : null}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function FocusTimer() {
  const [session, setSession] = useState(null);
  const [goals, setGoals] = useState([]);
  const [goalId, setGoalId] = useState('');
  const [title, setTitle] = useState('');
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [clock, setClock] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const finishing = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([focuserApi.focusSessions.active(), focuserApi.goals.list({ status: 'active', limit: '100' })])
      .then(([activeResponse, goalResponse]) => {
        if (!active) return;
        const now = Date.now();
        setSession(activeResponse.session);
        setGoals(goalResponse.items);
        setAnchor(now);
        setClock(now);
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session?.status !== 'RUNNING') return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  const elapsedSeconds = session
    ? session.elapsedSeconds + (session.status === 'RUNNING' ? Math.max(0, Math.floor((clock - anchor) / 1000)) : 0)
    : 0;
  const secondsLeft = session ? Math.max(0, session.plannedMinutes * 60 - elapsedSeconds) : plannedMinutes * 60;
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  const applySession = (nextSession) => {
    const now = Date.now();
    setSession(nextSession);
    setAnchor(now);
    setClock(now);
  };

  const performAction = async (action) => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      if (action === 'start') {
        const response = await focuserApi.focusSessions.create({
          title: title.trim() || 'Sessão de foco',
          plannedMinutes: Number(plannedMinutes),
          ...(goalId ? { goalId } : {}),
        });
        applySession(response.session);
      } else if (action === 'pause' || action === 'resume') {
        const response = await focuserApi.focusSessions[action](session.id);
        applySession(response.session);
      } else {
        const response = await focuserApi.focusSessions[action](session.id);
        setSession(null);
        setNotice(action === 'complete' ? `Sessão concluída · ${Math.floor(response.session.elapsedSeconds / 60)} min registrados.` : 'Sessão cancelada.');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (session?.status !== 'RUNNING' || secondsLeft > 0 || finishing.current) return;
    finishing.current = true;
    setIsBusy(true);
    setError('');
    focuserApi.focusSessions.complete(session.id)
      .then(({ session: completed }) => {
        setSession(null);
        setNotice(`Sessão concluída · ${Math.floor(completed.elapsedSeconds / 60)} min registrados.`);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => { finishing.current = false; setIsBusy(false); });
  }, [secondsLeft, session]);

  return (
    <article className="focus-card card">
      <div className="focus-card-header">
        <div>
          <p className="eyebrow">Foco agora</p>
          <h3>Timer de concentração</h3>
        </div>
        <span className="status-pill">{isLoading ? 'Carregando' : session?.status === 'RUNNING' ? 'Em andamento' : session?.status === 'PAUSED' ? 'Pausado' : 'Pronto'}</span>
      </div>
      <div className="focus-time">{minutes}:{seconds}</div>
      {session ? <p className="focus-note">{session.title}{session.goalId ? ` · ${goals.find((goal) => goal.id === session.goalId)?.name || 'Meta associada'}` : ''}</p> : (
        <div className="focus-settings">
          <label><span>Tarefa</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="O que você vai fazer?" /></label>
          <div className="focus-settings-row">
            <label><span>Duração (min)</span><input type="number" min="1" max="240" value={plannedMinutes} onChange={(event) => setPlannedMinutes(event.target.value)} /></label>
            <label><span>Meta (opcional)</span><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">Sem meta</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label>
          </div>
        </div>
      )}
      <div className="focus-buttons">
        {!session ? <button type="button" className="button button-primary" disabled={isLoading || isBusy} onClick={() => performAction('start')}>Iniciar sessão</button> : null}
        {session?.status === 'RUNNING' ? <button type="button" className="button button-secondary" disabled={isBusy} onClick={() => performAction('pause')}>Pausar</button> : null}
        {session?.status === 'PAUSED' ? <button type="button" className="button button-primary" disabled={isBusy} onClick={() => performAction('resume')}>Retomar</button> : null}
        {session ? <button type="button" className="button button-secondary" disabled={isBusy} onClick={() => performAction('complete')}>Concluir</button> : null}
        {session ? <button type="button" className="button button-ghost" disabled={isBusy} onClick={() => performAction('cancel')}>Cancelar</button> : null}
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {notice ? <p className="success-text" role="status">{notice}</p> : null}
      <p className="focus-note">Seu tempo e o estado da sessão ficam salvos na sua conta.</p>
    </article>
  );
}

function HabitCard({ habit, completedToday, scheduledToday, isBusy, onCheckIn, onEdit, onArchive, onDelete }) {
  const Icon = habit.name.toLowerCase().includes('leitur') ? BookOpen
    : habit.name.toLowerCase().includes('exerc') ? Flame
      : Focus;
  return (
    <article className="habit-card card">
      <div className="habit-main">
        <div className="habit-icon"><Icon size={18} /></div>
        <div>
          <h3>{habit.name}</h3>
          <small>{formatFrequency(habit)} · {habit.isActive ? 'Ativo' : 'Arquivado'}</small>
          {habit.category ? <span className="habit-category"><Focus size={12} strokeWidth={2} />{habit.category}</span> : null}
        </div>
      </div>
      <div className="habit-actions">
        <button type="button" className="button button-secondary" disabled={isBusy || !habit.isActive || completedToday || !scheduledToday} onClick={() => onCheckIn(habit.id)}>
          {completedToday ? 'Concluído hoje' : scheduledToday ? 'Marcar como feito' : 'Não programado hoje'}
        </button>
        <button type="button" className="text-button" disabled={isBusy} aria-label={`Editar ${habit.name}`} onClick={() => onEdit(habit)}><Pencil size={16} /></button>
        <button type="button" className="text-button" disabled={isBusy} aria-label={habit.isActive ? `Arquivar ${habit.name}` : `Reativar ${habit.name}`} onClick={() => onArchive(habit)}>
          {habit.isActive ? <MoreHorizontal size={16} /> : <Check size={16} />}
        </button>
        <button type="button" className="text-button" disabled={isBusy} aria-label={`Excluir ${habit.name}`} onClick={() => onDelete(habit)}><Trash2 size={16} /></button>
      </div>
    </article>
  );
}

function ChartCard({ series, period }) {
  const max = Math.max(1, ...series.map((item) => item.completed));
  return (
    <article className="chart-card card">
      <div className="section-heading">
        <h3>Hábitos concluídos por dia</h3>
        <span className="metric-label">{period === 'week' ? 'Últimos 7 dias' : 'Últimos 30 dias'}</span>
      </div>
      {series.length ? (
        <div className="chart-bars" aria-label="Gráfico de hábitos concluídos por dia">
          {series.map((item) => (
            <div key={item.date} className="chart-column" title={`${item.date}: ${item.completed}/${item.scheduled}`}>
              <div className="chart-bar-wrap"><span className="chart-bar" style={{ height: `${(item.completed / max) * 100}%` }} /></div>
              <small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-state">Ainda não há registros neste período para montar o gráfico.</p>
      )}
    </article>
  );
}

function LandingPage() {
  return (
    <div className="public-page">
      <PublicNavbar />
      <main className="container landing-main">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow dark">menos distração. mais foco.</span>
            <h1>Organize seu tempo, hábitos e objetivos com clareza.</h1>
            <p>O Focuser ajuda você a organizar hábitos, registrar check-ins e acompanhar seu progresso com clareza.</p>
            <p className="free-note">Todos os recursos são gratuitos, sem planos ou cobranças.</p>
            <div className="hero-actions">
              <Link to="/download" className="button button-primary">Baixar agora</Link>
              <Link to="/recursos" className="button button-ghost">Saiba mais</Link>
            </div>
          </div>
          <div className="hero-visual" aria-label="Mockup do produto Focuser">
            <div className="device laptop">
              <div className="device-bar" />
              <div className="device-content">
                <div className="mini-metric">4h 30m</div>
                <div className="mini-bars">
                  <span style={{ height: '40%' }} />
                  <span style={{ height: '58%' }} />
                  <span style={{ height: '75%' }} />
                  <span style={{ height: '90%' }} />
                  <span style={{ height: '62%' }} />
                </div>
              </div>
            </div>
            <div className="device phone">
              <div className="device-header" />
              <div className="phone-card">
                <strong>25:00</strong>
                <span>foco agora</span>
              </div>
              <div className="phone-list">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>

        <section className="benefits-section">
          <div className="section-heading centered">
            <p className="eyebrow dark">por que focuser</p>
            <h2>Seu progresso, em um só lugar.</h2>
          </div>
          <div className="feature-grid">
            {featureCards.map(({ title, description, icon: Icon }) => (
              <article key={title} className="feature-card card">
                <div className="feature-icon"><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ResourcesPage() {
  return (
    <div className="public-page">
      <PublicNavbar />
      <main className="container narrow-page">
        <header className="page-intro">
          <p className="eyebrow dark">recursos</p>
          <h1>recursos para manter você no foco.</h1>
        </header>
        <div className="feature-grid six-grid">
          {featureCards.map(({ title, description, icon: Icon }) => (
            <article key={title} className="feature-card card resource-card">
              <div className="feature-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function LoginPage() {
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [code, setCode] = useState('');
  const [step, setStep] = useState('credentials');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [statusMessage, setStatusMessage] = useState(location.state?.message || '');
  const { login } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const nextErrors = {};
    if (!form.email.includes('@')) nextErrors.email = 'Informe um e-mail válido.';
    if (form.password.length < 8) nextErrors.password = 'A senha deve ter pelo menos 8 caracteres.';
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (step === 'credentials') {
      const nextErrors = validate();
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
    } else if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Informe o código de 6 dígitos enviado por e-mail.' });
      return;
    } else {
      setErrors({});
    }
    setSubmitError('');
    setStatusMessage('');
    setIsSubmitting(true);
    try {
      if (step === 'email-verification') {
        await focuserApi.verifyEmail({ email: form.email, code });
        setStep('credentials');
        setCode('');
        setStatusMessage('E-mail verificado. Entre novamente para receber seu código de acesso.');
      } else {
        const result = await login(step === 'two-factor' ? { email: form.email, code } : { email: form.email, password: form.password });
        if (result.user) navigate('/app');
        else {
          setStep(result.emailVerificationRequired ? 'email-verification' : 'two-factor');
          setCode('');
          setStatusMessage(result.emailVerificationRequired
            ? 'Enviamos um código para verificar seu e-mail.'
            : 'Enviamos um código de acesso para seu e-mail.');
        }
      }
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Logo />
        <div className="auth-header">
          <h1>{step === 'credentials' ? 'bem-vindo de volta' : step === 'two-factor' ? 'confirme seu acesso' : 'verifique seu e-mail'}</h1>
          <p>{step === 'credentials' ? 'faça login para continuar' : `informe o código enviado para ${form.email}`}</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {step === 'credentials' ? <>
            <label>
              <span>E-mail</span>
              <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" aria-invalid={Boolean(errors.email)} />
              {errors.email ? <small className="error-text">{errors.email}</small> : null}
            </label>
            <label>
              <span>Senha</span>
              <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" aria-invalid={Boolean(errors.password)} />
              {errors.password ? <small className="error-text">{errors.password}</small> : null}
            </label>
          </> : <label>
            <span>Código de 6 dígitos</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-invalid={Boolean(errors.code)} />
            {errors.code ? <small className="error-text">{errors.code}</small> : null}
          </label>}
          {statusMessage ? <p role="status">{statusMessage}</p> : null}
          {submitError ? <p className="error-text" role="alert">{submitError}</p> : null}
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Aguarde...' : step === 'credentials' ? 'Entrar' : step === 'two-factor' ? 'Confirmar acesso' : 'Verificar e-mail'}
          </button>
          {step === 'email-verification' ? <button type="button" className="button button-secondary" disabled={isSubmitting} onClick={async () => {
            setSubmitError('');
            setIsSubmitting(true);
            try { await focuserApi.resendEmailVerification({ email: form.email }); setStatusMessage('Se a conta precisar de verificação, um novo código foi enviado.'); }
            catch (error) { setSubmitError(error.message); }
            finally { setIsSubmitting(false); }
          }}>Reenviar código</button> : null}
          {step !== 'credentials' ? <button type="button" className="button button-secondary" disabled={isSubmitting} onClick={() => { setStep('credentials'); setCode(''); setSubmitError(''); setStatusMessage(''); }}>Voltar</button> : null}
        </form>
        <p className="switch-link">Ainda não tem conta? <Link to="/cadastro">crie agora</Link></p>
      </div>
    </div>
  );
}

async function uploadCloudinaryImage(signature, image, filename) {
  const formData = new FormData();
  formData.append('file', image, filename);
  formData.append('api_key', signature.apiKey);
  formData.append('timestamp', String(signature.timestamp));
  formData.append('folder', signature.folder);
  formData.append('signature', signature.signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || typeof result.secure_url !== 'string') {
    throw new Error(result.error?.message || 'Não foi possível enviar a imagem ao Cloudinary.');
  }
  return result.secure_url;
}

function SignupPage() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' });
  const [avatarImage, setAvatarImage] = useState(null);
  const [bannerImage, setBannerImage] = useState(null);
  const [cropRequest, setCropRequest] = useState(null);
  const [code, setCode] = useState('');
  const [verificationPending, setVerificationPending] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => () => {
    if (cropRequest?.source) URL.revokeObjectURL(cropRequest.source);
  }, [cropRequest]);
  useEffect(() => () => {
    if (avatarImage?.preview) URL.revokeObjectURL(avatarImage.preview);
  }, [avatarImage]);
  useEffect(() => () => {
    if (bannerImage?.preview) URL.revokeObjectURL(bannerImage.preview);
  }, [bannerImage]);

  const validate = () => {
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Informe seu nome completo.';
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(form.username.trim())) nextErrors.username = 'Use de 3 a 30 letras, números, pontos ou sublinhados.';
    if (!form.email.includes('@')) nextErrors.email = 'Informe um e-mail válido.';
    if (form.password.length < 8) nextErrors.password = 'A senha precisa ter pelo menos 8 caracteres.';
    if (form.confirmPassword !== form.password) nextErrors.confirmPassword = 'As senhas não coincidem.';
    if (!avatarImage?.blob) nextErrors.avatar = 'Escolha e ajuste uma foto de perfil para continuar.';
    return nextErrors;
  };

  const selectSignupImage = (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSubmitError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((current) => ({ ...current, [type]: 'Escolha uma imagem JPG, PNG ou WebP.' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, [type]: 'A imagem original deve ter no máximo 5 MB.' }));
      return;
    }
    setErrors((current) => ({ ...current, [type]: '' }));
    setCropRequest({ source: URL.createObjectURL(file), type });
  };

  const saveSignupCrop = (blob) => {
    const selection = { blob, preview: URL.createObjectURL(blob) };
    if (cropRequest.type === 'banner') setBannerImage(selection);
    else setAvatarImage(selection);
    setCropRequest(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!verificationPending) {
      const nextErrors = validate();
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
    } else if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Informe o código de 6 dígitos enviado por e-mail.' });
      return;
    } else {
      setErrors({});
    }
    setSubmitError('');
    setStatusMessage('');
    setIsSubmitting(true);
    try {
      if (verificationPending) {
        await focuserApi.verifyEmail({ email: form.email, code });
        navigate('/login', { state: { message: 'E-mail verificado. Agora entre para concluir a autenticação em duas etapas.' } });
      } else {
        const avatarSignature = await focuserApi.registrationImageSignature('avatar');
        const avatarUrl = await uploadCloudinaryImage(avatarSignature, avatarImage.blob, 'profile-avatar.webp');
        let bannerUpload;
        if (bannerImage?.blob) {
          const bannerSignature = await focuserApi.registrationImageSignature('banner');
          bannerUpload = {
            uploadId: bannerSignature.uploadId,
            url: await uploadCloudinaryImage(bannerSignature, bannerImage.blob, 'profile-banner.webp'),
          };
        }
        const result = await focuserApi.register({
          name: form.name.trim(),
          username: form.username.trim().toLowerCase(),
          email: form.email,
          password: form.password,
          avatarUploadId: avatarSignature.uploadId,
          avatarUrl,
          ...(bannerUpload ? { bannerUploadId: bannerUpload.uploadId, bannerUrl: bannerUpload.url } : {}),
        });
        if (result.emailVerificationRequired === false) {
          navigate('/login', { state: { message: 'Conta criada. Entre para continuar.' } });
        } else {
          setVerificationPending(true);
          setStatusMessage('Enviamos um código para seu e-mail. O código expira em 10 minutos.');
        }
      }
    } catch (error) {
      setSubmitError(error.message);
      if (error.code === 'EMAIL_DELIVERY_FAILED') setVerificationPending(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Logo />
        <div className="auth-header">
          <h1>{verificationPending ? 'verifique seu e-mail' : 'crie sua conta'}</h1>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {verificationPending ? <>
            <p>Enviamos um código de verificação para <strong>{form.email}</strong>.</p>
            <label>
              <span>Código de 6 dígitos</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-invalid={Boolean(errors.code)} />
              {errors.code ? <small className="error-text">{errors.code}</small> : null}
            </label>
          </> : <>
            <label>
              <span>Nome</span>
              <input type="text" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" aria-invalid={Boolean(errors.name)} />
              {errors.name ? <small className="error-text">{errors.name}</small> : null}
            </label>
            <label>
              <span>Nome de usuário</span>
              <div className="signup-username-input"><span aria-hidden="true">@</span><input type="text" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/^@/, '').toLowerCase() })} minLength="3" maxLength="30" pattern="[a-zA-Z0-9._]{3,30}" placeholder="seu.usuario" aria-invalid={Boolean(errors.username)} required /></div>
              {errors.username ? <small className="error-text">{errors.username}</small> : <small>Seu nome público, único e usado para encontrar seu perfil.</small>}
            </label>
            <label>
              <span>E-mail</span>
              <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" aria-invalid={Boolean(errors.email)} />
              {errors.email ? <small className="error-text">{errors.email}</small> : null}
            </label>
            <label>
              <span>Senha</span>
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" aria-invalid={Boolean(errors.password)} />
              {errors.password ? <small className="error-text">{errors.password}</small> : <small>Mínimo de 8 caracteres; até 72 bytes.</small>}
            </label>
            <label>
              <span>Confirmação de senha</span>
              <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Repita a senha" aria-invalid={Boolean(errors.confirmPassword)} />
              {errors.confirmPassword ? <small className="error-text">{errors.confirmPassword}</small> : null}
            </label>
            <div className="signup-image-pickers">
              <div className="signup-image-picker">
                <div className="signup-avatar-preview">{avatarImage?.preview ? <img src={avatarImage.preview} alt="Prévia da foto de perfil" /> : <User size={26} />}</div>
                <div>
                  <strong>Foto de perfil <span aria-hidden="true">*</span></strong>
                  <small>Obrigatória · JPG, PNG ou WebP · máx. 5 MB</small>
                  <label className="button button-secondary signup-image-button">
                    {avatarImage?.preview ? 'Trocar foto' : 'Escolher foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectSignupImage(event, 'avatar')} disabled={isSubmitting} />
                  </label>
                </div>
              </div>
              {errors.avatar ? <small className="error-text" role="alert">{errors.avatar}</small> : null}
              <div className="signup-image-picker banner">
                <div className="signup-banner-preview">{bannerImage?.preview ? <img src={bannerImage.preview} alt="Prévia do banner" /> : <span>Banner opcional</span>}</div>
                <div>
                  <strong>Banner <small>(opcional)</small></strong>
                  <small>JPG, PNG ou WebP · máx. 5 MB</small>
                  <label className="button button-secondary signup-image-button">
                    {bannerImage?.preview ? 'Trocar banner' : 'Escolher banner'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectSignupImage(event, 'banner')} disabled={isSubmitting} />
                  </label>
                </div>
                {errors.banner ? <small className="error-text">{errors.banner}</small> : null}
              </div>
            </div>
          </>}
          {statusMessage ? <p role="status">{statusMessage}</p> : null}
          {submitError ? <p className="error-text" role="alert">{submitError}</p> : null}
          <button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Aguarde…' : verificationPending ? 'Verificar e-mail' : 'Criar conta'}</button>
          {verificationPending ? <button type="button" className="button button-secondary" disabled={isSubmitting} onClick={async () => {
            setSubmitError('');
            setIsSubmitting(true);
            try { await focuserApi.resendEmailVerification({ email: form.email }); setStatusMessage('Se a conta precisar de verificação, um novo código foi enviado.'); }
            catch (error) { setSubmitError(error.message); }
            finally { setIsSubmitting(false); }
          }}>Reenviar código</button> : null}
        </form>
        <p className="switch-link">Já tem conta? <Link to="/login">faça login</Link></p>
      </div>
      {cropRequest ? (
        <ProfileImageCropper
          source={cropRequest.source}
          type={cropRequest.type}
          onCancel={() => setCropRequest(null)}
          onApply={saveSignupCrop}
        />
      ) : null}
    </div>
  );
}

function PublicProfileFinderPage() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  const findProfile = (event) => {
    event.preventDefault();
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    if (/^[a-z0-9._]{3,30}$/.test(normalized)) navigate(`/u/${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="public-page">
      <PublicNavbar />
      <main className="container public-finder-main">
        <section className="card public-finder-card">
          <p className="eyebrow">comunidade</p>
          <h1>Encontre um perfil</h1>
          <p className="muted-state">Busque pelo nome de usuário para ver o perfil público de alguém.</p>
          <form className="public-profile-search" onSubmit={findProfile}>
            <label htmlFor="public-profile-username">Nome de usuário</label>
            <div className="profile-username-input">
              <span aria-hidden="true">@</span>
              <input
                id="public-profile-username"
                autoComplete="off"
                maxLength={31}
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
                placeholder="nome.de.usuario"
              />
            </div>
            <button type="submit" className="button button-primary" disabled={!/^[a-zA-Z0-9._]{3,30}$/.test(username.trim().replace(/^@/, ''))}>Encontrar perfil</button>
          </form>
        </section>
      </main>
    </div>
  );
}

function PublicBookCard({ title, book }) {
  const [hasCover, setHasCover] = useState(Boolean(book.coverUrl || book.coverId));
  const coverSource = book.coverUrl || (book.coverId ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg` : null);
  const readingProgress = Number.isInteger(book.currentPage) && Number.isInteger(book.totalPages) && book.totalPages > 0
    ? Math.min(100, Math.max(0, Math.round((book.currentPage / book.totalPages) * 100)))
    : null;
  return (
    <article className="card public-book-card">
      <div className="public-book-cover">
        {coverSource && hasCover
          ? <img src={coverSource} alt={`Capa de ${book.title}`} loading="lazy" onError={() => setHasCover(false)} />
          : <BookOpen size={26} aria-hidden="true" />}
      </div>
      <div className="public-book-info">
        <span className="public-book-label">{title}</span>
        <h2>{book.title}</h2>
        <p>{book.author || 'Autor não informado'}</p>
        {readingProgress !== null ? (
          <div className="public-book-progress">
            <div className="public-book-progress-label"><small>{book.currentPage} de {book.totalPages} páginas</small><small>{readingProgress}%</small></div>
            <div className="public-book-progress-track" role="progressbar" aria-label={`Progresso de leitura de ${book.title}`} aria-valuenow={readingProgress} aria-valuemin="0" aria-valuemax="100">
              <span style={{ width: `${readingProgress}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatReadingDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${minutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

function PublicProfilePage() {
  const { username } = useParams();
  const normalized = (username || '').toLowerCase();
  const { user, isCheckingSession, hasCheckedSession } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [relationship, setRelationship] = useState(null);
  const [friendActionError, setFriendActionError] = useState('');
  const [isFriendActionBusy, setIsFriendActionBusy] = useState(false);
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const [profileRefreshError, setProfileRefreshError] = useState('');

  useEffect(() => {
    let active = true;
    let hasLoadedProfile = false;
    const loadProfile = async () => {
      try {
        const { profile } = await focuserApi.publicProfile(normalized);
        if (!active) return;
        hasLoadedProfile = true;
        setResult({ username: normalized, profile });
        setProfileRefreshError('');
      } catch (error) {
        if (!active) return;
        if (hasLoadedProfile) setProfileRefreshError(error.message);
        else setResult({ username: normalized, error });
      }
    };
    loadProfile();
    const refreshInterval = window.setInterval(loadProfile, 15000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [normalized]);

  const currentResult = result?.username === normalized ? result : null;
  const profile = currentResult?.profile;
  const viewerUsername = user?.username;
  const refreshPublicProfile = useCallback(async (nextUsername) => {
    const targetUsername = nextUsername || profile?.username;
    if (!targetUsername) return;
    try {
      const { profile: updatedProfile } = await focuserApi.publicProfile(targetUsername);
      setResult({ username: targetUsername, profile: updatedProfile });
      if (targetUsername !== normalized) navigate(`/u/${encodeURIComponent(targetUsername)}`, { replace: true });
    } catch (error) {
      setResult({ username: targetUsername, error });
    }
  }, [navigate, normalized, profile?.username]);

  useEffect(() => {
    if (!isCustomizationOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsCustomizationOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCustomizationOpen]);

  useEffect(() => {
    let active = true;
    const profileUsername = profile?.username;
    if (!profileUsername || !viewerUsername || profileUsername === viewerUsername) return () => { active = false; };
    focuserApi.friends.status(profileUsername)
      .then(({ relationship: currentRelationship }) => { if (active) setRelationship({ username: profileUsername, ...currentRelationship }); })
      .catch((error) => { if (active) setFriendActionError(error.message); });
    return () => { active = false; };
  }, [profile?.username, viewerUsername]);
  const currentRelationship = relationship?.username === profile?.username ? relationship : null;

  const performFriendAction = async (action) => {
    if (!profile || isFriendActionBusy) return;
    setIsFriendActionBusy(true);
    setFriendActionError('');
    try {
      if (action === 'send') await focuserApi.friends.sendRequest(profile.username);
      else if (action === 'accept') await focuserApi.friends.acceptRequest(currentRelationship.requestId);
      else if (action === 'remove') {
        if (currentRelationship.status === 'SENT' || currentRelationship.status === 'RECEIVED') {
          await focuserApi.friends.removeRequest(currentRelationship.requestId);
        } else {
          await focuserApi.friends.removeFriend(profile.id);
        }
      }
      const { relationship: nextRelationship } = await focuserApi.friends.status(profile.username);
      setRelationship({ username: profile.username, ...nextRelationship });
    } catch (error) {
      setFriendActionError(error.message);
    } finally {
      setIsFriendActionBusy(false);
    }
  };
  const profileAccentColor = /^#[\da-f]{6}$/i.test(profile?.accentColor || '') ? profile.accentColor : '#ffffff';

  return (
    <div className="public-page" style={{ '--accent': profileAccentColor, '--white': profileAccentColor }}>
      <PublicNavbar />
      <main className="container public-profile-main">
        {!currentResult ? <div className="card state-card" role="status">Carregando perfil…</div> : null}
        {currentResult?.error ? (
          <section className="card state-card error-state" role="alert">
            <p>{currentResult.error.status === 404 ? 'Esse perfil não foi encontrado.' : currentResult.error.message}</p>
            <Link className="button button-secondary" to="/pessoas">Buscar outro perfil</Link>
          </section>
        ) : null}
        {profile ? <>
          <div className="public-profile-layout">
            <section className="public-profile-card card">
              <div className={`public-profile-banner${profile.bannerUrl ? ' has-image' : ''}`}>
                {profile.bannerUrl ? <img src={profile.bannerUrl} alt="" /> : <span className="public-profile-banner-glow" aria-hidden="true" />}
                <span className="public-profile-banner-label">FOCUSER <span aria-hidden="true">/</span> COMUNIDADE</span>
              </div>
              <div className="public-profile-identity">
                <div className="public-profile-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={`Foto de ${profile.name}`} /> : <User size={30} />}</div>
                <div className="public-profile-name">
                  <h1>{profile.name}</h1>
                  <p><span aria-hidden="true">@</span>{profile.username}</p>
                </div>
                <span className="public-profile-badge"><span aria-hidden="true" />Perfil público</span>
                {profile.username === user?.username ? (
                  <button
                    type="button"
                    className="public-profile-edit-button"
                    aria-label="Editar personalização do perfil"
                    title="Editar perfil"
                    onClick={() => setIsCustomizationOpen(true)}
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="public-profile-friend-action">
                    {user ? currentRelationship?.status === 'FRIENDS' ? (
                      <button type="button" className="button button-secondary" disabled={isFriendActionBusy} onClick={() => performFriendAction('remove')}>
                        <UserMinus size={16} /> {isFriendActionBusy ? 'Aguarde…' : 'Remover amigo'}
                      </button>
                    ) : currentRelationship?.status === 'SENT' ? (
                      <button type="button" className="button button-secondary" disabled={isFriendActionBusy} onClick={() => performFriendAction('remove')}>
                        {isFriendActionBusy ? 'Aguarde…' : 'Cancelar pedido'}
                      </button>
                    ) : currentRelationship?.status === 'RECEIVED' ? (
                      <>
                        <button type="button" className="button button-primary" disabled={isFriendActionBusy} onClick={() => performFriendAction('accept')}>
                          <Check size={16} /> Aceitar pedido
                        </button>
                        <button type="button" className="button button-secondary" disabled={isFriendActionBusy} onClick={() => performFriendAction('remove')}>Recusar</button>
                      </>
                    ) : currentRelationship?.status === 'NONE' ? (
                      <button type="button" className="button button-primary" disabled={isFriendActionBusy} onClick={() => performFriendAction('send')}>
                        <UserPlus size={16} /> Adicionar amigo
                      </button>
                    ) : <span className="public-profile-action-status" role="status">{friendActionError ? 'Não foi possível verificar' : isCheckingSession || !currentRelationship ? 'Carregando…' : ''}</span> : hasCheckedSession ? (
                      <Link className="button button-primary" to="/login"><UserPlus size={16} /> Adicionar amigo</Link>
                    ) : null}
                    {friendActionError ? <small className="error-text" role="alert">{friendActionError}</small> : null}
                  </div>
                )}
              </div>
              {profile.status === 'FOCUS' ? (
                <section className="public-profile-focus-status" aria-label="Status atual">
                  <span className="public-profile-focus-indicator"><span aria-hidden="true" />Em foco</span>
                  <div className="public-profile-focus-book">
                    <BookOpen size={18} aria-hidden="true" />
                    <div>
                      <small>Lendo agora</small>
                      <strong>{profile.currentBook?.title || 'Livro não informado'}</strong>
                      {profile.currentBook?.author ? <span>{profile.currentBook.author}</span> : null}
                    </div>
                  </div>
                </section>
              ) : null}
              {profileRefreshError ? <p className="public-profile-refresh-error" role="status">Não foi possível atualizar o status em tempo real: {profileRefreshError}</p> : null}
              <section className="public-profile-about" aria-labelledby="public-profile-about-title">
                <h2 id="public-profile-about-title">Sobre</h2>
                {profile.bio
                  ? <p className="public-profile-bio">{profile.bio}</p>
                  : <p className="muted-state public-profile-bio">Este perfil ainda não tem uma bio.</p>}
              </section>
            </section>
            <section className="public-profile-reading" aria-labelledby="public-profile-reading-title">
              <div className="public-profile-section-heading">
                <div>
                  <p className="eyebrow">leituras</p>
                  <h2 id="public-profile-reading-title">Livros compartilhados</h2>
                </div>
                <BookOpen size={22} aria-hidden="true" />
              </div>
              {profile.currentBook || profile.favoriteBook ? (
                <div className="public-profile-books">
                  {profile.currentBook ? <PublicBookCard title="Em leitura" book={profile.currentBook} /> : null}
                  {profile.favoriteBook ? <PublicBookCard title="Livro favorito" book={profile.favoriteBook} /> : null}
                </div>
              ) : (
                <p className="card public-profile-empty muted-state">Este perfil ainda não compartilhou livros.</p>
              )}
            </section>
            <section className="public-profile-history" aria-labelledby="public-profile-history-title">
              <div className="public-profile-section-heading">
                <div>
                  <p className="eyebrow">atividade</p>
                  <h2 id="public-profile-history-title">Histórico de leitura</h2>
                </div>
                <Clock3 size={22} aria-hidden="true" />
              </div>
              {profile.readingHistory?.length ? (
                <ol className="public-reading-history">
                  {profile.readingHistory.map((entry) => (
                    <li className="public-reading-history-entry" key={entry.id}>
                      <span className="public-reading-history-icon"><BookOpen size={17} aria-hidden="true" /></span>
                      <div className="public-reading-history-book">
                        <strong>{entry.book.title}</strong>
                        {entry.book.author ? <span>{entry.book.author}</span> : null}
                        <small>{new Date(entry.loggedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })} · {entry.pagesRead} pág.</small>
                      </div>
                      <span className="public-reading-history-duration"><Clock3 size={14} aria-hidden="true" />{formatReadingDuration(entry.minutesRead)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="card public-profile-empty muted-state">Ainda não há leituras registradas.</p>
              )}
            </section>
          </div>
        </> : null}
      </main>
      {isCustomizationOpen && profile?.username === user?.username ? (
        <div className="profile-customization-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsCustomizationOpen(false);
        }}>
          <section className="profile-customization-panel" role="dialog" aria-modal="true" aria-labelledby="profile-customization-title">
            <ProfilePage
              key={user?.id || user?.username}
              embedded
              onClose={() => setIsCustomizationOpen(false)}
              onProfileUpdated={refreshPublicProfile}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function FriendAvatar({ person }) {
  return (
    <span className="friend-avatar">
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <User size={20} aria-hidden="true" />}
    </span>
  );
}

function FriendPersonCard({ person, subtitle, actions, className = '' }) {
  const content = (
    <>
      <FriendAvatar person={person} />
      <span className="friend-person-copy">
        <strong>{person.name}</strong>
        <small>{person.username ? `@${person.username}` : subtitle}</small>
      </span>
    </>
  );
  return (
    <article className={`card friend-person-card ${className}`}>
      {person.username ? <Link className="friend-person-link" to={`/u/${encodeURIComponent(person.username)}`}>{content}</Link> : <div className="friend-person-link">{content}</div>}
      {subtitle && person.username ? <small className="friend-person-meta">{subtitle}</small> : null}
      {actions ? <div className="friend-person-actions">{actions}</div> : null}
    </article>
  );
}

function FriendsPage() {
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    let active = true;
    focuserApi.friends.list()
      .then((result) => { if (active) setHub(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const performAction = async (key, action) => {
    if (busyKey) return;
    setBusyKey(key);
    setError('');
    try {
      await action();
      setHub(await focuserApi.friends.list());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyKey('');
    }
  };

  const pendingCount = hub?.incomingRequests.length || 0;

  return (
    <AppLayout>
      <PageHeader
        title="Amigos"
        eyebrow="Comunidade"
        subtitle="Conecte-se com pessoas e acompanhe seus pedidos de amizade."
        action={<button type="button" className="button button-primary" onClick={() => navigate('/pessoas')}><UserPlus size={17} /> Encontrar pessoas</button>}
      />
      {error ? <p className="error-text friends-error" role="alert">{error}</p> : null}
      {isLoading ? <div className="card state-card" role="status">Carregando sua central de amigos…</div> : null}
      {!isLoading && !error && hub ? (
        <div className="friends-hub">
          <section className="friends-section" aria-labelledby="incoming-friends-heading">
            <header className="friends-section-heading">
              <div><p className="eyebrow">Pedidos</p><h2 id="incoming-friends-heading">Recebidos</h2></div>
              <span className="friends-count">{pendingCount}</span>
            </header>
            {hub.incomingRequests.length ? (
              <div className="friends-people-grid">
                {hub.incomingRequests.map((person) => (
                  <FriendPersonCard
                    key={person.requestId}
                    person={person}
                    subtitle="Quer adicionar você"
                    className="friend-request-card"
                    actions={<>
                      <button type="button" className="button button-primary" disabled={Boolean(busyKey)} onClick={() => performAction(person.requestId, () => focuserApi.friends.acceptRequest(person.requestId))}>
                        <Check size={15} /> {busyKey === person.requestId ? 'Aguarde…' : 'Aceitar'}
                      </button>
                      <button type="button" className="button button-secondary" disabled={Boolean(busyKey)} onClick={() => performAction(person.requestId, () => focuserApi.friends.removeRequest(person.requestId))}>Recusar</button>
                    </>}
                  />
                ))}
              </div>
            ) : <p className="card friends-empty muted-state">Você não tem pedidos recebidos.</p>}
          </section>

          <section className="friends-section" aria-labelledby="friends-list-heading">
            <header className="friends-section-heading">
              <div><p className="eyebrow">Sua rede</p><h2 id="friends-list-heading">Meus amigos</h2></div>
              <span className="friends-count">{hub.friends.length}</span>
            </header>
            {hub.friends.length ? (
              <div className="friends-people-grid">
                {hub.friends.map((person) => (
                  <FriendPersonCard
                    key={person.friendshipId}
                    person={person}
                    subtitle="Amigo"
                    className="friend-list-card"
                    actions={<button type="button" className="button button-secondary" disabled={Boolean(busyKey)} onClick={() => performAction(person.friendshipId, () => focuserApi.friends.removeFriend(person.id))}>
                      <UserMinus size={15} /> {busyKey === person.friendshipId ? 'Aguarde…' : 'Remover'}
                    </button>}
                  />
                ))}
              </div>
            ) : <p className="card friends-empty muted-state">Sua lista está vazia. Encontre pessoas para começar a se conectar.</p>}
          </section>

          <section className="friends-section" aria-labelledby="outgoing-friends-heading">
            <header className="friends-section-heading">
              <div><p className="eyebrow">Aguardando</p><h2 id="outgoing-friends-heading">Pedidos enviados</h2></div>
              <span className="friends-count">{hub.outgoingRequests.length}</span>
            </header>
            {hub.outgoingRequests.length ? (
              <div className="friends-people-grid">
                {hub.outgoingRequests.map((person) => (
                  <FriendPersonCard
                    key={person.requestId}
                    person={person}
                    subtitle="Aguardando resposta"
                    className="friend-outgoing-card"
                    actions={<button type="button" className="button button-secondary" disabled={Boolean(busyKey)} onClick={() => performAction(person.requestId, () => focuserApi.friends.removeRequest(person.requestId))}>
                      {busyKey === person.requestId ? 'Aguarde…' : 'Cancelar pedido'}
                    </button>}
                  />
                ))}
              </div>
            ) : <p className="card friends-empty muted-state">Você não enviou pedidos pendentes.</p>}
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function DashboardFriends() {
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    focuserApi.friends.list()
      .then((result) => { if (active) setFriends(result.friends); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, []);

  return (
    <section className="card dashboard-friends" aria-labelledby="dashboard-friends-title">
      <header className="dashboard-friends-heading">
        <div>
          <p className="eyebrow">Comunidade</p>
          <h3 id="dashboard-friends-title">Amigos</h3>
        </div>
        <Link className="text-button" to="/app/amigos">Ver todos</Link>
      </header>
      {error ? <p className="error-text" role="alert">Não foi possível carregar seus amigos: {error}</p> : null}
      {!error && !friends ? <p className="muted-state" role="status">Carregando amigos…</p> : null}
      {!error && friends?.length ? (
        <div className="dashboard-friends-list">
          {friends.slice(0, 5).map((person) => (
            <Link className="dashboard-friend" key={person.friendshipId} to={`/u/${encodeURIComponent(person.username)}`}>
              <FriendAvatar person={person} />
              <span className="dashboard-friend-copy">
                <strong>{person.name}</strong>
                <small>@{person.username}</small>
              </span>
            </Link>
          ))}
          {friends.length > 5 ? <p className="muted-state dashboard-friends-more">e mais {friends.length - 5} {friends.length - 5 === 1 ? 'amigo' : 'amigos'}</p> : null}
        </div>
      ) : null}
      {!error && friends && friends.length === 0 ? (
        <div className="dashboard-friends-empty">
          <p className="muted-state">Sua lista ainda está vazia.</p>
          <Link to="/pessoas">Encontrar pessoas</Link>
        </div>
      ) : null}
    </section>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    focuserApi.dashboard()
      .then(setDashboard)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  const metrics = dashboard ? [
    { label: 'Hábitos ativos', value: dashboard.totalActiveHabits, hint: 'Na sua rotina', icon: CheckCheck },
    { label: 'Concluídos hoje', value: `${dashboard.completed}/${dashboard.scheduled}`, hint: `${dashboard.pending} pendentes hoje`, icon: Check },
    { label: 'Conclusões na semana', value: `${dashboard.progress.last7Days.completed}/${dashboard.progress.last7Days.scheduled}`, hint: dashboard.progress.last7Days.completionRate === null ? 'Sem hábitos programados' : `${Math.round(dashboard.progress.last7Days.completionRate * 100)}% de conclusão`, icon: TrendingUp },
    { label: 'Sequência atual', value: dashboard.progress.currentStreak, hint: `Melhor: ${dashboard.progress.bestStreak} dias`, icon: Trophy },
  ] : [];
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <AppLayout>
      <PageHeader title={firstName ? `Olá, ${firstName}` : 'Olá'} eyebrow="Bem-vindo de volta" subtitle="Seu progresso e sua rotina de hoje." />
      <ApiState loading={isLoading || (!dashboard && !error)} error={error}>
        <section className="metrics-grid">
          {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </section>
        <section className="main-grid">
          <FocusTimer />
          <DashboardFriends />
        </section>
        <section className="card today-list">
          <div className="section-heading"><h3>Hábitos de hoje</h3><span className="metric-label">{dashboard?.date}</span></div>
          {dashboard?.habits?.length ? dashboard.habits.map((habit) => (
            <div className="today-habit" key={habit.id}>
              <span>{habit.name}</span>
              <span className={habit.completed ? 'completed-label' : 'pending-label'}>{habit.completed ? 'Concluído' : 'Pendente'}</span>
            </div>
          )) : <p className="muted-state">Nenhum hábito programado para hoje.</p>}
        </section>
      </ApiState>
    </AppLayout>
  );
}

function HabitsPage() {
  const [habits, setHabits] = useState([]);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [scheduledIds, setScheduledIds] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ name: '', description: '', frequency: 'DAILY', daysOfWeek: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadHabits = async () => {
    setError('');
    try {
      const [habitResponse, dashboard] = await Promise.all([
        focuserApi.habits.list({ status: 'all', limit: '100' }),
        focuserApi.dashboard(),
      ]);
      setHabits(habitResponse.items);
      setScheduledIds(new Set(dashboard.habits.map((habit) => habit.id)));
      setCompletedIds(new Set(dashboard.habits.filter((habit) => habit.completed).map((habit) => habit.id)));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      focuserApi.habits.list({ status: 'all', limit: '100' }),
      focuserApi.dashboard(),
    ])
      .then(([habitResponse, dashboard]) => {
        if (!active) return;
        setHabits(habitResponse.items);
        setScheduledIds(new Set(dashboard.habits.map((habit) => habit.id)));
        setCompletedIds(new Set(dashboard.habits.filter((habit) => habit.completed).map((habit) => habit.id)));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const submitHabit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || busyId) return;
    setBusyId('new');
    setError('');
    try {
      await focuserApi.habits.create({
        name: form.name.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        frequency: form.frequency,
        ...(form.frequency === 'CUSTOM' ? { daysOfWeek: form.daysOfWeek } : {}),
      });
      setForm({ name: '', description: '', frequency: 'DAILY', daysOfWeek: [] });
      setShowForm(false);
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const checkIn = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await focuserApi.habits.checkIn(id);
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const editHabit = async (habit) => {
    const name = window.prompt('Nome do hábito', habit.name);
    if (name === null || !name.trim() || name.trim() === habit.name) return;
    setBusyId(habit.id);
    setError('');
    try {
      await focuserApi.habits.update(habit.id, { name: name.trim() });
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const archiveHabit = async (habit) => {
    setBusyId(habit.id);
    setError('');
    try {
      await focuserApi.habits.archive(habit.id, habit.isActive);
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const deleteHabit = async (habit) => {
    if (!window.confirm(`Excluir "${habit.name}" e todo o histórico de check-ins?`)) return;
    setBusyId(habit.id);
    setError('');
    try {
      await focuserApi.habits.remove(habit.id);
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const visibleHabits = habits.filter((habit) => filter === 'all' || (filter === 'active' ? habit.isActive : !habit.isActive));

  return (
    <AppLayout>
      <PageHeader title="Hábitos" subtitle="mantenha a consistência." action={<button type="button" className="button button-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Novo hábito</button>} />
      <div className="filter-row">
        <button type="button" className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
        <button type="button" className={`filter-chip ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Ativos</button>
        <button type="button" className={`filter-chip ${filter === 'archived' ? 'active' : ''}`} onClick={() => setFilter('archived')}>Arquivados</button>
      </div>
      {error ? <div className="card error-state" role="alert">{error}</div> : null}
      {showForm ? (
        <form className="card habit-form" onSubmit={submitHabit}>
          <h3>Novo hábito</h3>
          <p className="muted-state">A categoria será definida automaticamente pelo Groq com base no nome e na descrição.</p>
          <label>
            <span>Nome</span>
            <input type="text" maxLength="100" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Leitura diária" />
          </label>
          <label>
            <span>Descrição <small>(opcional)</small></span>
            <textarea maxLength="500" rows="2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Adicione detalhes se quiser" />
          </label>
          <label>
            <span>Frequência</span>
            <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value, daysOfWeek: [] })}>
              <option value="DAILY">Todos os dias</option>
              <option value="CUSTOM">Dias selecionados</option>
            </select>
          </label>
          {form.frequency === 'CUSTOM' ? (
            <fieldset className="weekday-field">
              <legend>Dias da semana</legend>
              {WEEKDAY_NAMES.map((day, index) => (
                <label key={day} className="weekday-option">
                  <input type="checkbox" checked={form.daysOfWeek.includes(index)} onChange={(event) => setForm({
                    ...form,
                    daysOfWeek: event.target.checked ? [...form.daysOfWeek, index] : form.daysOfWeek.filter((value) => value !== index),
                  })} />
                  <span>{day}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="inline-row">
            <button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={busyId === 'new' || (form.frequency === 'CUSTOM' && form.daysOfWeek.length === 0)}>{busyId === 'new' ? 'Definindo categoria…' : 'Salvar hábito'}</button>
          </div>
        </form>
      ) : null}
      <ApiState loading={isLoading} error={error} empty={visibleHabits.length === 0 ? 'Nenhum hábito encontrado nesta categoria. Crie seu primeiro hábito.' : null}>
        <div className="habit-grid">
          {visibleHabits.map((habit) => <HabitCard
            key={habit.id}
            habit={habit}
            completedToday={completedIds.has(habit.id)}
            scheduledToday={scheduledIds.has(habit.id)}
            isBusy={busyId === habit.id}
            onCheckIn={checkIn}
            onEdit={editHabit}
            onArchive={archiveHabit}
            onDelete={deleteHabit}
          />)}
        </div>
      </ApiState>
    </AppLayout>
  );
}

function ReadingBookCover({ book }) {
  const coverSource = book.coverUrl || (book.coverId
    ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
    : book.isbn
      ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-M.jpg?default=false`
      : null);
  const [hasCover, setHasCover] = useState(Boolean(coverSource));
  if (!coverSource || !hasCover) {
    return <div className="reading-cover-fallback" aria-hidden="true"><BookOpen size={25} /></div>;
  }
  return (
    <img
      className="reading-cover"
      src={coverSource}
      alt={`Capa de ${book.title}`}
      loading="lazy"
      onError={() => setHasCover(false)}
    />
  );
}

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

function ProfileBookPicker({ id, title, description, books, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedBook = books.find((book) => book.id === value);

  return (
    <section className="profile-book-picker" aria-labelledby={`${id}-label`}>
      <div className="profile-book-picker-heading">
        <div>
          <h4 id={`${id}-label`}>{title}</h4>
          <p className="muted-state">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className={`profile-book-trigger${selectedBook ? ' has-selection' : ''}`}
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {selectedBook ? (
          <>
            <ReadingBookCover key={`${selectedBook.id}-${selectedBook.coverId || selectedBook.isbn || 'none'}`} book={selectedBook} />
            <span className="profile-book-trigger-info">
              <strong>{selectedBook.title}</strong>
              <small>{selectedBook.author || 'Autor não informado'}</small>
            </span>
          </>
        ) : (
          <span className="profile-book-trigger-empty"><BookOpen size={20} /> Escolha um livro da sua biblioteca</span>
        )}
        <span className="profile-book-trigger-action">{selectedBook ? 'Trocar' : 'Escolher'} <ChevronDown size={16} /></span>
      </button>
      {isOpen ? (
        <div className="profile-book-options" id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`}>
          <button
            type="button"
            className={`profile-book-option profile-book-none${!value ? ' selected' : ''}`}
            role="option"
            aria-selected={!value}
            onClick={() => { onChange(''); setIsOpen(false); }}
          >
            <span className="profile-book-option-placeholder"><BookOpen size={20} /></span>
            <span><strong>Nenhum livro</strong><small>Não exibir um livro nesta seção</small></span>
            {!value ? <Check size={17} aria-hidden="true" /> : null}
          </button>
          {books.map((book) => (
            <button
              type="button"
              className={`profile-book-option${value === book.id ? ' selected' : ''}`}
              key={book.id}
              role="option"
              aria-selected={value === book.id}
              onClick={() => { onChange(book.id); setIsOpen(false); }}
            >
              <ReadingBookCover key={`${book.id}-${book.coverId || book.isbn || 'none'}`} book={book} />
              <span className="profile-book-option-info">
                <strong>{book.title}</strong>
                <small>{book.author || 'Autor não informado'}</small>
                {!book.isActive ? <small className="profile-book-archived">Arquivado</small> : null}
              </span>
              {value === book.id ? <Check size={17} aria-hidden="true" /> : null}
            </button>
          ))}
          {books.length === 0 ? <p className="profile-book-options-empty muted-state">Nenhum livro disponível.</p> : null}
        </div>
      ) : null}
    </section>
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

function ReadingLibrary() {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [today, setToday] = useState(null);
  const [readingFeed, setReadingFeed] = useState([]);
  const [isFeedLoading, setIsFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [filter, setFilter] = useState('active');
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [sessionSetup, setSessionSetup] = useState(null);
  const [readingSession, setReadingSession] = useState(null);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
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

  const loadReadingFeed = useCallback(async () => {
    setIsFeedLoading(true);
    setFeedError('');
    try {
      const response = await focuserApi.reading.feed();
      setReadingFeed(response.items);
    } catch (requestError) {
      setFeedError(requestError.message);
    } finally {
      setIsFeedLoading(false);
    }
  }, []);

  const loadReading = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [booksResponse, todayResponse] = await Promise.all([
        focuserApi.reading.listBooks({ status: filter, limit: '100' }),
        focuserApi.reading.today(),
      ]);
      setBooks(booksResponse.items);
      setToday(todayResponse);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    let active = true;
    focuserApi.reading.feed()
      .then((response) => {
        if (active) setReadingFeed(response.items);
      })
      .catch((requestError) => {
        if (active) setFeedError(requestError.message);
      })
      .finally(() => {
        if (active) setIsFeedLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      focuserApi.reading.listBooks({ status: filter, limit: '100' }),
      focuserApi.reading.today(),
    ])
      .then(([booksResponse, todayResponse]) => {
        if (!active) return;
        setBooks(booksResponse.items);
        setToday(todayResponse);
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [filter]);

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
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
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
      await loadReading();
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
      await Promise.all([loadReading(), loadReadingFeed()]);
    } catch (requestError) {
      setError(requestError.message);
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
      await loadReading();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const removeBook = async (book) => {
    if (!window.confirm(`Excluir "${book.title}" e seu histórico de leitura?`)) return;
    setBusyId(book.id);
    setError('');
    try {
      await focuserApi.reading.removeBook(book.id);
      await loadReading();
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
        <MetricCard label="Livros na lista" value={books.length} hint={filter === 'active' ? 'Em leitura' : 'Nesta categoria'} icon={BookOpen} />
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
                <Link className="reading-feed-reader" to={`/u/${encodeURIComponent(entry.user.username)}`} aria-label={`Ver perfil de ${entry.user.name}`}>
                  {entry.user.avatarUrl
                    ? <img src={entry.user.avatarUrl} alt="" loading="lazy" />
                    : <User size={19} aria-hidden="true" />}
                </Link>
                <div className="reading-feed-content">
                  <div className="reading-feed-person">
                    <Link to={`/u/${encodeURIComponent(entry.user.username)}`}>{entry.user.id === user?.id ? 'Você' : entry.user.name}</Link>
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
      </section>
      <div className="filter-row" role="group" aria-label="Filtrar livros">
        {[['active', 'Lendo'], ['archived', 'Finalizados/arquivados'], ['all', 'Todos']].map(([value, label]) => (
          <button key={value} type="button" className={`filter-chip ${filter === value ? 'active' : ''}`} onClick={() => { setIsLoading(true); setError(''); setFilter(value); }}>{label}</button>
        ))}
      </div>
      {error && !showBookForm && !sessionSetup && !readingSession ? <div className="card state-card error-state" role="alert">{error}</div> : null}
      {sessionSetup || readingSession ? (
        <section className={`reading-session card ${readingSession?.stage === 'active' ? 'reading-session-focus' : ''} ${readingSession?.stage === 'active' && !readingSession.startedAt ? 'reading-session-paused' : ''}`} ref={sessionPanelRef} aria-label="Sessão de leitura">
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
                    <label><span>Ou escolha os minutos (1 a 1440)</span><input required type="number" min="1" max="1440" step="1" value={sessionSetup.minutes} onChange={(event) => setSessionSetup({ ...sessionSetup, minutes: event.target.value })} /></label>
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
                <form className="session-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="session-finish-title" onSubmit={saveReadingLog}>
                  <div className="session-finish-icon"><BookOpen size={22} /></div>
                  <p className="eyebrow">SESSÃO CONCLUÍDA · {formatReadingTime(readingSession.elapsedSeconds)}</p>
                  <h2 id="session-finish-title">Quantas páginas você leu?</h2>
                  <p className="session-finish-book">{readingSession.book.title}</p>
                  <label className="session-pages"><span>Páginas lidas</span><input autoFocus required type="number" min="1" max={Math.min(10000, readingSession.book.totalPages - readingSession.book.currentPage)} step="1" value={sessionForm.pagesRead} onChange={(event) => updateSessionPages(event.target.value)} placeholder="Ex.: 12" /></label>
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
            <label><span>Total de páginas</span><input required type="number" min="1" max="100000" step="1" value={bookForm.totalPages} onChange={(event) => setBookForm({ ...bookForm, totalPages: event.target.value })} /></label>
            <label><span>Página atual</span><input required type="number" min="0" max={bookForm.totalPages || 100000} step="1" value={bookForm.currentPage} onChange={(event) => setBookForm({ ...bookForm, currentPage: event.target.value })} /></label>
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

function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [filter, setFilter] = useState('active');
  const [form, setForm] = useState({ name: '', description: '', category: '', targetValue: '', currentValue: '0', unit: '', period: 'MONTHLY' });
  const [editingGoal, setEditingGoal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await focuserApi.goals.list({ status: filter, limit: '100' });
      setGoals(response.items);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    let active = true;
    focuserApi.goals.list({ status: filter, limit: '100' })
      .then((response) => { if (active) setGoals(response.items); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [filter]);

  const openCreateForm = () => {
    setEditingGoal(null);
    setForm({ name: '', description: '', category: '', targetValue: '', currentValue: '0', unit: '', period: 'MONTHLY' });
    setShowForm(true);
  };

  const editGoal = (goal) => {
    setEditingGoal(goal);
    setForm({
      name: goal.name, description: goal.description || '', category: goal.category || '',
      targetValue: String(goal.targetValue), currentValue: String(goal.currentValue),
      unit: goal.unit, period: goal.period,
    });
    setShowForm(true);
  };

  const saveGoal = async (event) => {
    event.preventDefault();
    const id = editingGoal?.id || 'new';
    setBusyId(id);
    setError('');
    const data = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      targetValue: Number(form.targetValue),
      unit: form.unit.trim(),
      period: form.period,
      ...(editingGoal ? { currentValue: Number(form.currentValue) } : {}),
    };
    try {
      if (editingGoal) await focuserApi.goals.update(editingGoal.id, data);
      else await focuserApi.goals.create(data);
      setShowForm(false);
      setEditingGoal(null);
      await loadGoals();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const addProgress = async (goal) => {
    setBusyId(goal.id);
    setError('');
    try {
      await focuserApi.goals.addProgress(goal.id, 1);
      await loadGoals();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const toggleArchive = async (goal) => {
    setBusyId(goal.id);
    setError('');
    try {
      await focuserApi.goals.update(goal.id, { isActive: !goal.isActive });
      await loadGoals();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const removeGoal = async (goal) => {
    if (!window.confirm(`Excluir a meta "${goal.name}"?`)) return;
    setBusyId(goal.id);
    setError('');
    try {
      await focuserApi.goals.remove(goal.id);
      await loadGoals();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Metas" subtitle="defina um alvo e acompanhe seu progresso." action={<button type="button" className="button button-primary" onClick={openCreateForm}><Plus size={17} /> Nova meta</button>} />
      <div className="filter-row" role="group" aria-label="Filtrar metas">
        {[['active', 'Ativas'], ['archived', 'Arquivadas'], ['all', 'Todas']].map(([value, label]) => (
          <button key={value} type="button" className={`filter-chip ${filter === value ? 'active' : ''}`} onClick={() => { setIsLoading(true); setError(''); setFilter(value); }}>{label}</button>
        ))}
      </div>
      {showForm ? (
        <form className="goal-form card" onSubmit={saveGoal}>
          <h3>{editingGoal ? 'Editar meta' : 'Criar meta'}</h3>
          <div className="goal-form-grid">
            <label><span>Nome</span><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label><span>Categoria</span><input maxLength={60} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Pessoal, saúde..." /></label>
            <label><span>Valor alvo</span><input required type="number" min="0.01" step="any" max="1000000000" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} /></label>
            <label><span>Unidade</span><input required maxLength={30} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="livros, horas..." /></label>
            <label><span>Período</span><select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}><option value="DAILY">Diário</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensal</option><option value="CUSTOM">Personalizado</option></select></label>
            {editingGoal ? <label><span>Progresso atual</span><input type="number" min="0" step="any" max="1000000000" value={form.currentValue} onChange={(event) => setForm({ ...form, currentValue: event.target.value })} /></label> : null}
          </div>
          <label><span>Descrição</span><textarea maxLength={500} rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <div className="inline-row">
            <button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={Boolean(busyId)}>{busyId ? 'Salvando…' : 'Salvar meta'}</button>
          </div>
        </form>
      ) : null}
      <ApiState loading={isLoading} error={error && !showForm ? error : ''} empty={goals.length === 0 ? 'Nenhuma meta nesta categoria. Crie uma meta para acompanhar seu progresso.' : null}>
        <div className="goal-grid">
          {goals.map((goal) => {
            const percent = Math.min(100, (goal.currentValue / goal.targetValue) * 100);
            const periodLabel = { DAILY: 'Diária', WEEKLY: 'Semanal', MONTHLY: 'Mensal', CUSTOM: 'Personalizada' }[goal.period] || goal.period;
            return (
              <article className="goal-card card" key={goal.id}>
                <div className="goal-top"><span className="status-pill">{periodLabel} · {goal.isActive ? 'Ativa' : 'Arquivada'}</span><Target size={18} /></div>
                <div><h3>{goal.name}</h3><small>{goal.category || goal.unit}</small>{goal.description ? <p className="goal-description">{goal.description}</p> : null}</div>
                <div className="goal-meta"><strong className="goal-value">{goal.currentValue} / {goal.targetValue}</strong><small>{goal.unit}</small></div>
                <div className="progress-bar" role="progressbar" aria-label={`Progresso de ${goal.name}`} aria-valuenow={Math.round(percent)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div>
                <div className="goal-actions">
                  <button type="button" className="button button-secondary" disabled={!goal.isActive || busyId === goal.id} onClick={() => addProgress(goal)}>+1 progresso</button>
                  <button type="button" className="text-button" disabled={busyId === goal.id} aria-label={`Editar ${goal.name}`} onClick={() => editGoal(goal)}><Pencil size={16} /></button>
                  <button type="button" className="text-button" disabled={busyId === goal.id} aria-label={goal.isActive ? `Arquivar ${goal.name}` : `Reativar ${goal.name}`} onClick={() => toggleArchive(goal)}>{goal.isActive ? <MoreHorizontal size={16} /> : <Check size={16} />}</button>
                  <button type="button" className="text-button" disabled={busyId === goal.id} aria-label={`Excluir ${goal.name}`} onClick={() => removeGoal(goal)}><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      </ApiState>
    </AppLayout>
  );
}

function AnalyticsPage() {
  const [period, setPeriod] = useState('week');
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([focuserApi.progress(period), focuserApi.history(period)])
      .then(([progress, series]) => {
        if (!active) return;
        setMetrics(progress);
        setHistory(series);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [period]);

  return (
    <AppLayout>
      <PageHeader title="Análises" subtitle="seu progresso de hábitos." action={
        <select className="period-select" value={period} onChange={(event) => {
          setIsLoading(true);
          setError('');
          setPeriod(event.target.value);
        }} aria-label="Período das análises">
          <option value="week">Esta semana</option>
          <option value="month">Este mês</option>
        </select>
      } />
      <ApiState loading={isLoading} error={error} empty={metrics && metrics.totals.scheduled === 0 ? 'Ainda não há hábitos programados neste período para calcular estatísticas.' : null}>
        <section className="metrics-grid">
          <MetricCard label="Hábitos ativos" value={metrics?.totals.activeHabits ?? 0} hint="No período selecionado" icon={CheckCheck} />
          <MetricCard label="Conclusões" value={`${metrics?.totals.completed ?? 0}/${metrics?.totals.scheduled ?? 0}`} hint="Check-ins registrados" icon={Check} />
          <MetricCard label="Taxa de conclusão" value={metrics?.totals.completionRate == null ? '—' : `${Math.round(metrics.totals.completionRate * 100)}%`} hint="Proporção dos hábitos programados" icon={TrendingUp} />
          <MetricCard label="Sequência atual" value={metrics?.streaks.current ?? 0} hint={`Melhor: ${metrics?.streaks.best ?? 0} dias`} icon={Trophy} />
        </section>
        <ChartCard series={history?.series ?? []} period={period} />
        <section className="card today-list">
          <div className="section-heading"><h3>Hábitos no período</h3><span className="metric-label">{metrics?.period?.from} – {metrics?.period?.to}</span></div>
          {metrics?.habits?.length ? metrics.habits.map((habit) => (
            <div className="today-habit" key={habit.id}>
              <span>{habit.name}</span>
              <span>{habit.completed}/{habit.scheduled} · {habit.completionRate == null ? '—' : `${Math.round(habit.completionRate * 100)}%`}</span>
            </div>
          )) : <p className="muted-state">Sem hábitos registrados neste intervalo.</p>}
        </section>
      </ApiState>
    </AppLayout>
  );
}

function OwnProfileRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.username ? `/u/${encodeURIComponent(user.username)}` : '/app'} replace />;
}

function ProfilePage({ embedded = false, onClose, onProfileUpdated }) {
  const { user, setUser, accentColor, updateAccentColor } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [currentBookId, setCurrentBookId] = useState(user?.currentBookId || '');
  const [favoriteBookId, setFavoriteBookId] = useState(user?.favoriteBookId || '');
  const [books, setBooks] = useState([]);
  const [booksError, setBooksError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [themeError, setThemeError] = useState('');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [cropRequest, setCropRequest] = useState(null);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerError, setBannerError] = useState('');

  useEffect(() => () => {
    if (cropRequest?.source) URL.revokeObjectURL(cropRequest.source);
  }, [cropRequest]);

  const closeCropEditor = useCallback(() => setCropRequest(null), []);

  useEffect(() => {
    let active = true;
    focuserApi.reading.listBooks({ status: 'all', limit: '100' })
      .then((response) => { if (active) setBooks(response.items); })
      .catch((requestError) => { if (active) setBooksError(requestError.message); });
    return () => { active = false; };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const { user: updatedUser } = await focuserApi.updateProfile({
        name: name.trim(),
        username: username.trim() || null,
        bio: bio.trim() || null,
        currentBookId: currentBookId || null,
        favoriteBookId: favoriteBookId || null,
      });
      setUser(updatedUser);
      setName(updatedUser.name);
      setUsername(updatedUser.username || '');
      setBio(updatedUser.bio || '');
      setCurrentBookId(updatedUser.currentBookId || '');
      setFavoriteBookId(updatedUser.favoriteBookId || '');
      setMessage('Perfil atualizado.');
      onProfileUpdated?.(updatedUser.username);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const uploadProfileImage = async (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const setImageMessage = type === 'banner' ? setBannerMessage : setAvatarMessage;
    const setImageError = type === 'banner' ? setBannerError : setAvatarError;
    setImageMessage('');
    setImageError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Escolha uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('A imagem deve ter no máximo 5 MB.');
      return;
    }

    setCropRequest({ source: URL.createObjectURL(file), type });
  };

  const uploadCroppedProfileImage = async (croppedImage, type) => {
    const setImageMessage = type === 'banner' ? setBannerMessage : setAvatarMessage;
    const setImageError = type === 'banner' ? setBannerError : setAvatarError;
    const setUploading = type === 'banner' ? setIsUploadingBanner : setIsUploadingAvatar;
    setImageMessage('');
    setImageError('');
    setUploading(true);
    try {
      const signature = type === 'banner'
        ? await focuserApi.bannerUploadSignature()
        : await focuserApi.avatarUploadSignature();
      const formData = new FormData();
      formData.append('file', croppedImage, type === 'banner' ? 'profile-banner.webp' : 'profile-avatar.webp');
      formData.append('api_key', signature.apiKey);
      formData.append('timestamp', String(signature.timestamp));
      formData.append('folder', signature.folder);
      formData.append('signature', signature.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || typeof result.secure_url !== 'string') {
        throw new Error(result.error?.message || 'Não foi possível enviar a imagem ao Cloudinary.');
      }
      const field = type === 'banner' ? 'bannerUrl' : 'avatarUrl';
      const { user: updatedUser } = await focuserApi.updateProfile({ [field]: result.secure_url });
      setUser(updatedUser);
      setImageMessage(type === 'banner' ? 'Banner atualizado.' : 'Foto de perfil atualizada.');
      onProfileUpdated?.(updatedUser.username);
    } catch (uploadError) {
      setImageError(uploadError.message);
      throw uploadError;
    } finally {
      setUploading(false);
    }
  };

  const activeBooks = books.filter((book) => book.isActive);

  const selectAccentColor = async (color) => {
    if (isSavingTheme) return;
    setThemeError('');
    setIsSavingTheme(true);
    try {
      await updateAccentColor(color);
      onProfileUpdated?.(user?.username);
    } catch (updateError) {
      setThemeError(updateError.message);
    } finally {
      setIsSavingTheme(false);
    }
  };

  const content = (
    <>
      {embedded ? (
        <div className="profile-customization-heading">
          <div>
            <p className="eyebrow">Personalização</p>
            <h2 id="profile-customization-title">Editar perfil</h2>
            <p className="muted-state">Atualize as informações e a aparência do seu perfil público.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar personalização" onClick={onClose}><X size={19} /></button>
        </div>
      ) : (
        <PageHeader title="Perfil" eyebrow="Personalização" subtitle="Personalize as informações e a aparência do seu perfil público." />
      )}
      <form className="card profile-settings" onSubmit={saveProfile}>
        <div className="profile-settings-section-heading">
          <span className="eyebrow">identidade</span>
          <h3>Seu perfil</h3>
          <p className="muted-state">Escolha como as pessoas verão você na comunidade.</p>
        </div>
        <div className="profile-media-grid">
          <section className="profile-media-card profile-banner-card" aria-label="Banner do perfil">
            <div className="profile-banner-preview">
              {user?.bannerUrl ? <img src={user.bannerUrl} alt="Prévia do banner do perfil" /> : <span>Seu banner</span>}
              <span className="profile-media-overlay">Banner do perfil</span>
            </div>
            <div className="profile-media-card-footer">
              <div className="profile-media-copy">
                <strong>Imagem de capa</strong>
                <small>JPG, PNG ou WebP · até 5 MB</small>
              </div>
              <label className="button button-secondary profile-avatar-button">
                {isUploadingBanner ? 'Enviando…' : user?.bannerUrl ? 'Trocar' : 'Adicionar'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadProfileImage(event, 'banner')} disabled={isUploadingBanner} />
              </label>
            </div>
            {bannerMessage ? <p className="success-text" role="status">{bannerMessage}</p> : null}
            {bannerError ? <p className="error-text" role="alert">{bannerError}</p> : null}
          </section>
          <section className="profile-media-card profile-avatar-card" aria-label="Foto do perfil">
            <div className="profile-avatar-preview">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="Foto do perfil" /> : <User size={30} />}
            </div>
            <div className="profile-media-card-footer">
              <div className="profile-media-copy">
                <strong>Foto de perfil</strong>
                <small>JPG, PNG ou WebP · até 5 MB</small>
              </div>
              <label className="button button-secondary profile-avatar-button">
                {isUploadingAvatar ? 'Enviando…' : 'Trocar'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadProfileImage(event, 'avatar')} disabled={isUploadingAvatar} />
              </label>
            </div>
            {avatarMessage ? <p className="success-text" role="status">{avatarMessage}</p> : null}
            {avatarError ? <p className="error-text" role="alert">{avatarError}</p> : null}
          </section>
        </div>
        <div className="profile-settings-section-heading profile-info-heading">
          <span className="eyebrow">informações</span>
          <h3>Detalhes públicos</h3>
        </div>
        <div className="profile-fields-grid">
          <label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength="80" required /></label>
          <label>
            <span>Nome de usuário</span>
            <div className="profile-username-input"><span aria-hidden="true">@</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, '').toLowerCase())} minLength="3" maxLength="30" pattern="[a-zA-Z0-9._]{3,30}" placeholder="seu.usuario" /></div>
            <small className="muted-state">Seu identificador público; use letras, números, pontos ou sublinhados.</small>
          </label>
          <label className="profile-bio-field"><span>Bio</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength="500" rows="4" placeholder="Conte um pouco sobre você." /><small className="muted-state profile-bio-count">{bio.length}/500 caracteres</small></label>
        </div>
        <div className="profile-settings-section-heading profile-books-heading">
          <span className="eyebrow">leituras</span>
          <h3>Livros no perfil</h3>
          <p className="muted-state">Destaque o que está lendo e escolha seu livro favorito.</p>
        </div>
        <div className="profile-book-pickers">
          <ProfileBookPicker
            id="current-book"
            title="Livro em leitura"
            description="Escolha entre seus livros ativos."
            books={activeBooks}
            value={currentBookId}
            onChange={setCurrentBookId}
          />
          <ProfileBookPicker
            id="favorite-book"
            title="Livro favorito"
            description="Escolha entre os livros cadastrados na sua conta."
            books={books}
            value={favoriteBookId}
            onChange={setFavoriteBookId}
          />
        </div>
        {booksError ? <p className="error-text" role="alert">Não foi possível carregar seus livros: {booksError}</p> : null}
        {!booksError && books.length === 0 ? <p className="muted-state">Ainda não há livros cadastrados. <Link to="/app/leituras">Adicione livros na área de leituras.</Link></p> : null}
        <div className="profile-save-footer">
          <div>
            {message ? <p className="success-text" role="status">{message}</p> : <small>As alterações ficam visíveis no seu perfil público.</small>}
            {error ? <p className="error-text" role="alert">{error}</p> : null}
          </div>
          <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar perfil'}</button>
        </div>
      </form>
      <section className="card theme-settings" aria-labelledby="accent-color-heading">
        <div className="profile-settings-section-heading">
          <span className="eyebrow">aparência</span>
          <h3 id="accent-color-heading">Cor de destaque</h3>
          <p className="muted-state">Personalize botões e destaques do seu perfil. A preferência fica salva na sua conta.</p>
        </div>
        <div className="accent-options" role="group" aria-label="Escolha uma cor de destaque">
          {ACCENT_COLORS.map((color) => (
            <button
              type="button"
              key={color.value}
              className={`accent-option ${accentColor === color.value ? 'selected' : ''}`}
              style={{ '--swatch-color': color.value }}
              aria-label={color.label}
              aria-pressed={accentColor === color.value}
              disabled={isSavingTheme}
              onClick={() => selectAccentColor(color.value)}
            >
              <span />
              <small>{color.label}</small>
            </button>
          ))}
        </div>
        <label className="custom-accent-picker" htmlFor="custom-accent-color">
          <span className="custom-accent-swatch" style={{ '--swatch-color': accentColor }} aria-hidden="true" />
          <span><strong>Cor personalizada</strong><small>{accentColor.toUpperCase()}</small></span>
          <input
            id="custom-accent-color"
            className="accent-color-input"
            type="color"
            value={accentColor}
            aria-label="Escolher cor de destaque personalizada"
            disabled={isSavingTheme}
            onChange={(event) => selectAccentColor(event.target.value)}
          />
        </label>
        {isSavingTheme ? <p className="muted-state" role="status">Salvando preferência…</p> : null}
        {themeError ? <p className="error-text" role="alert">{themeError}</p> : null}
      </section>
      {cropRequest ? (
        <ProfileImageCropper
          source={cropRequest.source}
          type={cropRequest.type}
          onCancel={closeCropEditor}
          onApply={(croppedImage) => uploadCroppedProfileImage(croppedImage, cropRequest.type)}
        />
      ) : null}
    </>
  );
  return embedded
    ? <div className="profile-customization-content">{content}</div>
    : <AppLayout>{content}</AppLayout>;
}

function AccountSettingsPage() {
  const { user, setUser } = useAuth();
  const [timezone, setTimezone] = useState(user?.timezone || 'America/Sao_Paulo');
  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [timezoneMessage, setTimezoneMessage] = useState('');
  const [timezoneError, setTimezoneError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordCode, setPasswordCode] = useState('');
  const [passwordCodeSent, setPasswordCodeSent] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const saveTimezone = async (event) => {
    event.preventDefault();
    if (isSavingTimezone) return;
    setTimezoneMessage('');
    setTimezoneError('');
    setIsSavingTimezone(true);
    try {
      const { user: updatedUser } = await focuserApi.updateProfile({ timezone: timezone.trim() });
      setUser(updatedUser);
      setTimezone(updatedUser.timezone);
      setTimezoneMessage('Fuso horário atualizado.');
    } catch (error) {
      setTimezoneError(error.message);
    } finally {
      setIsSavingTimezone(false);
    }
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    if (isChangingPassword) return;
    setPasswordError('');
    setPasswordMessage('');
    setIsChangingPassword(true);
    try {
      if (!passwordCodeSent) {
        await focuserApi.startPasswordChange({ currentPassword, newPassword });
        setPasswordCodeSent(true);
        setPasswordMessage('Enviamos um código para o e-mail da sua conta.');
      } else {
        const { user: updatedUser } = await focuserApi.verifyPasswordChange({ code: passwordCode, newPassword });
        setUser(updatedUser);
        setCurrentPassword('');
        setNewPassword('');
        setPasswordCode('');
        setPasswordCodeSent(false);
        setPasswordMessage('Senha alterada. As outras sessões foram encerradas.');
      }
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Configurações" eyebrow="Conta" subtitle="Gerencie a segurança e as preferências da sua conta." />
      <div className="account-settings-stack">
        <form className="card profile-settings account-settings-card" onSubmit={saveTimezone}>
          <div>
            <p className="eyebrow">Preferências</p>
            <h2>Fuso horário</h2>
            <p className="muted-state">Define em qual dia seus hábitos e check-ins são contabilizados.</p>
          </div>
          <label>
            <span>Fuso horário IANA</span>
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength="64" placeholder="America/Sao_Paulo" required />
          </label>
          {timezoneMessage ? <p className="success-text" role="status">{timezoneMessage}</p> : null}
          {timezoneError ? <p className="error-text" role="alert">{timezoneError}</p> : null}
          <button type="submit" className="button button-primary" disabled={isSavingTimezone}>{isSavingTimezone ? 'Salvando…' : 'Salvar preferência'}</button>
        </form>

        <form className="card profile-settings account-settings-card" onSubmit={submitPasswordChange}>
          <div>
            <p className="eyebrow">Segurança</p>
            <h2>Alterar senha</h2>
            <p className="muted-state">Para confirmar a alteração, enviaremos um código de segurança para {user?.email}.</p>
          </div>
          {!passwordCodeSent ? <label><span>Senha atual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength="8" required /></label> : null}
          <label><span>Nova senha</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" maxLength="128" required /></label>
          {passwordCodeSent ? <label><span>Código de verificação</span><input value={passwordCode} onChange={(event) => setPasswordCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required /></label> : null}
          {passwordMessage ? <p className="success-text" role="status">{passwordMessage}</p> : null}
          {passwordError ? <p className="error-text" role="alert">{passwordError}</p> : null}
          <button type="submit" className="button button-primary" disabled={isChangingPassword}>{isChangingPassword ? 'Aguarde…' : passwordCodeSent ? 'Confirmar nova senha' : 'Enviar código de confirmação'}</button>
          {passwordCodeSent ? <button type="button" className="button button-secondary" disabled={isChangingPassword} onClick={() => { setPasswordCodeSent(false); setPasswordCode(''); setPasswordMessage(''); setPasswordError(''); }}>Cancelar</button> : null}
        </form>

        <section className="card account-settings-card account-settings-note">
          <div>
            <p className="eyebrow">Em breve</p>
            <h2>Notificações e bloqueio</h2>
            <p className="muted-state">Essas preferências ainda não são suportadas pela API.</p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function DownloadPage() {
  return (
    <div className="public-page">
      <PublicNavbar />
      <main className="container download-main">
        <div className="download-copy">
          <p className="eyebrow dark">download</p>
          <h1>leve o foco com você.</h1>
          <p>O Focuser ajuda a manter seus hábitos e o progresso organizados, onde quer que você esteja.</p>
          <div className="download-actions">
            <button type="button" className="button button-primary" disabled>Windows <span>Em breve</span></button>
            <button type="button" className="button button-secondary" disabled>macOS <span>Em breve</span></button>
            <button type="button" className="button button-secondary" disabled>Android <span>Em breve</span></button>
          </div>
        </div>
        <div className="hero-visual desktop-visual" aria-label="Mockup semelhante ao da landing page">
          <div className="device laptop">
            <div className="device-bar" />
            <div className="device-content">
              <div className="mini-metric">4h 30m</div>
              <div className="mini-bars">
                <span style={{ height: '30%' }} />
                <span style={{ height: '55%' }} />
                <span style={{ height: '78%' }} />
                <span style={{ height: '66%' }} />
                <span style={{ height: '88%' }} />
              </div>
            </div>
          </div>
          <div className="device phone">
            <div className="device-header" />
            <div className="phone-card">
              <strong>25:00</strong>
              <span>foco agora</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="auth-card card not-found-card">
        <Logo />
        <div className="not-found-body">
          <div className="not-found-number">404</div>
          <h1>página não encontrada</h1>
          <p>A página pode ter sido removida ou o endereço pode estar incorreto.</p>
          <Link to="/" className="button button-primary">Voltar para o início</Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/recursos" element={<ResourcesPage />} />
          <Route path="/precos" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/pessoas" element={<PublicProfileFinderPage />} />
          <Route path="/u/:username" element={<PublicProfilePage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/app" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/app/habitos" element={<RequireAuth><HabitsPage /></RequireAuth>} />
          <Route path="/app/metas" element={<RequireAuth><GoalsPage /></RequireAuth>} />
          <Route path="/app/leituras" element={<RequireAuth><ReadingLibrary /></RequireAuth>} />
          <Route path="/app/amigos" element={<RequireAuth><FriendsPage /></RequireAuth>} />
          <Route path="/app/analises" element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
          <Route path="/app/perfil" element={<RequireAuth><OwnProfileRedirect /></RequireAuth>} />
          <Route path="/app/configuracoes" element={<RequireAuth><AccountSettingsPage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
