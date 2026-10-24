import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkPlus, CheckCheck, Clock3, MoreHorizontal, X } from "lucide-react";
import NumberInput from "../../components/NumberInput";
import { HabitIcon } from "./HabitComponents";
import { HABIT_CATEGORIES, HABIT_ICON_OPTIONS, HABIT_TIME_OPTIONS, HABIT_UNIT_OPTIONS, WEEKDAY_NAMES, WEEKDAY_SHORT_NAMES, getHabitFrequencyLabel, getHabitUnit } from "./habitConfig";
import { createHabitFormState, normalizeHabitHexColor } from "./habitFormModel";

export default function HabitFormModal({ dialogRef, editingHabit, accentColor, habitNameInputRef, isBusy, isSaving, error, savedColorPresets, onSaveColorPreset, onDeleteColorPreset, onClose, onSubmit }) {
  const [form, setForm] = useState(() => createHabitFormState(editingHabit, accentColor));
  const colorPickerInputRef = useRef(null);
  const [hexDraft, setHexDraft] = useState(() => form.color.toUpperCase());
  const previewHabitName = form.name.trim() || 'Nome do hábito';
  const unitSettings = getHabitUnit(form.unit);
  return createPortal(

        <div
          className="app-dialog-backdrop habit-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isBusy) onClose();
          }}
        >
        <form ref={dialogRef} className="card habit-form habit-form-modal" style={{ '--habit-color': form.color }} onSubmit={(event) => onSubmit(event, { ...form, color: colorPickerInputRef.current?.value || form.color })} role="dialog" aria-modal="true" aria-labelledby="habit-form-title">
          <div className="habit-form-heading">
            <div className={`habit-icon habit-icon-${form.icon}`}><HabitIcon name={form.icon} size={21} /></div>
            <div><h3 id="habit-form-title">{editingHabit ? 'Editar hábito' : 'Novo hábito'}</h3><p className="muted-state">Personalize o nome, o ícone e a frequência da sua rotina.</p></div>
            <button type="button" className="habit-category-filter-close" aria-label="Fechar formulário de hábito" disabled={isBusy} onClick={onClose}><X size={18} /></button>
          </div>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <section className="habit-form-preview" aria-label="Prévia do hábito">
            <span className="habit-form-preview-label">Prévia do card</span>
            <article className="habit-card card habit-form-preview-card" style={{ '--habit-color': form.color }}>
              <div className="habit-card-heading">
                <div className="habit-card-icon-wrap">
                  <div key={form.icon} className={`habit-icon habit-icon-${form.icon} habit-form-preview-icon`}><HabitIcon name={form.icon} size={21} /></div>
                </div>
                <div className="habit-card-copy">
                  <span className="habit-card-title habit-form-preview-title" aria-label={previewHabitName}>
                    {Array.from(previewHabitName, (character, index) => (
                      <span
                        key={`${index}-${character}`}
                        aria-hidden="true"
                        style={{ animationDelay: `${Math.min(index * 22, 220)}ms` }}
                      >
                        {character}
                      </span>
                    ))}
                  </span>
                </div>
                <span className="habit-form-preview-menu" aria-hidden="true"><MoreHorizontal size={20} /></span>
              </div>
              <ol className="habit-week-grid habit-form-preview-week" aria-hidden="true">
                {WEEKDAY_SHORT_NAMES.map((day, index) => {
                  const isScheduled = form.frequency === 'DAILY' || form.daysOfWeek.includes(index);
                  const previewProgress = [100, 82, 64, 46, 28, 12, 0][index];
                  const stateClass = !isScheduled
                    ? 'is-off'
                    : previewProgress === 100
                      ? 'is-completed'
                      : previewProgress > 0
                        ? 'is-partial'
                        : 'is-pending';
                  return (
                    <li
                      className={`habit-week-day ${stateClass}`}
                      key={day}
                      style={{ '--habit-day-progress': `${isScheduled ? previewProgress : 0}%` }}
                    >
                      <span className="habit-week-day-name">{day}</span>
                      <span className="habit-week-marker" />
                    </li>
                  );
                })}
              </ol>
              <div className="habit-card-meta habit-card-meta-compact">
                <span className="habit-status-pill is-active">Ativo</span>
                <span className="habit-frequency"><Clock3 size={13} />{getHabitFrequencyLabel(form.frequency, form.daysOfWeek)}</span>
              </div>
              <div className="habit-card-footer">
                <button type="button" className="button habit-checkin-button" disabled>
                  <CheckCheck size={16} />
                  {form.dailyTarget > 1 ? `Registrar ${form.step} de ${form.dailyTarget} ${unitSettings.plural}` : 'Marcar como feito'}
                </button>
              </div>
            </article>
          </section>
          <label>
            <span>Nome</span>
            <input ref={habitNameInputRef} type="text" maxLength="100" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Leitura diária" />
          </label>
          <label>
            <span>Descrição (opcional)</span>
            <textarea maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Um detalhe para ajudar a identificar a rotina" />
          </label>
          <label>
            <span>Categoria</span>
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              <option value="">Automática</option>
              {HABIT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>
            <span>Unidade de medida</span>
            <select value={form.unit} onChange={(event) => {
              const nextUnit = event.target.value;
              const nextSettings = getHabitUnit(nextUnit);
              const target = Math.max(nextSettings.step, Math.min(nextSettings.max, Math.ceil(form.dailyTarget / nextSettings.step) * nextSettings.step));
              setForm({ ...form, unit: nextUnit, dailyTarget: target, step: nextSettings.step });
            }}>
              {HABIT_UNIT_OPTIONS.map(({ value, label }) => <option key={value || 'count'} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Meta diária ({unitSettings.plural})</span>
            <NumberInput aria-label="meta diária" min={unitSettings.step} max={unitSettings.max} step={unitSettings.step} required value={form.dailyTarget} onValueChange={(value) => {
              const dailyTarget = Math.max(unitSettings.step, Math.min(unitSettings.max, Number(value) || unitSettings.step));
              setForm({ ...form, dailyTarget, step: Math.min(form.step, dailyTarget) });
            }} />
            <small className="muted-state">Até {unitSettings.max.toLocaleString('pt-BR')} {unitSettings.plural} por dia.</small>
          </label>
          <label>
            <span>Incremento por check-in ({unitSettings.plural})</span>
            <NumberInput aria-label="incremento por check-in" min={unitSettings.step} max={form.dailyTarget} step={unitSettings.step} required value={form.step} onValueChange={(value) => setForm({ ...form, step: Math.max(unitSettings.step, Math.min(form.dailyTarget, Number(value) || unitSettings.step)) })} />
          </label>
          <label>
            <span>Período do dia</span>
            <select value={form.timeOfDay} onChange={(event) => setForm({ ...form, timeOfDay: event.target.value })}>
              {HABIT_TIME_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <fieldset className="habit-color-picker">
            <legend>Cor do hábito</legend>
            <div className="habit-color-picker-current">
              <label className="habit-custom-color-control">
                <input
                  ref={colorPickerInputRef}
                  type="color"
                  aria-label="Escolher cor personalizada"
                  defaultValue={form.color}
                  onBlur={(event) => {
                    const color = normalizeHabitHexColor(event.target.value) || form.color;
                    event.target.value = color;
                    setHexDraft(color);
                    setForm((current) => ({ ...current, color }));
                  }}
                />
                <span className="habit-custom-color-swatch" style={{ '--habit-swatch': form.color }}><span aria-hidden="true" /></span>
                <span className="habit-custom-color-copy"><strong>Personalizar</strong><small>Escolha qualquer tom</small></span>
              </label>
              <label className="habit-color-hex-input">
                <span>HEX</span>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  aria-label="Código hexadecimal da cor"
                  maxLength={7}
                  placeholder="#AABBCC"
                  value={hexDraft}
                  onChange={(event) => {
                    const value = event.target.value.trim().toUpperCase();
                    setHexDraft(value);
                    const color = normalizeHabitHexColor(value);
                    if (color) {
                      if (colorPickerInputRef.current) colorPickerInputRef.current.value = color;
                      setForm((current) => ({ ...current, color }));
                    }
                  }}
                  onBlur={() => {
                    const color = normalizeHabitHexColor(hexDraft) || form.color;
                    setHexDraft(color);
                    if (colorPickerInputRef.current) colorPickerInputRef.current.value = color;
                  }}
                />
              </label>
            </div>
            <div className="habit-color-options" aria-label="Cores salvas">
              {savedColorPresets.map((preset) => (
                <span className="habit-saved-color" key={preset.id}>
                  <button type="button" className={`habit-color-option${form.color === preset.color ? ' selected' : ''}`} style={{ '--habit-swatch': preset.color }} aria-label={`Usar cor ${preset.color}`} aria-pressed={form.color === preset.color} title={preset.color} onClick={() => {
                    if (colorPickerInputRef.current) colorPickerInputRef.current.value = preset.color;
                    setHexDraft(preset.color.toUpperCase());
                    setForm({ ...form, color: preset.color });
                  }} />
                  <button type="button" className="habit-saved-color-delete" aria-label={`Excluir cor ${preset.color}`} title={`Excluir ${preset.color}`} onClick={() => onDeleteColorPreset(preset.id)}><X size={11} /></button>
                </span>
              ))}
            </div>
            <button type="button" className="habit-color-save-button" aria-label="Salvar esta cor" title="Salvar esta cor" onClick={() => onSaveColorPreset(colorPickerInputRef.current?.value || form.color)}>
              <BookmarkPlus size={15} /> Salvar cor
            </button>
          </fieldset>
          <fieldset className="habit-icon-picker">
            <legend>Ícone do hábito</legend>
            <div className="habit-icon-options">
              {HABIT_ICON_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`habit-icon-option${form.icon === value ? ' selected' : ''}`}
                  aria-label={label}
                  aria-pressed={form.icon === value}
                  title={label}
                  onClick={() => setForm({ ...form, icon: value })}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
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
            <button type="button" className="button button-secondary" disabled={isBusy} onClick={onClose}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={isSaving || (form.frequency === 'CUSTOM' && form.daysOfWeek.length === 0)}>{isSaving ? 'Salvando…' : editingHabit ? 'Salvar alterações' : 'Criar hábito'}</button>
          </div>
        </form>
        </div>,
        document.body
  );
}
