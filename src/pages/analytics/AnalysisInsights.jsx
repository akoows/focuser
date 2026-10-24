import { useRef, useEffect, useState } from 'react';
import { focuserApi } from '../../services/focuserApi';
import { Sparkles, RefreshCw } from 'lucide-react';
import { transitionUI } from '../../utils/transitionUI';

export default function AnalysisInsights({ period }) {
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const analyze = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await focuserApi.analyze(period);
      if (active.current) transitionUI(() => setAnalysis(result));
    } catch (requestError) {
      if (active.current) setError(requestError.code === 'AI_NOT_CONFIGURED'
        ? 'A análise por IA ainda não está disponível. Tente novamente mais tarde.' : requestError.message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return <section className="card analysis-insights" aria-labelledby="analysis-insights-title">
    <div className="section-heading"><div className="section-title-icon"><span className="section-icon"><Sparkles size={21} /></span><div><p className="eyebrow">Sua evolução</p><h2 id="analysis-insights-title">Análise por IA</h2></div></div>
      <button className="button button-primary" disabled={busy} onClick={analyze}><RefreshCw size={16} className={busy ? 'ui-spin' : ''} aria-hidden="true" />{busy ? 'Analisando…' : analysis ? 'Atualizar análise' : 'Analisar hábitos'}</button>
    </div>
    <p className="muted-state">Insights sobre seus hábitos nos últimos {period === 'month' ? 30 : 7} dias.</p>
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {busy ? <p role="status" className="ui-loading">Preparando sua análise…</p> : null}
    {!analysis && !busy && !error ? <div className="insight-empty"><Sparkles size={28} /><strong>Transforme constância em próximos passos</strong><p>Gere uma leitura dos seus registros para identificar padrões e ajustar sua rotina.</p></div> : null}
    {analysis ? <div className="analysis-results" aria-busy={busy}><p className="insight-summary">{analysis.summary}</p>
      <h3>Observações</h3><ul>{analysis.insights.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h3>Próximos passos</h3><ul>{analysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <small className="muted-state">Período: {analysis.period.from} a {analysis.period.to}</small>
    </div> : null}
  </section>;
}
