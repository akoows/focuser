import { BookOpen, Brain, Code2, Coffee, Dumbbell, Droplet, Heart, Leaf, Moon, Music, Sparkles, Target } from "lucide-react";

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const HABIT_ICON_OPTIONS = [
  { value: 'TARGET', label: 'Meta', icon: Target },
  { value: 'BOOK', label: 'Leitura', icon: BookOpen },
  { value: 'DUMBBELL', label: 'Exercício', icon: Dumbbell },
  { value: 'DROPLET', label: 'Água', icon: Droplet },
  { value: 'BRAIN', label: 'Aprendizado', icon: Brain },
  { value: 'MOON', label: 'Sono', icon: Moon },
  { value: 'HEART', label: 'Saúde', icon: Heart },
  { value: 'LEAF', label: 'Bem-estar', icon: Leaf },
  { value: 'MUSIC', label: 'Música', icon: Music },
  { value: 'CODE', label: 'Criatividade', icon: Code2 },
  { value: 'COFFEE', label: 'Rotina', icon: Coffee },
  { value: 'SPARKLES', label: 'Outro', icon: Sparkles },
];
export const HABIT_ICONS = Object.fromEntries(HABIT_ICON_OPTIONS.map(({ value, icon }) => [value, icon]));
export const HABIT_CATEGORIES = ['Saúde', 'Estudos', 'Produtividade', 'Bem-estar', 'Pessoal', 'Finanças', 'Lazer', 'Outro'];
export const HABIT_UNIT_OPTIONS = [
  { value: '', label: 'Contagem simples', max: 20, step: 1, plural: 'conclusões' },
  { value: 'REPS', label: 'Repetições', max: 100, step: 1, plural: 'repetições' },
  { value: 'ML', label: 'Mililitros (ml)', max: 10000, step: 250, plural: 'ml' },
  { value: 'MIN', label: 'Minutos', max: 1440, step: 1, plural: 'min' },
  { value: 'PAGES', label: 'Páginas', max: 5000, step: 1, plural: 'páginas' },
  { value: 'SESSIONS', label: 'Sessões', max: 50, step: 1, plural: 'sessões' },
];
export const HABIT_TIME_OPTIONS = [
  { value: 'ANYTIME', label: 'Qualquer momento' },
  { value: 'MORNING', label: 'Manhã' },
  { value: 'AFTERNOON', label: 'Tarde' },
  { value: 'EVENING', label: 'Noite' },
];
export function getHabitUnit(unit) {
  return HABIT_UNIT_OPTIONS.find((option) => option.value === unit) || HABIT_UNIT_OPTIONS[0];
}

export function getHabitFrequencyLabel(frequency, daysOfWeek = []) {
  if (frequency === 'DAILY' || daysOfWeek.length === 7) return 'Todos os dias';
  return daysOfWeek.length ? daysOfWeek.map((day) => WEEKDAY_NAMES[day]).join(', ') : 'Selecione os dias';
}

export function formatFrequency(habit) {
  if (habit.frequency === 'DAILY') return 'Todos os dias';
  return (habit.daysOfWeek || []).map((day) => WEEKDAY_NAMES[day]).join(', ');
}

