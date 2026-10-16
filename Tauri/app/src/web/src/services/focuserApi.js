const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

async function request(endpoint, { method = 'GET', body, credentials = 'include' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-Focuser-Client'] = 'web';

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    credentials,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`A API retornou uma resposta inválida (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const error = payload?.error;
    const message = error?.message || `Falha na requisição (HTTP ${response.status}).`;
    const apiError = new Error(message);
    apiError.code = error?.code;
    apiError.status = response.status;
    apiError.details = error?.details;
    throw apiError;
  }

  return payload.data ?? payload;
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
  dashboard: (date) => request(date ? `/dashboard?date=${encodeURIComponent(date)}` : '/dashboard'),
  progress: (period = 'week') => request(`/progress?period=${period}`),
  history: (period = 'week') => request(`/progress/history?period=${period}`),
  analyzeHabits: (period = 'month') => request('/ai/analyze', { method: 'POST', body: { period } }),
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
    lookupIsbn: (data) => request('/reading/isbn-lookup', { method: 'POST', body: data }),
    listBooks: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reading/books${query ? `?${query}` : ''}`);
    },
    createBook: (data) => request('/reading/books', { method: 'POST', body: data }),
    updateBook: (id, data) => request(`/reading/books/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    logSession: (id, data) => request(`/reading/books/${encodeURIComponent(id)}/logs`, { method: 'POST', body: data }),
    removeBook: (id) => request(`/reading/books/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  gym: {
    listPlans: () => request('/gym/plans'),
    createPlan: (data) => request('/gym/plans', { method: 'POST', body: data }),
    updatePlan: (id, data) => request(`/gym/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    removePlan: (id) => request(`/gym/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    activeSession: () => request('/gym/sessions/active'),
    startSession: (data = {}) => request('/gym/sessions', { method: 'POST', body: data }),
    addExercise: (id, data) => request(`/gym/sessions/${encodeURIComponent(id)}/exercises`, { method: 'POST', body: data }),
    addSet: (id, exerciseId) => request(`/gym/sessions/${encodeURIComponent(id)}/exercises/${encodeURIComponent(exerciseId)}/sets`, { method: 'POST', body: {} }),
    updateSet: (id, exerciseId, setId, data) => request(`/gym/sessions/${encodeURIComponent(id)}/exercises/${encodeURIComponent(exerciseId)}/sets/${encodeURIComponent(setId)}`, { method: 'PATCH', body: data }),
    completeSession: (id) => request(`/gym/sessions/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} }),
    abandonSession: (id) => request(`/gym/sessions/${encodeURIComponent(id)}/abandon`, { method: 'POST', body: {} }),
    listSessions: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/gym/sessions${query ? `?${query}` : ''}`);
    },
    deleteHistory: () => request('/gym/sessions/history', { method: 'DELETE', body: {} }),
    removeSessionExercise: (id, exerciseId) => request(`/gym/sessions/${encodeURIComponent(id)}/exercises/${encodeURIComponent(exerciseId)}`, { method: 'DELETE', body: {} }),
    getSession: (id) => request(`/gym/sessions/${encodeURIComponent(id)}`),
    stats: (exercise) => request(`/gym/stats${exercise ? `?exercise=${encodeURIComponent(exercise)}` : ''}`),
    calendar: () => request('/gym/calendar'),
    sessionsForDay: (date) => request(`/gym/calendar/${encodeURIComponent(date)}`),
  },
  habits: {
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
};
