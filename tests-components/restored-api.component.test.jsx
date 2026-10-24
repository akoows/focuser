import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppearanceSettings from '../src/pages/settings/AppearanceSettings.jsx';
import AnalysisInsights from '../src/pages/analytics/AnalysisInsights.jsx';
import FocusHistory from '../src/pages/analytics/FocusHistory.jsx';
import HabitHistoryDrawer from '../src/pages/habits/HabitHistoryDrawer.jsx';
import { focuserApi } from '../src/services/focuserApi.js';

vi.mock('../src/services/focuserApi.js', () => ({
  focuserApi: {
    updateProfile: vi.fn(), analyze: vi.fn(), focusSessions: { list: vi.fn() },
    habits: { history: vi.fn(), progress: vi.fn(), checkIns: vi.fn(), deleteCheckIn: vi.fn() },
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('restored API-backed page controls', () => {
  it('persists a validated theme, custom presets and removal while recovering API errors', async () => {
    const updatedUser = { appAccentColor: '#12AB56', appColorPresets: [] };
    focuserApi.updateProfile.mockImplementation(async (data) => ({ user: { ...updatedUser, ...data } }));
    const onUserUpdated = vi.fn();
    render(<AppearanceSettings user={updatedUser} onUserUpdated={onUserUpdated} />);
    fireEvent.change(screen.getByLabelText('Código hexadecimal'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cor' }));
    await waitFor(() => expect(focuserApi.updateProfile).toHaveBeenCalledWith({ appAccentColor: '#123456' }));
    await waitFor(() => expect(onUserUpdated.mock.calls[0][0].appAccentColor).toBe('#123456'));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar cor' }));
    await waitFor(() => expect(focuserApi.updateProfile.mock.calls.at(-1)[0].appColorPresets[0].color).toBe('#123456'));
    expect(screen.getByRole('status').textContent).toMatch(/Cores salvas/);

    focuserApi.updateProfile.mockRejectedValueOnce(new Error('API indisponível'));
    fireEvent.click(screen.getByRole('button', { name: 'Remover cor #123456' }));
    expect((await screen.findByRole('alert')).textContent).toContain('API indisponível');
    expect(screen.getByRole('button', { name: 'Remover cor #123456' }).disabled).toBe(false);
  });

  it('renders AI metrics, refreshes them and surfaces unavailable provider states', async () => {
    focuserApi.analyze.mockResolvedValueOnce({
      summary: 'Bom ritmo.', insights: ['Consistência crescente.'], recommendations: ['Continue amanhã.'],
      period: { from: '2026-10-18', to: '2026-10-24' },
    });
    render(<AnalysisInsights period="week" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisar hábitos' }));
    expect(await screen.findByText('Bom ritmo.')).toBeTruthy();
    expect(focuserApi.analyze).toHaveBeenCalledWith('week');
    focuserApi.analyze.mockRejectedValueOnce(Object.assign(new Error('AI unavailable'), { code: 'AI_NOT_CONFIGURED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar análise' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/não está disponível/i);
  });

  it('filters and paginates focus sessions and retries failures', async () => {
    focuserApi.focusSessions.list.mockResolvedValueOnce({ items: [{ id: 'f1', title: 'Leitura', elapsedSeconds: 900, plannedMinutes: 30, status: 'COMPLETED', createdAt: '2026-10-24T12:00:00.000Z' }], pagination: { page: 1, totalPages: 2 } });
    focuserApi.focusSessions.list.mockResolvedValueOnce({ items: [], pagination: { page: 1, totalPages: 1 } });
    focuserApi.focusSessions.list.mockRejectedValueOnce(new Error('API caiu'));
    focuserApi.focusSessions.list.mockResolvedValueOnce({ items: [], pagination: { page: 1, totalPages: 1 } });
    render(<FocusHistory />);
    expect(await screen.findByText('Leitura')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(focuserApi.focusSessions.list).toHaveBeenCalledWith({ page: 2, limit: 10 }));
    fireEvent.change(screen.getByLabelText('Filtrar sessões de foco'), { target: { value: 'COMPLETED' } });
    await waitFor(() => expect(focuserApi.focusSessions.list).toHaveBeenCalledWith({ page: 1, limit: 10, status: 'COMPLETED' }));
    expect((await screen.findByRole('alert')).textContent).toContain('API caiu');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(/nenhuma sessão de foco/i)).toBeTruthy();
  });

  it('loads habit progress and logs, then deletes a log and refreshes the dashboard', async () => {
    focuserApi.habits.history.mockResolvedValue({ series: [] });
    focuserApi.habits.progress.mockResolvedValue({ scheduled: 4, completed: 2, completionRate: 0.5, currentStreak: 1, bestStreak: 4 });
    focuserApi.habits.checkIns.mockResolvedValueOnce({ items: [{ id: 'check-1', dateKey: '2026-10-24', occurrence: 1 }], pagination: { totalPages: 1 } })
      .mockResolvedValue({ items: [], pagination: { totalPages: 1 } });
    focuserApi.habits.deleteCheckIn.mockResolvedValue({ deleted: true });
    const opener = document.createElement('button');
    document.body.append(opener);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<HabitHistoryDrawer habit={{ id: 'habit-1', name: 'Leitura', weeklyProgress: [] }} onClose={vi.fn()} fallbackFocus={() => opener} onChanged={onChanged} />);
    expect(await screen.findByText('2/4 dias concluídos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir registro de 2026-10-24' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(focuserApi.habits.deleteCheckIn).toHaveBeenCalledWith('habit-1', 'check-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(await screen.findByText('Nenhum registro neste mês.')).toBeTruthy();
    opener.remove();
  });
});
