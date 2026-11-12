import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { focuserApi } from '../services/focuserApi';
import { recoverGoalConflict } from './goals/goalConflictRecovery';

export default function GoalsPage({ AppLayout, PageHeader, ApiState }) {
  const [goals, setGoals] = useState([]);
  const [filter, setFilter] = useState('active');
  const [form, setForm] = useState({ name: '', description: '', category: '', targetValue: '', currentValue: '0', unit: '', period: 'MONTHLY' });
  const [editingGoal, setEditingGoal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const loadGoals = useCallback(async ({ showLoading = true } = {}) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const response = await focuserApi.goals.list({ status: filter, limit: '100' });
      if (requestId === requestIdRef.current) setGoals(response.items);
      return requestId === requestIdRef.current;
    } catch (requestError) {
      if (requestId === requestIdRef.current) setError(requestError.message);
      return false;
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;
    focuserApi.goals.list({ status: filter, limit: '100' })
      .then((response) => {
        if (active && requestId === requestIdRef.current) setGoals(response.items);
      })
      .catch((requestError) => {
        if (active && requestId === requestIdRef.current) setError(requestError.message);
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) setIsLoading(false);
      });
    return () => {
      active = false;
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
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
      if (!await recoverGoalConflict(requestError, loadGoals, setError, 'A meta mudou em outra atualização. Atualizei a lista; confira os valores atuais antes de tentar novamente.')) setError(requestError.message);
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
      if (!await recoverGoalConflict(requestError, loadGoals, setError, 'A meta mudou enquanto o progresso era atualizado. A lista foi recarregada; confira o progresso atual.')) setError(requestError.message);
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
      if (!await recoverGoalConflict(requestError, loadGoals, setError, 'A meta mudou em outra atualização. Atualizei a lista; confira o estado atual antes de tentar novamente.')) setError(requestError.message);
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
      <ApiState loading={isLoading} error={error && !showForm && goals.length === 0 ? error : ''} empty={goals.length === 0 ? 'Nenhuma meta nesta categoria. Crie uma meta para acompanhar seu progresso.' : null}>
        {error && !showForm && goals.length > 0 ? <p className="error-text" role="alert">{error}</p> : null}
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
