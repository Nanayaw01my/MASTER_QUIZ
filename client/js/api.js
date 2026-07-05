/* ============================================================
   Quiz Master - API client (axios) with automatic token refresh
   ============================================================ */
const API = axios.create({ baseURL: '/api', withCredentials: true });

const Auth = {
  get token() { return sessionStorage.getItem('qm_token'); },
  set token(v) { v ? sessionStorage.setItem('qm_token', v) : sessionStorage.removeItem('qm_token'); },
  get user() {
    try { return JSON.parse(sessionStorage.getItem('qm_user')); } catch { return null; }
  },
  set user(u) { u ? sessionStorage.setItem('qm_user', JSON.stringify(u)) : sessionStorage.removeItem('qm_user'); },
  clear() { this.token = null; this.user = null; },
};

API.interceptors.request.use((config) => {
  if (Auth.token) config.headers.Authorization = `Bearer ${Auth.token}`;
  return config;
});

// On 401, try one silent refresh then retry the original request
let refreshing = null;
API.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    if (status === 401 && !original._retried && !original.url.includes('/auth/login') && !original.url.includes('/auth/refresh')) {
      original._retried = true;
      try {
        refreshing = refreshing || axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const { data } = await refreshing;
        refreshing = null;
        Auth.token = data.token;
        Auth.user = data.user;
        return API(original);
      } catch (e) {
        refreshing = null;
        Auth.clear();
        if (!location.pathname.endsWith('/index.html') && location.pathname !== '/') {
          location.href = '/index.html';
        }
      }
    }
    return Promise.reject(error);
  }
);

/** Extract a readable message from an API error. */
const apiError = (err) => err.response?.data?.message || err.message || 'Something went wrong';

/** Guard a dashboard page: requires login + allowed role. */
function requireRole(...roles) {
  const u = Auth.user;
  if (!u || !Auth.token) { location.href = '/index.html'; return null; }
  if (!roles.includes(u.role)) {
    location.href = u.role === 'admin' ? '/admin.html' : u.role === 'teacher' ? '/teacher.html' : '/student.html';
    return null;
  }
  return u;
}

async function logout() {
  try { await API.post('/auth/logout'); } catch { /* ignore */ }
  Auth.clear();
  location.href = '/index.html';
}
