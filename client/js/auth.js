/* Login / forgot-password page logic */

// Already logged in? Go straight to the dashboard.
(() => {
  const u = Auth.user;
  if (u && Auth.token) {
    location.href = u.role === 'admin' ? '/admin.html' : u.role === 'teacher' ? '/teacher.html' : '/student.html';
  }
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const { data } = await API.post('/auth/login', {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    Auth.token = data.token;
    Auth.user = data.user;
    toast(`Welcome back, ${data.user.name}!`, 'success');
    setTimeout(() => {
      location.href = data.user.role === 'admin' ? '/admin.html' : data.user.role === 'teacher' ? '/teacher.html' : '/student.html';
    }, 400);
  } catch (err) {
    toast(apiError(err), 'error');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// Toggle forms
document.getElementById('show-forgot').onclick = (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'block';
};
document.getElementById('show-login').onclick = (e) => {
  e.preventDefault();
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
};

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { data } = await API.post('/auth/forgot-password', { email: document.getElementById('f-email').value.trim() });
    if (data.resetToken) {
      document.getElementById('f-token').value = data.resetToken;
      toast('Reset token generated — set your new password below.', 'success', 6000);
    } else {
      toast(data.message, 'info');
    }
  } catch (err) { toast(apiError(err), 'error'); }
});

document.getElementById('do-reset').onclick = async () => {
  const token = document.getElementById('f-token').value.trim();
  const password = document.getElementById('f-newpass').value;
  if (!token || !password) return toast('Token and new password are required', 'warning');
  try {
    const { data } = await API.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password });
    toast(data.message, 'success');
    document.getElementById('show-login').click();
  } catch (err) { toast(apiError(err), 'error'); }
};
