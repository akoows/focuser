import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import GoalsPage from '../src/pages/GoalsPage.jsx';
import ReadingPageView from '../src/pages/reading/ReadingPageView.jsx';
import HabitList from '../src/pages/habits/HabitList.jsx';
import { focuserApi } from '../src/services/focuserApi.js';

vi.mock('../src/services/focuserApi.js', () => ({
  focuserApi: {
    me: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    dashboard: vi.fn(),
    habits: { list: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), archive: vi.fn(), reorder: vi.fn(), checkIn: vi.fn(), removeCheckIn: vi.fn() },
    goals: { list: vi.fn(), addProgress: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn() },
    reading: { feed: vi.fn(), listBooks: vi.fn(), today: vi.fn() },
    friends: { list: vi.fn() },
    gym: {
      plans: vi.fn(), activeSession: vi.fn(), sessions: vi.fn(), stats: vi.fn(), calendar: vi.fn(),
      exerciseImages: vi.fn(), createPlan: vi.fn(), updatePlan: vi.fn(), removePlan: vi.fn(),
      startSession: vi.fn(), addExercise: vi.fn(), addSet: vi.fn(), updateSet: vi.fn(),
      completeSession: vi.fn(), abandonSession: vi.fn(), removeHistory: vi.fn(), removeSessionExercise: vi.fn(),
      calendarDay: vi.fn(), session: vi.fn(),
    },
    focusSessions: { list: vi.fn() },
    analyze: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
});

const goal = (currentValue = 3) => ({
  id: 'goal-1', name: 'Ler', description: '', category: 'Pessoal',
  targetValue: 10, currentValue, unit: 'livros', period: 'MONTHLY', isActive: true,
});

const layout = ({ children }) => <main>{children}</main>;
const header = ({ title }) => <h1>{title}</h1>;
const apiState = ({ loading, error, empty, children }) => (
  loading ? <p role="status">Carregando</p>
    : error ? <p role="alert">{error}</p>
      : empty && !children ? <p>{empty}</p> : children
);

describe('mounted critical page flows', () => {
  it('shows anytime habits directly and keeps other time groups collapsible', () => {
    const groups = [
      { value: 'ANYTIME', label: 'Qualquer momento', habits: [{ id: 'h1', name: 'Leitura' }] },
      { value: 'AFTERNOON', label: 'Tarde', habits: [{ id: 'h2', name: 'Água' }] },
    ];
    const view = (openGroups) => render(<HabitList
      groups={groups}
      openGroups={openGroups}
      onToggleGroup={vi.fn()}
      renderHabitCard={(habit) => <article key={habit.id}>{habit.name}</article>}
    />);
    view(new Set());

    expect(screen.getByText('Leitura')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Qualquer momento/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Tarde/ }).getAttribute('aria-expanded')).toBe('false');

    cleanup();
    view(new Set(['AFTERNOON']));
    expect(screen.getByRole('button', { name: /Tarde/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Água')).toBeTruthy();
  });

  it('renders recovered account settings and persists the timezone preference', async () => {
    const user = {
      id: 'user-settings-1', name: 'Pessoa', username: 'pessoa', email: 'pessoa@example.test',
      timezone: 'America/Sao_Paulo', accentColor: '#ffffff', appColorPresets: [],
    };
    focuserApi.me.mockResolvedValue({ user });
    focuserApi.updateProfile.mockImplementation(async (updates) => ({ user: { ...user, ...updates } }));
    window.history.pushState({}, '', '/app/configuracoes');

    render(<App />);
    expect(await screen.findByRole('heading', { name: /configura/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferência' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(focuserApi.updateProfile).toHaveBeenCalledWith({ name: 'Pessoa', timezone: 'America/Sao_Paulo' });
  });

  it('renders the recovered habits route without a missing animation dependency', async () => {
    const user = { id: 'user-habits-1', name: 'Pessoa', username: 'pessoa', email: 'pessoa@example.test', accentColor: '#ffffff' };
    focuserApi.me.mockResolvedValue({ user });
    focuserApi.habits.list.mockResolvedValue({ items: [] });
    focuserApi.dashboard.mockResolvedValue({ habits: [] });
    window.history.pushState({}, '', '/app/habitos');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /H\u00e1bitos/i })).toBeTruthy();
    expect(await screen.findByText(/nenhum h\u00e1bito encontrado/i)).toBeTruthy();
    expect(document.querySelector('.habits-reference-theme')).toBeNull();
  });

  it('renders Academy in the shared app shell and uses the configured app accent', async () => {
    const user = { id: 'user-academy-1', name: 'Pessoa', username: 'pessoa', email: 'pessoa@example.test', accentColor: '#aabbcc', appAccentColor: '#12AB56' };
    focuserApi.me.mockResolvedValue({ user });
    focuserApi.gym.plans.mockResolvedValue({ items: [] });
    focuserApi.gym.activeSession.mockResolvedValue({ session: null });
    focuserApi.gym.sessions.mockResolvedValue({ items: [], pagination: { page: 1, totalPages: 1 } });
    focuserApi.gym.stats.mockResolvedValue({ sessionsTotal: 0, weeklyCount: 0, totalVolume: 0, exerciseStats: [] });
    focuserApi.gym.calendar.mockResolvedValue({ days: [] });
    window.history.pushState({}, '', '/app/academia');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Academia' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegação da aplicação' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegação móvel' })).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#12AB56');
  });

  it('renders the recovered profile editor and saves its public profile fields', async () => {
    const user = {
      id: 'user-profile-1', name: 'Pessoa', username: 'pessoa', email: 'pessoa@example.test',
      bio: '', currentBookId: null, favoriteBookId: null, timezone: 'America/Sao_Paulo', accentColor: '#ffffff',
    };
    focuserApi.me.mockResolvedValue({ user });
    focuserApi.reading.listBooks.mockResolvedValue({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    focuserApi.updateProfile.mockImplementation(async (updates) => ({ user: { ...user, ...updates } }));
    window.history.pushState({}, '', '/app/perfil');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Seu perfil' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Pessoa Atualizada  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(focuserApi.updateProfile).toHaveBeenCalledWith({
      name: 'Pessoa Atualizada', username: 'pessoa', bio: null, currentBookId: null, favoriteBookId: null,
    });
  });

  it('loads more friends and retries a failed community page', async () => {
    const user = { id: 'user-friends-1', name: 'Pessoa', username: 'pessoa', email: 'pessoa@example.test', accentColor: '#ffffff' };
    const firstPage = {
      friends: [{ id: 'friend-1', friendshipId: 'ship-1', username: 'ana', name: 'Ana' }],
      incomingRequests: [{ id: 'person-2', requestId: 'request-1', username: 'bia', name: 'Bia' }],
      outgoingRequests: [],
      pagination: { hasMore: true, nextCursor: 'cursor-2' },
    };
    const secondPage = {
      friends: [{ id: 'friend-3', friendshipId: 'ship-3', username: 'caio', name: 'Caio' }],
      incomingRequests: [],
      outgoingRequests: [{ id: 'person-4', requestId: 'request-2', username: 'duda', name: 'Duda' }],
      pagination: { hasMore: false, nextCursor: null },
    };
    focuserApi.me.mockResolvedValue({ user });
    focuserApi.friends.list
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error('Rede indisponível'))
      .mockResolvedValueOnce(secondPage);
    window.history.pushState({}, '', '/app/amigos');

    render(<App />);

    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(screen.getByText('Bia')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Rede indisponível');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Caio')).toBeTruthy();
    expect(screen.getByText('Duda')).toBeTruthy();
    expect(focuserApi.friends.list).toHaveBeenNthCalledWith(2, { limit: 20, cursor: 'cursor-2' });
    expect(focuserApi.friends.list).toHaveBeenNthCalledWith(3, { limit: 20, cursor: 'cursor-2' });
  });

  it('recovers a conflicting goal update by reloading and showing current progress', async () => {
    focuserApi.goals.list
      .mockResolvedValueOnce({ items: [goal(3)] })
      .mockResolvedValueOnce({ items: [goal(4)] });
    focuserApi.goals.addProgress.mockRejectedValue(Object.assign(new Error('Conflito'), { code: 'GOAL_CHANGED' }));

    render(<GoalsPage AppLayout={layout} PageHeader={header} ApiState={apiState} />);
    await screen.findByText('3 / 10');
    fireEvent.click(screen.getByRole('button', { name: '+1 progresso' }));

    expect(await screen.findByText('4 / 10')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toMatch(/A meta mudou enquanto o progresso/);
    expect(focuserApi.goals.list).toHaveBeenCalledTimes(2);
  });

  it('keeps ordinary update errors visible and does not misreport them as conflicts', async () => {
    focuserApi.goals.list.mockResolvedValue({ items: [goal()] });
    focuserApi.goals.addProgress.mockRejectedValue(Object.assign(new Error('Servidor indisponível'), { code: 'INTERNAL_ERROR' }));

    render(<GoalsPage AppLayout={layout} PageHeader={header} ApiState={apiState} />);
    await screen.findByText('3 / 10');
    fireEvent.click(screen.getByRole('button', { name: '+1 progresso' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Servidor indisponível');
    expect(focuserApi.goals.list).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 / 10')).toBeTruthy();
  });

  it('loads the next reading feed cursor and appends entries until the last page', async () => {
    const entry = (id, title) => ({
      id,
      user: { id: 'friend-1', username: 'reader', name: 'Leitor', avatarUrl: null },
      book: { title, author: 'Autor' },
      loggedAt: '2026-10-24T12:00:00.000Z',
      pagesRead: 4,
      minutesRead: 10,
    });
    focuserApi.reading.feed
      .mockResolvedValueOnce({ items: [entry('read-1', 'Livro inicial')], pagination: { limit: 20, hasMore: true, nextCursor: 'cursor-next' } })
      .mockResolvedValueOnce({ items: [entry('read-2', 'Livro seguinte')], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    focuserApi.reading.listBooks.mockResolvedValue({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    focuserApi.reading.today.mockResolvedValue({ totalPages: 0, totalMinutes: 0 });

    render(<MemoryRouter><ReadingPageView
      confirm={() => true} user={null} AppLayout={layout} PageHeader={header} ApiState={apiState}
      MetricCard={() => null} formatReadingDuration={() => '10 min'} createFocusStatusSessionId={() => 'session'}
      READING_BOOK_PAGE_SIZE={20} NumberInput={() => <input />} ReadingBookCover={() => null}
    /></MemoryRouter>);

    expect(await screen.findByText('Livro inicial')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais leituras' }));
    expect(await screen.findByText('Livro seguinte')).toBeTruthy();
    expect(focuserApi.reading.feed).toHaveBeenNthCalledWith(2, { limit: 20, cursor: 'cursor-next' });
    expect(screen.queryByRole('button', { name: 'Carregar mais leituras' })).toBeNull();
  });

  it('does not start reading requests when the extracted reading view is unmounted', async () => {
    focuserApi.reading.listBooks.mockResolvedValue({ items: [], pagination: { page: 1, totalPages: 1 } });
    focuserApi.reading.today.mockResolvedValue({});
    const reading = render(<ReadingPageView
      confirm={() => true} user={null} AppLayout={layout} PageHeader={header} ApiState={apiState}
      MetricCard={() => null} formatReadingDuration={() => ''} createFocusStatusSessionId={() => 'session'}
      READING_BOOK_PAGE_SIZE={20} NumberInput={() => <input />} ReadingBookCover={() => null}
    />);
    reading.unmount();

    await Promise.resolve();

    expect(focuserApi.reading.feed).not.toHaveBeenCalled();
  });
});
