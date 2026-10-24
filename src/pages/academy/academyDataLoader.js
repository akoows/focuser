const ACADEMY_LOADERS = [
  ['plans', 'plans'],
  ['activeSession', 'activeSession'],
  ['history', 'sessions'],
  ['stats', 'stats'],
  ['calendar', 'calendar'],
];

export function workoutSessionStorageKey(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId is required.');
  return `focuser:gym-rest-timer:${sessionId}`;
}

export function readWorkoutTimer(storageProvider, sessionId) {
  try {
    const storage = typeof storageProvider === 'function' ? storageProvider() : storageProvider;
    const stored = storage.getItem(workoutSessionStorageKey(sessionId));
    if (stored === null) return { timer: null, error: null };
    const timer = JSON.parse(stored);
    const validTimer = timer && typeof timer === 'object'
      && (timer.endsAt == null || (Number.isFinite(timer.endsAt) && timer.endsAt >= 0))
      && (timer.remaining == null || (Number.isFinite(timer.remaining) && timer.remaining >= 0))
      && (timer.duration == null || (Number.isFinite(timer.duration) && timer.duration >= 0))
      && (timer.paused == null || typeof timer.paused === 'boolean');
    if (!validTimer) throw new TypeError('Invalid saved timer data.');
    return { timer, error: null };
  } catch {
    return { timer: null, error: 'O cronômetro salvo não pôde ser recuperado; o treino ativo continua disponível.' };
  }
}

export async function loadAcademySections(api, page = 1) {
  if (!api?.gym || ACADEMY_LOADERS.some(([, method]) => typeof api.gym[method] !== 'function')) {
    throw new TypeError('Academy API is missing required section loaders.');
  }
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer.');

  const requests = [
    api.gym.plans(),
    api.gym.activeSession(),
    api.gym.sessions({ page: String(page), limit: '20' }),
    api.gym.stats(),
    api.gym.calendar(),
  ];
  const settled = await Promise.allSettled(requests);
  const values = {};
  const errors = {};
  for (let index = 0; index < ACADEMY_LOADERS.length; index += 1) {
    const [section] = ACADEMY_LOADERS[index];
    const result = settled[index];
    if (result.status === 'fulfilled') values[section] = result.value;
    else errors[section] = result.reason?.message || 'Não foi possível carregar esta seção.';
  }
  return { values, errors };
}
