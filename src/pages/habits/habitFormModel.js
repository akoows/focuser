import { HABIT_ICONS } from './habitConfig.js';

export function normalizeHabitHexColor(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^#/, '');
  return /^[\da-f]{6}$/i.test(normalized) ? `#${normalized.toUpperCase()}` : null;
}

export function createHabitFormState(habit = null, accentColor = '#ffffff') {
  const defaultColor = normalizeHabitHexColor(accentColor) || '#FFFFFF';
  if (!habit) {
    return {
      name: '', description: '', category: '', icon: 'TARGET', dailyTarget: 1,
      step: 1, unit: '', timeOfDay: 'ANYTIME', color: defaultColor, frequency: 'DAILY', daysOfWeek: [],
    };
  }
  return {
    name: habit.name || '',
    description: habit.description || '',
    category: habit.category || '',
    icon: HABIT_ICONS[habit.icon] ? habit.icon : 'TARGET',
    dailyTarget: habit.dailyTarget ?? 1,
    step: habit.step ?? 1,
    unit: habit.unit || '',
    timeOfDay: habit.timeOfDay || 'ANYTIME',
    color: habit.color || defaultColor,
    frequency: habit.frequency || 'DAILY',
    daysOfWeek: habit.frequency === 'CUSTOM' ? [...(habit.daysOfWeek || [])] : [],
  };
}

export function buildHabitPayload(form, isEditing = false) {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    icon: form.icon,
    dailyTarget: form.dailyTarget,
    step: form.step,
    color: form.color,
    timeOfDay: form.timeOfDay,
    frequency: form.frequency,
    ...(description ? { description } : isEditing ? { description: null } : {}),
    ...(form.category ? { category: form.category } : {}),
    ...(form.unit ? { unit: form.unit } : isEditing ? { unit: null } : {}),
    ...(form.frequency === 'CUSTOM' ? { daysOfWeek: [...form.daysOfWeek] } : {}),
  };
}
