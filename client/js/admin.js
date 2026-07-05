/* ============================================================
   Admin dashboard
   ============================================================ */
const user = requireRole('admin');

const SECTIONS = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'teachers', icon: 'users', label: 'Teachers' },
  { id: 'students', icon: 'cap', label: 'Students' },
  { id: 'subjects', icon: 'book', label: 'Subjects' },
  { id: 'classes', icon: 'school', label: 'Classes' },
  { id: 'departments', icon: 'building', label: 'Departments' },
  { id: 'quizzes', icon: 'file', label: 'Quizzes' },
  { id: 'questions', icon: 'help', label: 'Question Bank' },
  { id: 'results', icon: 'award', label: 'Results' },
  { id: 'analytics', icon: 'chart', label: 'Analytics' },
  { id: 'violations', icon: 'alert', label: 'Violations' },
  { id: 'announcements', icon: 'megaphone', label: 'Announcements' },
  { id: 'logs', icon: 'archive', label: 'Audit Logs' },
  { id: 'notifications', icon: 'bell', label: 'Notifications' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'profile', icon: 'user', label: 'Profile' },
];

buildShell({
  title: 'Admin Dashboard',
  items: SECTIONS,
  user,
  onNav: (id) => {
    const c = document.getElementById('content');
    destroyCharts?.();
    switch (id) {
      case 'dashboard': return renderDashboard(c);
      case 'teachers': return renderUsers(c, 'teacher');
      case 'students': return renderUsers(c, 'student');
      case 'subjects': return renderSubjects(c);
      case 'classes': return renderClasses(c);
      case 'departments': return renderDepartments(c);
      case 'quizzes': return sectionQuizzes(c);
      case 'questions': return sectionQuestions(c);
      case 'results': return sectionResults(c);
      case 'analytics': return sectionAnalytics(c);
      case 'violations': return sectionViolations(c);
      case 'announcements': return renderAnnouncements(c);
      case 'logs': return renderLogs(c);
      case 'notifications': return renderNotifications(c);
      case 'settings': return renderSettings(c);
      case 'profile': return sectionProfile(c);
    }
  },
});

// ---------------------------------------------------------- Dashboard
async function renderDashboard(c) {
  c.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/admin/dashboard');
    const s = data.stats;
    c.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="icon">${svgIcon('users', 22)}</div><div><div class="value">${s.teachers}</div><div class="label">Teachers</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('cap', 22)}</div><div><div class="value">${s.students}</div><div class="label">Students</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('book', 22)}</div><div><div class="value">${s.subjects}</div><div class="label">Subjects</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('file', 22)}</div><div><div class="value">${s.quizzes}</div><div class="label">Quizzes</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('play', 22)}</div><div><div class="value">${s.activeQuizzes}</div><div class="label">Active Quizzes</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('flag', 22)}</div><div><div class="value">${s.completedQuizzes}</div><div class="label">Completed Quizzes</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('chart', 22)}</div><div><div class="value">${s.avgScore}%</div><div class="label">Average Score</div></div></div>
        <div class="stat"><div class="icon">${svgIcon('checkCircle', 22)}</div><div><div class="value">${s.passRate}%</div><div class="label">Pass Rate</div></div></div>
      </div>
      <div class="card">
        <h3>Recent Activity</h3>
        ${data.recentActivities.length ? `<div class="table-wrap"><table>
          <thead><tr><th>User</th><th>Action</th><th>Details</th><th>When</th></tr></thead>
          <tbody>${data.recentActivities.map((a) => `
            <tr><td>${esc(a.user?.name || 'System')}</td><td><span class="badge blue">${esc(a.action)}</span></td>
            <td style="white-space:normal">${esc(a.details || '')}</td><td style="font-size:.8rem">${fmtDate(a.createdAt)}</td></tr>`).join('')}
          </tbody></table></div>` : emptyHtml('No activity yet')}
      </div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}

// ---------------------------------------------------------- Settings
async function renderSettings(c) {
  c.innerHTML = `
    <div class="card">
      <h3>Image Storage (Cloudinary)</h3>
      <p class="hint" style="margin-bottom:14px">Profile pictures, exam verification photos and violation snapshots are stored in Cloudinary. Use this to confirm your credentials work on the live server.</p>
      <button class="btn" id="test-cloud">Test Cloudinary connection</button>
      <div id="cloud-result" style="margin-top:14px;font-size:.92rem"></div>
    </div>
    <div class="card">
      <h3>System</h3>
      <p style="font-size:.9rem"><strong>Logged in as:</strong> ${esc(user.name)} (${esc(user.email || 'admin')})</p>
      <p style="font-size:.9rem;margin-top:6px"><strong>Role:</strong> Administrator</p>
      <p class="hint" style="margin-top:10px">Tip: change your password from the Profile page after first login.</p>
    </div>`;

  const btn = document.getElementById('test-cloud');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Testing…';
    const box = document.getElementById('cloud-result');
    box.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/admin/cloudinary-test');
      box.innerHTML = `<span class="badge ${data.success ? 'green' : 'red'}">${data.success ? 'Connected' : 'Failed'}</span> ${esc(data.message)}`;
      toast(data.message, data.success ? 'success' : 'error', 6000);
    } catch (err) { box.innerHTML = `<span class="badge red">Error</span> ${esc(apiError(err))}`; }
    btn.disabled = false; btn.textContent = 'Test Cloudinary connection';
  };
}

// ---------------------------------------------------------- Users (teachers/students)
async function renderUsers(c, role) {
  c.innerHTML = loaderHtml;
  const [{ data: cls }, { data: dep }, { data: subj }] = await Promise.all([
    API.get('/classes'), API.get('/admin/departments'), API.get('/subjects?limit=100'),
  ]);
  const ctx = { classes: cls.classes, departments: dep.departments, subjects: subj.subjects, role };
  let state = { page: 1, search: '' };

  const render = async () => {
    const list = document.getElementById('u-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/admin/users', { params: { role, page: state.page, search: state.search || undefined } });
      if (!data.users.length) { list.innerHTML = emptyHtml(`No ${role}s found`); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>${role === 'student' ? 'Class' : 'Subjects'}</th><th>Reg No.</th><th>Status</th><th></th></tr></thead>
        <tbody>${data.users.map((u) => `
          <tr>
            <td>${esc(u.name)}</td>
            <td>${esc(u.email)}</td>
            <td style="white-space:normal">${role === 'student' ? esc(u.classRef?.name || '-') : (u.subjects || []).map((s) => `<span class="badge blue">${esc(s.code)}</span>`).join(' ') || '-'}</td>
            <td>${esc(u.regNumber || '-')}</td>
            <td><span class="badge ${u.status === 'active' ? 'green' : 'red'}">${esc(u.status)}</span></td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <button class="btn secondary sm" onclick='userModal(${attrJson(u)})'>Edit</button>
              <button class="btn ${u.status === 'active' ? 'danger' : 'success'} sm" onclick="toggleUser('${u._id}','${u.status === 'active' ? 'suspended' : 'active'}')">${u.status === 'active' ? 'Suspend' : 'Activate'}</button>
              <button class="btn secondary sm" onclick='resetPwModal("${u._id}", ${attrJson(u.name)})'>Reset PW</button>
              <button class="btn danger sm" onclick="deleteUser('${u._id}')">Del</button>
            </td>
          </tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="u-pages"></div>`;
      renderPagination(document.getElementById('u-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };

  c.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="u-search" placeholder="Search by name, email, reg no…">
        <span class="spacer"></span>
        <button class="btn" id="u-new">+ Register ${role === 'teacher' ? 'Teacher' : 'Student'}</button>
      </div>
      <div id="u-list"></div>
    </div>`;
  let deb;
  document.getElementById('u-search').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.search = e.target.value; state.page = 1; render(); }, 400); };
  document.getElementById('u-new').onclick = () => userModal(null);

  window._userCtx = { ...ctx, refresh: render };
  render();
}

function userModal(uJson) {
  const { classes, departments, subjects, role, refresh } = window._userCtx;
  const u = uJson ? JSON.parse(uJson) : null;
  const isStudent = role === 'student';
  const m = openModal(`
    <h2>${u ? 'Edit' : 'Register'} ${isStudent ? 'Student' : 'Teacher'}</h2>
    <div class="form-row">
      <div class="form-group"><label>Full name</label><input id="um-name" value="${esc(u?.name || '')}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="um-email" value="${esc(u?.email || '')}"></div>
    </div>
    ${!u ? '<div class="form-group"><label>Password</label><input type="password" id="um-pass" placeholder="Min 6 characters"></div>' : ''}
    <div class="form-row">
      <div class="form-group"><label>Reg / Staff number</label><input id="um-reg" value="${esc(u?.regNumber || '')}"></div>
      <div class="form-group"><label>Department</label>
        <select id="um-dept"><option value="">—</option>${departments.map((d) => `<option value="${d._id}" ${u && (u.department?._id || u.department) === d._id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    </div>
    ${isStudent ? `
      <div class="form-group"><label>Class</label>
        <select id="um-class"><option value="">—</option>${classes.map((x) => `<option value="${x._id}" ${u && (u.classRef?._id || u.classRef) === x._id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`
    : `
      <div class="form-group"><label>Assigned subjects</label>
        <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">
          ${subjects.map((s) => `<div class="checkbox-row" style="margin-bottom:5px">
            <input type="checkbox" class="um-subj" value="${s._id}" ${(u?.subjects || []).some((x) => (x._id || x) === s._id) ? 'checked' : ''}>
            <label style="font-size:.87rem">${esc(s.name)} (${esc(s.code)})</label></div>`).join('') || '<div class="hint">No subjects yet</div>'}
        </div></div>`}
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="um-save">${u ? 'Update' : 'Register'}</button>
    </div>`);

  m.querySelector('#um-save').onclick = async () => {
    const body = {
      name: m.querySelector('#um-name').value.trim(),
      email: m.querySelector('#um-email').value.trim(),
      regNumber: m.querySelector('#um-reg').value.trim(),
      department: m.querySelector('#um-dept').value || undefined,
      role,
    };
    if (isStudent) body.classRef = m.querySelector('#um-class').value || undefined;
    else body.subjects = [...m.querySelectorAll('.um-subj:checked')].map((x) => x.value);
    try {
      if (u) await API.put(`/admin/users/${u._id}`, body);
      else {
        body.password = m.querySelector('#um-pass').value;
        if (!body.password || body.password.length < 6) return toast('Password must be at least 6 characters', 'warning');
        await API.post('/admin/users', body);
      }
      toast(`${isStudent ? 'Student' : 'Teacher'} ${u ? 'updated' : 'registered'}`, 'success');
      closeModal();
      refresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function toggleUser(id, status) {
  try {
    await API.patch(`/admin/users/${id}/status`, { status });
    toast(`User ${status === 'suspended' ? 'suspended' : 'activated'}`, 'success');
    window._userCtx.refresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

function resetPwModal(id, nameJson) {
  const name = JSON.parse(nameJson);
  const m = openModal(`
    <h2>Reset password — ${esc(name)}</h2>
    <div class="form-group"><label>New password</label><input type="password" id="rp-pass" placeholder="Min 6 characters"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="rp-go">Reset</button>
    </div>`);
  m.querySelector('#rp-go').onclick = async () => {
    try {
      await API.patch(`/admin/users/${id}/reset-password`, { newPassword: m.querySelector('#rp-pass').value });
      toast('Password reset', 'success');
      closeModal();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteUser(id) {
  if (!(await confirmModal('Delete this user permanently? Their attempts remain in the records.'))) return;
  try {
    await API.delete(`/admin/users/${id}`);
    toast('User deleted', 'success');
    window._userCtx.refresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Subjects
async function renderSubjects(c) {
  c.innerHTML = loaderHtml;
  const [{ data: dep }, { data: cls }, { data: tch }] = await Promise.all([
    API.get('/admin/departments'), API.get('/classes'), API.get('/admin/users?role=teacher&limit=100'),
  ]);
  window._subjCtx = { departments: dep.departments, classes: cls.classes, teachers: tch.users };

  const render = async () => {
    const list = document.getElementById('s-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/subjects?limit=100');
      window._subjCtx.refresh = render;
      if (!data.subjects.length) { list.innerHTML = emptyHtml('No subjects yet'); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Code</th><th>Department</th><th>Classes</th><th>Teachers</th><th></th></tr></thead>
        <tbody>${data.subjects.map((s) => `
          <tr>
            <td>${esc(s.name)}</td><td><span class="badge blue">${esc(s.code)}</span></td>
            <td>${esc(s.department?.name || '-')}</td>
            <td style="white-space:normal">${(s.classes || []).map((x) => esc(x.name)).join(', ') || '-'}</td>
            <td style="white-space:normal">${(s.teachers || []).map((t) => esc(t.name)).join(', ') || '-'}</td>
            <td>
              <button class="btn secondary sm" onclick='subjectModal(${attrJson(s)})'>Edit</button>
              <button class="btn danger sm" onclick="deleteSubject('${s._id}')">Del</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`;
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };

  c.innerHTML = `
    <div class="card">
      <div class="toolbar"><h3 style="margin:0">Subjects</h3><span class="spacer"></span><button class="btn" onclick="subjectModal(null)">+ New Subject</button></div>
      <div id="s-list"></div>
    </div>`;
  window._subjCtx.refresh = render;
  render();
}

function subjectModal(sJson) {
  const { departments, classes, teachers, refresh } = window._subjCtx;
  const s = sJson ? JSON.parse(sJson) : null;
  const m = openModal(`
    <h2>${s ? 'Edit' : 'New'} Subject</h2>
    <div class="form-row">
      <div class="form-group"><label>Name</label><input id="sm-name" value="${esc(s?.name || '')}"></div>
      <div class="form-group"><label>Code</label><input id="sm-code" value="${esc(s?.code || '')}" placeholder="e.g. MATH101"></div>
    </div>
    <div class="form-group"><label>Department</label>
      <select id="sm-dept"><option value="">—</option>${departments.map((d) => `<option value="${d._id}" ${s && (s.department?._id || s.department) === d._id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Classes</label>
      <div style="max-height:130px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">
        ${classes.map((x) => `<div class="checkbox-row" style="margin-bottom:5px">
          <input type="checkbox" class="sm-cls" value="${x._id}" ${(s?.classes || []).some((y) => (y._id || y) === x._id) ? 'checked' : ''}>
          <label style="font-size:.87rem">${esc(x.name)}</label></div>`).join('') || '<div class="hint">Create classes first</div>'}
      </div></div>
    <div class="form-group"><label>Teachers</label>
      <div style="max-height:130px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">
        ${teachers.map((t) => `<div class="checkbox-row" style="margin-bottom:5px">
          <input type="checkbox" class="sm-tch" value="${t._id}" ${(s?.teachers || []).some((y) => (y._id || y) === t._id) ? 'checked' : ''}>
          <label style="font-size:.87rem">${esc(t.name)}</label></div>`).join('') || '<div class="hint">Register teachers first</div>'}
      </div></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="sm-save">${s ? 'Update' : 'Create'}</button>
    </div>`);

  m.querySelector('#sm-save').onclick = async () => {
    const body = {
      name: m.querySelector('#sm-name').value.trim(),
      code: m.querySelector('#sm-code').value.trim(),
      department: m.querySelector('#sm-dept').value || undefined,
      classes: [...m.querySelectorAll('.sm-cls:checked')].map((x) => x.value),
      teachers: [...m.querySelectorAll('.sm-tch:checked')].map((x) => x.value),
    };
    try {
      if (s) await API.put(`/subjects/${s._id}`, body);
      else await API.post('/subjects', body);
      toast(`Subject ${s ? 'updated' : 'created'}`, 'success');
      closeModal();
      refresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteSubject(id) {
  if (!(await confirmModal('Delete this subject?'))) return;
  try {
    await API.delete(`/subjects/${id}`);
    toast('Subject deleted', 'success');
    window._subjCtx.refresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Classes & departments
async function renderClasses(c) {
  const render = async () => {
    const list = document.getElementById('c-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/classes');
      window._clsRefresh = render;
      list.innerHTML = data.classes.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Level</th><th>Department</th><th>Session</th><th></th></tr></thead>
        <tbody>${data.classes.map((x) => `
          <tr><td>${esc(x.name)}</td><td>${esc(x.level || '-')}</td><td>${esc(x.department?.name || '-')}</td><td>${esc(x.academicSession || '-')}</td>
          <td><button class="btn secondary sm" onclick='classModal(${attrJson(x)})'>Edit</button>
          <button class="btn danger sm" onclick="deleteClass('${x._id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No classes yet');
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };
  c.innerHTML = `<div class="card">
    <div class="toolbar"><h3 style="margin:0">Classes</h3><span class="spacer"></span><button class="btn" onclick="classModal(null)">+ New Class</button></div>
    <div id="c-list"></div></div>`;
  window._clsRefresh = render;
  render();
}

async function classModal(xJson) {
  const x = xJson ? JSON.parse(xJson) : null;
  const { data: dep } = await API.get('/admin/departments');
  const m = openModal(`
    <h2>${x ? 'Edit' : 'New'} Class</h2>
    <div class="form-row">
      <div class="form-group"><label>Name</label><input id="cm-name" value="${esc(x?.name || '')}" placeholder="e.g. Level 100 A"></div>
      <div class="form-group"><label>Level</label><input id="cm-level" value="${esc(x?.level || '')}" placeholder="e.g. 100"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Department</label>
        <select id="cm-dept"><option value="">—</option>${dep.departments.map((d) => `<option value="${d._id}" ${x && (x.department?._id || x.department) === d._id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Academic session</label><input id="cm-session" value="${esc(x?.academicSession || '')}" placeholder="2025/2026"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="cm-save">${x ? 'Update' : 'Create'}</button>
    </div>`);
  m.querySelector('#cm-save').onclick = async () => {
    const body = {
      name: m.querySelector('#cm-name').value.trim(),
      level: m.querySelector('#cm-level').value.trim(),
      department: m.querySelector('#cm-dept').value || undefined,
      academicSession: m.querySelector('#cm-session').value.trim(),
    };
    try {
      if (x) await API.put(`/classes/${x._id}`, body);
      else await API.post('/classes', body);
      toast(`Class ${x ? 'updated' : 'created'}`, 'success');
      closeModal();
      window._clsRefresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteClass(id) {
  if (!(await confirmModal('Delete this class?'))) return;
  try { await API.delete(`/classes/${id}`); toast('Class deleted', 'success'); window._clsRefresh(); }
  catch (err) { toast(apiError(err), 'error'); }
}

async function renderDepartments(c) {
  const render = async () => {
    const list = document.getElementById('d-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/admin/departments');
      window._depRefresh = render;
      list.innerHTML = data.departments.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Code</th><th>Description</th><th></th></tr></thead>
        <tbody>${data.departments.map((d) => `
          <tr><td>${esc(d.name)}</td><td><span class="badge blue">${esc(d.code)}</span></td><td style="white-space:normal">${esc(d.description || '-')}</td>
          <td><button class="btn secondary sm" onclick='departmentModal(${attrJson(d)})'>Edit</button>
          <button class="btn danger sm" onclick="deleteDepartment('${d._id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No departments yet');
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };
  c.innerHTML = `<div class="card">
    <div class="toolbar"><h3 style="margin:0">Departments</h3><span class="spacer"></span><button class="btn" onclick="departmentModal(null)">+ New Department</button></div>
    <div id="d-list"></div></div>`;
  window._depRefresh = render;
  render();
}

function departmentModal(dJson) {
  const d = dJson ? JSON.parse(dJson) : null;
  const m = openModal(`
    <h2>${d ? 'Edit' : 'New'} Department</h2>
    <div class="form-row">
      <div class="form-group"><label>Name</label><input id="dm-name" value="${esc(d?.name || '')}"></div>
      <div class="form-group"><label>Code</label><input id="dm-code" value="${esc(d?.code || '')}" placeholder="e.g. SCI"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="dm-desc" rows="2">${esc(d?.description || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="dm-save">${d ? 'Update' : 'Create'}</button>
    </div>`);
  m.querySelector('#dm-save').onclick = async () => {
    const body = {
      name: m.querySelector('#dm-name').value.trim(),
      code: m.querySelector('#dm-code').value.trim(),
      description: m.querySelector('#dm-desc').value.trim(),
    };
    try {
      if (d) await API.put(`/admin/departments/${d._id}`, body);
      else await API.post('/admin/departments', body);
      toast(`Department ${d ? 'updated' : 'created'}`, 'success');
      closeModal();
      window._depRefresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteDepartment(id) {
  if (!(await confirmModal('Delete this department?'))) return;
  try { await API.delete(`/admin/departments/${id}`); toast('Department deleted', 'success'); window._depRefresh(); }
  catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Announcements
async function renderAnnouncements(c) {
  const render = async () => {
    const list = document.getElementById('a-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/announcements?limit=30');
      window._annRefresh = render;
      list.innerHTML = data.announcements.length ? data.announcements.map((a) => `
        <div style="padding:14px 4px;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <strong>${esc(a.title)}</strong>
            <span>
              <span class="badge blue">${esc(a.audience)}</span>
              <button class="btn danger sm" onclick="deleteAnnouncement('${a._id}')">Del</button>
            </span>
          </div>
          <div style="font-size:.9rem;margin-top:6px;white-space:pre-wrap">${esc(a.body)}</div>
          <div class="hint">By ${esc(a.createdBy?.name || '-')} · ${fmtDate(a.createdAt)}</div>
        </div>`).join('') : emptyHtml('No announcements');
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };
  c.innerHTML = `<div class="card">
    <div class="toolbar"><h3 style="margin:0">Announcements</h3><span class="spacer"></span><button class="btn" onclick="announcementModal()">+ New</button></div>
    <div id="a-list"></div></div>`;
  window._annRefresh = render;
  render();
}

function announcementModal() {
  const m = openModal(`
    <h2>New Announcement</h2>
    <div class="form-group"><label>Title</label><input id="am-title"></div>
    <div class="form-group"><label>Message</label><textarea id="am-body" rows="4"></textarea></div>
    <div class="form-group"><label>Audience</label>
      <select id="am-aud"><option value="all">Everyone</option><option value="teachers">Teachers only</option><option value="students">Students only</option></select></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="am-save">Publish</button>
    </div>`);
  m.querySelector('#am-save').onclick = async () => {
    try {
      await API.post('/announcements', {
        title: m.querySelector('#am-title').value.trim(),
        body: m.querySelector('#am-body').value.trim(),
        audience: m.querySelector('#am-aud').value,
      });
      toast('Announcement published', 'success');
      closeModal();
      window._annRefresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteAnnouncement(id) {
  if (!(await confirmModal('Delete this announcement?'))) return;
  try { await API.delete(`/announcements/${id}`); toast('Deleted', 'success'); window._annRefresh(); }
  catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Logs
async function renderLogs(c) {
  let state = { page: 1 };
  const render = async () => {
    const list = document.getElementById('l-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/admin/logs', { params: { page: state.page } });
      list.innerHTML = data.logs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Role</th><th>Action</th><th>Details</th><th>IP</th><th>When</th></tr></thead>
        <tbody>${data.logs.map((l) => `
          <tr><td>${esc(l.user?.name || 'System')}</td><td>${esc(l.user?.role || '-')}</td>
          <td><span class="badge blue">${esc(l.action)}</span></td>
          <td style="white-space:normal">${esc(l.details || '')}</td><td style="font-size:.78rem">${esc(l.ip || '-')}</td>
          <td style="font-size:.8rem">${fmtDate(l.createdAt)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="l-pages"></div>` : emptyHtml('No logs yet');
      renderPagination(document.getElementById('l-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };
  c.innerHTML = `<div class="card"><h3>Audit Logs</h3><div id="l-list"></div></div>`;
  render();
}
