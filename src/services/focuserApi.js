const pageHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
const configuredApiUrl = import.meta.env?.VITE_API_URL || `http://${pageHostname}:3000/api`;
const apiUrl = new URL(configuredApiUrl);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
if (typeof window !== 'undefined' && !loopbackHosts.has(pageHostname) && loopbackHosts.has(apiUrl.hostname)) {
  apiUrl.hostname = pageHostname;
}
const API_BASE_URL = apiUrl.toString().replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10000;

async function request(endpoint, { method = 'GET', body, credentials = 'include', timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (isWrite) headers['X-Focuser-Client'] = 'web';

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(API_BASE_URL + endpoint, {
      method,
      credentials,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const responseText = await response.text();
    let payload;

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      const parseError = new Error('A API retornou uma resposta inválida (HTTP ' + response.status + ').');
      parseError.status = response.status;
      throw parseError;
    }

    if (!response.ok) {
      const error = payload?.error;
      const message = error?.message || 'Request failed (HTTP ' + response.status + ').';
      const apiError = new Error(message);
      apiError.code = error?.code;
      apiError.status = response.status;
      apiError.details = error?.details;
      throw apiError;
    }

    return payload.data ?? payload;
  } catch (error) {
    if (timedOut || error.name === 'AbortError') {
      const timeoutError = new Error(isWrite
        ? 'A requisição expirou. O resultado pode ter sido salvo; atualize os dados antes de tentar novamente.'
        : 'A API não respondeu em ' + Math.ceil(timeoutMs / 1000) + ' segundos. Verifique se ela está ativa e se o endereço configurado está correto.');
      timeoutError.code = isWrite ? 'REQUEST_OUTCOME_UNKNOWN' : 'API_TIMEOUT';
      timeoutError.status = null;
      timeoutError.outcomeUnknown = isWrite;
      throw timeoutError;
    }
    if (error.status !== undefined) throw error;

    const networkError = new Error(isWrite
      ? 'Não foi possível confirmar a alteração. O resultado pode ter sido salvo; atualize os dados antes de tentar novamente.'
      : 'Não foi possível conectar à API em ' + API_BASE_URL + '. Verifique se ela está ativa e acessível pela rede.');
    networkError.code = isWrite ? 'REQUEST_OUTCOME_UNKNOWN' : 'API_UNREACHABLE';
    networkError.status = null;
    networkError.outcomeUnknown = isWrite;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const focuserApi = {
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  registrationImageSignature: (type) => request(`/auth/registration-${type}-signature`, { method: 'POST' }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  verifyEmail: (data) => request('/auth/verify-email', { method: 'POST', body: data }),
  resendEmailVerification: (data) => request('/auth/resend-verification', { method: 'POST', body: data }),
  verifyLogin: (data) => request('/auth/verify-login', { method: 'POST', body: data }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (data) => request('/users/me', { method: 'PATCH', body: data }),
  avatarUploadSignature: () => request('/users/me/avatar-signature', { method: 'POST' }),
  bannerUploadSignature: () => request('/users/me/banner-signature', { method: 'POST' }),
  startPasswordChange: (data) => request('/users/me/password-change', { method: 'POST', body: data }),
  verifyPasswordChange: (data) => request('/users/me/password-change/verify', { method: 'POST', body: data }),
  publicProfile: (username) => request(`/users/by-username/${encodeURIComponent(username)}`),
  friends: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/friends${query ? `?${query}` : ''}`);
    },
    status: (username) => request(`/friends/status/${encodeURIComponent(username)}`),
    sendRequest: (username) => request('/friends/requests', { method: 'POST', body: { username } }),
    acceptRequest: (id) => request(`/friends/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
    removeRequest: (id) => request(`/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    removeFriend: (id) => request(`/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  dashboard: (date) => request(date ? `/dashboard?date=${encodeURIComponent(date)}` : '/dashboard'),
  checkInsToday: () => request('/check-ins/today'),
  analyze: (period = 'week') => request('/ai/analyze', { method: 'POST', body: { period }, timeoutMs: 130_000 }),
  progress: (period = 'week') => request(`/progress?period=${period}`),
  history: (periodOrRange = 'week') => {
    const query = typeof periodOrRange === 'string'
      ? new URLSearchParams({ period: periodOrRange }).toString()
      : new URLSearchParams(periodOrRange).toString();
    return request(`/progress/history?${query}`);
  },
  goals: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/goals${query ? `?${query}` : ''}`);
    },
    create: (data) => request('/goals', { method: 'POST', body: data }),
    update: (id, data) => request(`/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    addProgress: (id, amount = 1) => request(`/goals/${encodeURIComponent(id)}/progress`, { method: 'POST', body: { amount } }),
    remove: (id) => request(`/goals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  focusSessions: {
    active: () => request('/focus-sessions/active'),
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/focus-sessions${query ? `?${query}` : ''}`);
    },
    create: (data = {}) => request('/focus-sessions', { method: 'POST', body: data }),
    pause: (id) => request(`/focus-sessions/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
    resume: (id) => request(`/focus-sessions/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
    complete: (id) => request(`/focus-sessions/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
    cancel: (id) => request(`/focus-sessions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  },
  reading: {
    today: () => request('/reading/today'),
    feed: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reading/feed${query ? `?${query}` : ''}`);
    },
    setFocusStatus: (data) => request('/users/me/reading-focus', { method: 'PUT', body: data }),
    clearFocusStatus: (sessionId) => request('/users/me/reading-focus', { method: 'DELETE', body: { sessionId } }),
    lookupIsbn: (data) => request('/reading/isbn-lookup', { method: 'POST', body: data, timeoutMs: 30_000 }),
    listBooks: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reading/books${query ? `?${query}` : ''}`);
    },
    createBook: (data) => request('/reading/books', { method: 'POST', body: data }),
    updateBook: (id, data) => request(`/reading/books/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    logSession: (id, data) => request(`/reading/books/${encodeURIComponent(id)}/logs`, { method: 'POST', body: data }),
    removeBook: (id) => request(`/reading/books/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  diary: {
    today: () => request('/diary/today'),
    saveToday: (data) => request('/diary/today', { method: 'PUT', body: data }),
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/diary${query ? `?${query}` : ''}`);
    },
    calendar: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/diary/calendar${query ? `?${query}` : ''}`);
    },
    entry: (date) => request(`/diary/${encodeURIComponent(date)}`),
  },
  habits: {
    get: (id) => request(`/habits/${encodeURIComponent(id)}`),
    reorder: (orderedIds) => request('/habits/reorder', { method: 'PATCH', body: { orderedIds } }),
    history: (id, params) => request(`/habits/${encodeURIComponent(id)}/history?${new URLSearchParams(params)}`),
    progress: (id, params = { period: 'week' }) => request(`/habits/${encodeURIComponent(id)}/progress?${new URLSearchParams(params)}`),
    checkIns: (id, params = {}) => request(`/habits/${encodeURIComponent(id)}/check-ins?${new URLSearchParams(params)}`),
    removeCheckIn: (id, data) => request(`/habits/${encodeURIComponent(id)}/check-ins`, { method: 'PATCH', body: data }),
    deleteCheckIn: (id, checkInId) => request(`/habits/${encodeURIComponent(id)}/check-ins/${encodeURIComponent(checkInId)}`, { method: 'DELETE' }),
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/habits${query ? `?${query}` : ''}`);
    },
    create: (data) => request('/habits', { method: 'POST', body: data }),
    update: (id, data) => request(`/habits/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    archive: (id, archived = true) => request(`/habits/${encodeURIComponent(id)}/archive`, { method: 'PATCH', body: { archived } }),
    remove: (id) => request(`/habits/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    checkIn: (id, data = {}) => request(`/habits/${encodeURIComponent(id)}/check-ins`, { method: 'POST', body: data }),
  },
  gym: {
    exerciseImages: (names) => request('/gym/exercise-images', { method: 'POST', body: { names } }),
    plans: () => request('/gym/plans'),
    createPlan: (data) => request('/gym/plans', { method: 'POST', body: data }),
    updatePlan: (id, data) => request(`/gym/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    removePlan: (id) => request(`/gym/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    activeSession: () => request('/gym/sessions/active'),
    startSession: (data = {}) => request('/gym/sessions', { method: 'POST', body: data }),
    addExercise: (sessionId, data) => request(`/gym/sessions/${encodeURIComponent(sessionId)}/exercises`, { method: 'POST', body: data }),
    addSet: (sessionId, exerciseId) => request(`/gym/sessions/${encodeURIComponent(sessionId)}/exercises/${encodeURIComponent(exerciseId)}/sets`, { method: 'POST', body: {} }),
    updateSet: (sessionId, exerciseId, setId, data) => request(`/gym/sessions/${encodeURIComponent(sessionId)}/exercises/${encodeURIComponent(exerciseId)}/sets/${encodeURIComponent(setId)}`, { method: 'PATCH', body: data }),
    completeSession: (id) => request(`/gym/sessions/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} }),
    abandonSession: (id) => request(`/gym/sessions/${encodeURIComponent(id)}/abandon`, { method: 'POST', body: {} }),
    sessions: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/gym/sessions${query ? `?${query}` : ''}`);
    },
    session: (id) => request(`/gym/sessions/${encodeURIComponent(id)}`),
    removeHistory: () => request('/gym/sessions/history', { method: 'DELETE', body: {} }),
    removeSessionExercise: (sessionId, exerciseId) => request(`/gym/sessions/${encodeURIComponent(sessionId)}/exercises/${encodeURIComponent(exerciseId)}`, { method: 'DELETE', body: {} }),
    stats: (exercise) => {
      const query = exercise ? `?${new URLSearchParams({ exercise }).toString()}` : '';
      return request(`/gym/stats${query}`);
    },
    calendar: () => request('/gym/calendar'),
    calendarDay: (date) => request(`/gym/calendar/${encodeURIComponent(date)}`),
  },
};
