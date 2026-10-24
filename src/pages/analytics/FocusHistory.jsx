import { useEffect, useState } from 'react';
import { focuserApi } from '../../services/focuserApi';
import { Clock3 } from 'lucide-react';

const statuses = { RUNNING: 'Em andamento', PAUSED: 'Pausada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };

export default function FocusHistory() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    focuserApi.focusSessions.list({ page, limit: 10, ...(status ? { status } : {}) })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, status, retry]);
  const loadPage = (nextPage) => { setBusy(true); setError(''); setPage(nextPage); };
  return <section className="card focus-history" aria-labelledby="focus-history-title">
    <div className="section-heading"><div className="section-title-icon"><span className="section-icon"><Clock3 size={21} /></span><div><p className="eyebrow">Tempo bem investido</p><h2 id="focus-history-title">Histórico de foco</h2></div></div>
      <label><span className="sr-only">Filtrar sessões de foco</span><select aria-label="Filtrar sessões de foco" value={status} onChange={(event) => { setBusy(true); setError(''); setStatus(event.target.value); setPage(1); }}>
        <option value="">Todas as sessões</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    {busy ? <p role="status" className="ui-loading">Carregando sessões…</p> : error ? <div role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => { setBusy(true); setError(''); setRetry((value) => value + 1); }}>Tentar novamente</button></div>
      : result?.items.length ? <ul key={`${status}-${page}-${retry}`} className="focus-history-list">{result.items.map((session) => <li key={session.id}>
        <div><strong>{session.title || 'Sessão de foco'}</strong><small>{new Date(session.createdAt).toLocaleString('pt-BR')}</small></div>
        <div className="focus-session-result"><strong>{Math.floor(session.elapsedSeconds / 60)} <small>min / {session.plannedMinutes} min</small></strong><span className="summary-pill" data-status={session.status}>{statuses[session.status]}</span></div>
      </li>)}</ul> : <p className="muted-state">Nenhuma sessão de foco neste filtro.</p>}
    <div className="inline-row history-pagination"><button className="button button-secondary" disabled={busy || page === 1} onClick={() => loadPage(page - 1)}>Anterior</button>
      <span>Página {page} de {Math.max(1, result?.pagination.totalPages ?? 1)}</span>
      <button className="button button-secondary" disabled={busy || !result || page >= result.pagination.totalPages} onClick={() => loadPage(page + 1)}>Próxima</button></div>
  </section>;
}
