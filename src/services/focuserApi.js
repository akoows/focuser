const pageHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
const configuredApiUrl = import.meta.env.VITE_API_URL || `http://${pageHostname}:3000/api`;
const apiUrl = new URL(configuredApiUrl);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
if (typeof window !== 'undefined' && !loopbackHosts.has(pageHostname) && loopbackHosts.has(apiUrl.hostname)) {
  apiUrl.hostname = pageHostname;
}
const API_BASE_URL = apiUrl.toString().replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10000;

async function request(endpoint, { method = 'GET', body, credentials = 'include' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-Focuser-Client'] = 'web';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      credentials,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('A API não respondeu em 10 segundos. Verifique se ela está ativa e se o endereço configurado está correto.');
    }
    throw new Error(`Não foi possível conectar à API em ${API_BASE_URL}. Verifique se ela está ativa e acessível pela rede.`);
  } finally {
    clearTimeout(timeoutId);
  }
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
  friends: {
    list: () => request('/friends'),
    status: (username) => request(`/friends/status/${encodeURIComponent(username)}`),
    sendRequest: (username) => request('/friends/requests', { method: 'POST', body: { username } }),
    acceptRequest: (id) => request(`/friends/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
    removeRequest: (id) => request(`/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    removeFriend: (id) => request(`/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  dashboard: (date) => request(date ? `/dashboard?date=${encodeURIComponent(date)}` : '/dashboard'),
  progress: (period = 'week') => request(`/progress?period=${period}`),
  history: (period = 'week') => request(`/progress/history?period=${period}`),
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
    feed: () => request('/reading/feed'),
    setFocusStatus: (data) => request('/users/me/reading-focus', { method: 'PUT', body: data }),
    clearFocusStatus: (sessionId) => request('/users/me/reading-focus', { method: 'DELETE', body: { sessionId } }),
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
