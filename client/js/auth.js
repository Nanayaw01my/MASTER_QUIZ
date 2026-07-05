/* Login / forgot-password page logic */

// Show/hide password toggles
document.querySelectorAll('.field-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
  });
});

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

// ---- Student self-registration ----
const goToDash = (role) => {
  location.href = role === 'admin' ? '/admin.html' : role === 'teacher' ? '/teacher.html' : '/student.html';
};

let classesLoaded = false;
async function loadRegisterClasses() {
  if (classesLoaded) return;
  const sel = document.getElementById('r-class');
  try {
    const { data } = await API.get('/auth/classes');
    if (!data.classes.length) {
      sel.innerHTML = '<option value="">No classes available — contact admin</option>';
      return;
    }
    sel.innerHTML = '<option value="">Select your class</option>' +
      data.classes.map((c) => `<option value="${c._id}">${c.name}${c.level ? ` (${c.level})` : ''}</option>`).join('');
    classesLoaded = true;
  } catch (err) {
    sel.innerHTML = '<option value="">Could not load classes</option>';
  }
}

document.getElementById('show-register').onclick = (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  loadRegisterClasses();
};
document.getElementById('show-login-2').onclick = (e) => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
};

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const { data } = await API.post('/auth/register', {
      name: document.getElementById('r-name').value.trim(),
      email: document.getElementById('r-email').value.trim(),
      classRef: document.getElementById('r-class').value,
      regNumber: document.getElementById('r-reg').value.trim(),
      password: document.getElementById('r-password').value,
    });
    Auth.token = data.token;
    Auth.user = data.user;
    toast(`Welcome, ${data.user.name}! Account created.`, 'success');
    setTimeout(() => goToDash(data.user.role), 500);
  } catch (err) {
    toast(apiError(err), 'error');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

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
