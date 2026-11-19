import axios from 'axios';

const KEY = 'rg_token';
// sessionStorage: cleared when the tab closes. Tokens are never put in the URL.
export const tokenStore = {
  get: () => sessionStorage.getItem(KEY),
  set: (t) => sessionStorage.setItem(KEY, t),
  clear: () => sessionStorage.removeItem(KEY),
};

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 90000 });
http.interceptors.request.use((cfg) => { const t = tokenStore.get(); if (t) cfg.headers.Authorization = `Bearer ${t}`; return cfg; });
http.interceptors.response.use((r) => r, (err) => {
  if (err.response?.status === 401 && tokenStore.get() && !err.config?.url?.startsWith('/auth/login')) {
    tokenStore.clear(); window.dispatchEvent(new Event('rg:unauthorized'));
  }
  return Promise.reject(err);
});

const FRIENDLY = {
  quota_exhausted: 'The free AI allowance is used up for now. Nothing was saved for the failed items. Try again later.',
  ai_unavailable: 'The analysis service is not responding. Nothing was saved. Try again in a minute.',
  ai_timeout: 'The analysis service took too long to answer. Nothing was saved. Try again.',
  ai_upstream_error: 'The AI provider returned an error. Nothing was saved. Try again shortly.',
  ai_model_unavailable: 'One of the AI models is unavailable right now. Nothing was saved.',
  ai_not_configured: 'The AI service has no credentials configured. Ask the administrator to set them.',
  ai_invalid_model_response: 'The AI model returned something we could not use. Nothing was saved. Try again.',
  invalid_ai_response: 'The AI service returned an invalid result. Nothing was saved. Try again.',
  ai_misconfigured: 'The backend is not authorised to use the AI service. Ask the administrator to check the internal token.',
  database_unavailable: 'The database is temporarily unavailable. Try again in a moment.',
  rate_limited: 'Too many requests. Wait a few seconds and try again.',
  invalid_credentials: 'Email or password is incorrect.',
  registration_disabled: 'Registration is disabled on this server. Ask an administrator for an account.',
  unauthorized: 'Your session has expired. Sign in again.',
  file_too_large: 'That file is too large (limit 512 KB).',
};
export function describeError(err) {
  if (!err.response) return { code: 'network', status: 0, message: 'Cannot reach the server. Check your connection and that the API address is correct.' };
  const e = err.response.data?.error || {};
  const status = err.response.status;
  const message = FRIENDLY[e.code] || e.message || `Request failed (${status}).`;
  return { code: e.code || 'error', status, message, details: e.details };
}

const data = (p) => p.then((r) => r.data.data);
const page = (p) => p.then((r) => ({ items: r.data.data, pagination: r.data.pagination }));
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const api = {
  login: (b) => data(http.post('/auth/login', b)),
  register: (b) => data(http.post('/auth/register', b)),
  me: () => data(http.get('/auth/me')),
  health: () => http.get('/health').then((r) => r.data),
  analyze: (b) => data(http.post('/reviews/analyze', b)),
  bulk: (b) => data(http.post('/reviews/bulk', b)),
  stats: () => data(http.get('/reviews/stats')),
  insights: (days) => data(http.get('/analytics/insights', { params: { days } })),
  summary: () => data(http.get('/reports/summary')),
  reviews: (p) => page(http.get('/reviews', { params: clean(p) })),
  review: (id) => data(http.get(`/reviews/${id}`)),
  moderationQueue: (p) => page(http.get('/moderation', { params: clean(p) })),
  moderate: (id, body) => data(http.patch(`/moderation/${id}`, body)),
  exportCsv: async (p) => {
    const r = await http.get('/reports/export', { params: clean(p), responseType: 'blob' });
    return { blob: r.data, truncated: r.headers['x-export-truncated'] === 'true', total: Number(r.headers['x-total-count'] || 0) };
  },
};

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
