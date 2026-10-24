import { useState } from 'react';
import { focuserApi } from '../../services/focuserApi';
import { APP_ACCENT_PRESETS, getAppAccentColor, getAccentContrast, saveAppAccentColor, saveAppColorPresets } from './appThemeSettings';

export default function AppearanceSettings({ user, onUserUpdated }) {
  const [color, setColor] = useState(() => getAppAccentColor(user?.appAccentColor ?? user?.accentColor));
  const [presets, setPresets] = useState(user?.appColorPresets ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const save = async (mode, presetId) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextPresets = mode === 'remove' ? presets.filter((preset) => preset.id !== presetId)
        : mode === 'preset' ? [...presets, { id: crypto.randomUUID(), name: color.toUpperCase(), color }] : presets;
      const result = mode === 'apply' ? await saveAppAccentColor(focuserApi, color)
        : await saveAppColorPresets(focuserApi, nextPresets);
      onUserUpdated(result.user);
      setPresets(result.user.appColorPresets ?? nextPresets);
      setMessage(mode === 'apply' ? 'Cor de destaque atualizada.' : 'Cores salvas atualizadas.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="card profile-settings account-settings-card" aria-labelledby="appearance-title">
    <div><p className="eyebrow">Aparência</p><h2 id="appearance-title">Cor de destaque do aplicativo</h2><p className="muted-state">Personalize botões, navegação e gráficos em todo o aplicativo.</p></div>
    <div className="appearance-color-presets" role="group" aria-label="Cores prontas para o aplicativo">
      {APP_ACCENT_PRESETS.map((preset) => <button
        type="button"
        className="appearance-color-preset"
        key={preset.value}
        aria-label={preset.label}
        aria-pressed={color.toLowerCase() === preset.value}
        style={{ '--preset-color': preset.value }}
        disabled={busy}
        onClick={() => setColor(preset.value)}
      ><i style={{ background: preset.value }} /><span>{preset.label}</span></button>)}
    </div>
    <label><span>Cor personalizada</span><input type="color" value={color} disabled={busy} onChange={(event) => setColor(event.target.value)} /></label>
    <label><span>Código hexadecimal</span><input value={color} disabled={busy} onChange={(event) => setColor(event.target.value)} maxLength={7} placeholder="#AABBCC" /></label>
    <div className="appearance-preview" style={{ '--preview-accent': getAppAccentColor(color), '--preview-contrast': getAccentContrast(color) }} aria-label="Prévia da cor">Prévia · {color}</div>
    <div className="inline-row appearance-actions">
      <button type="button" className="button button-primary" disabled={busy} onClick={() => save('apply')}>{busy ? 'Salvando…' : 'Aplicar cor'}</button>
      <button type="button" className="button button-secondary" disabled={busy || !/^#[\da-f]{6}$/i.test(color) || presets.length >= 30 || presets.some((preset) => preset.color.toLowerCase() === color.toLowerCase())} onClick={() => save('preset')}>Salvar cor</button>
    </div>
    {presets.length ? <ul className="appearance-presets" aria-label="Cores salvas">{presets.map((preset) => <li key={preset.id}>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => setColor(preset.color)}><i style={{ background: preset.color }} />{preset.name}</button>
      <button type="button" className="text-button" disabled={busy} aria-label={`Remover cor ${preset.name}`} onClick={() => save('remove', preset.id)}>Remover</button>
    </li>)}</ul> : <p className="muted-state">Salve suas cores favoritas para reutilizar.</p>}
    {message ? <p role="status" className="success-text">{message}</p> : null}
    {error ? <p role="alert" className="error-text">{error}</p> : null}
  </section>;
}
