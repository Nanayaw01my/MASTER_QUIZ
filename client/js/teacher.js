/* ============================================================
   Teacher dashboard
   ============================================================ */
const user = requireRole('teacher');

const SECTIONS = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'subjects', icon: '📚', label: 'My Subjects' },
  { id: 'quizzes', icon: '📝', label: 'Quizzes' },
  { id: 'questions', icon: '❓', label: 'Question Bank' },
  { id: 'results', icon: '🏅', label: 'Results' },
  { id: 'violations', icon: '⚠️', label: 'Violations' },
  { id: 'students', icon: '🎓', label: 'Students' },
  { id: 'analytics', icon: '📈', label: 'Analytics' },
  { id: 'notifications', icon: '🔔', label: 'Notifications' },
  { id: 'profile', icon: '👤', label: 'Profile' },
];

buildShell({
  title: 'Teacher Dashboard',
  items: SECTIONS,
  user,
  onNav: (id) => {
    const c = document.getElementById('content');
    destroyCharts?.();
    switch (id) {
      case 'dashboard': return renderDashboard(c);
      case 'subjects': return renderMySubjects(c);
      case 'quizzes': return sectionQuizzes(c);
      case 'questions': return sectionQuestions(c);
      case 'results': return sectionResults(c);
      case 'violations': return sectionViolations(c);
      case 'students': return renderStudents(c);
      case 'analytics': return sectionAnalytics(c);
      case 'notifications': return renderNotifications(c);
      case 'profile': return sectionProfile(c);
    }
  },
});

async function renderDashboard(c) {
  c.innerHTML = loaderHtml;
  try {
    const [{ data: subj }, { data: quiz }, { data: ov }] = await Promise.all([
      API.get('/subjects?limit=100'),
      API.get('/quizzes?limit=100'),
      API.get('/analytics/overview'),
    ]);
    const now = new Date();
    const active = quiz.quizzes.filter((z) => z.status === 'published' && new Date(z.startDate) <= now && new Date(z.endDate) >= now);
    c.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="icon">📚</div><div><div class="value">${subj.total}</div><div class="label">Assigned Subjects</div></div></div>
        <div class="stat"><div class="icon">📝</div><div><div class="value">${quiz.total}</div><div class="label">My Quizzes</div></div></div>
        <div class="stat"><div class="icon">▶️</div><div><div class="value">${active.length}</div><div class="label">Active Quizzes</div></div></div>
        <div class="stat"><div class="icon">📊</div><div><div class="value">${ov.overview.avgScore}%</div><div class="label">Average Score</div></div></div>
      </div>
      <div class="card">
        <h3>My Subjects</h3>
        ${subj.subjects.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Subject</th><th>Code</th><th>Classes</th></tr></thead>
          <tbody>${subj.subjects.map((s) => `
            <tr><td>${esc(s.name)}</td><td><span class="badge blue">${esc(s.code)}</span></td>
            <td>${(s.classes || []).map((x) => esc(x.name)).join(', ') || '-'}</td></tr>`).join('')}</tbody></table></div>`
          : emptyHtml('No subjects assigned yet — contact your administrator')}
      </div>
      <div class="card">
        <h3>Active Quizzes</h3>
        ${active.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Title</th><th>Subject</th><th>Class</th><th>Ends</th></tr></thead>
          <tbody>${active.map((z) => `
            <tr><td>${esc(z.title)}</td><td>${esc(z.subject?.code || '')}</td><td>${esc(z.classRef?.name || '')}</td>
            <td>${fmtDate(z.endDate)}</td></tr>`).join('')}</tbody></table></div>` : emptyHtml('No active quizzes')}
      </div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}

async function renderMySubjects(c) {
  c.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/subjects?limit=100');
    c.innerHTML = `<div class="grid cols-2">${
      data.subjects.length ? data.subjects.map((s) => `
        <div class="card">
          <h3>${esc(s.name)} <span class="badge blue">${esc(s.code)}</span></h3>
          <p style="font-size:.88rem;color:var(--text-muted)">${esc(s.description || 'No description')}</p>
          <p style="font-size:.85rem;margin-top:10px"><strong>Classes:</strong> ${(s.classes || []).map((x) => esc(x.name)).join(', ') || '—'}</p>
          <p style="font-size:.85rem"><strong>Department:</strong> ${esc(s.department?.name || '—')}</p>
        </div>`).join('') : `<div class="card">${emptyHtml('No subjects assigned to you yet')}</div>`
    }</div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}

async function renderStudents(c) {
  c.innerHTML = loaderHtml;
  try {
    // Students in classes covered by the teacher's subjects
    const { data: subj } = await API.get('/subjects?limit=100');
    const classIds = [...new Set(subj.subjects.flatMap((s) => (s.classes || []).map((x) => x._id)))];
    if (!classIds.length) { c.innerHTML = `<div class="card">${emptyHtml('No classes linked to your subjects yet')}</div>`; return; }

    // Teachers cannot list users directly; show leaderboard-style data from results instead
    const { data: res } = await API.get('/attempts/results?limit=100');
    const students = {};
    res.results.forEach((r) => {
      if (!r.student) return;
      const k = r.student._id;
      students[k] = students[k] || { name: r.student.name, regNumber: r.student.regNumber, attempts: 0, best: 0 };
      students[k].attempts += 1;
      students[k].best = Math.max(students[k].best, r.percentage);
    });
    const list = Object.values(students);
    c.innerHTML = `<div class="card">
      <h3>🎓 Students (from quiz activity)</h3>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Reg No.</th><th>Attempts</th><th>Best %</th></tr></thead>
        <tbody>${list.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.regNumber || '-')}</td><td>${s.attempts}</td><td><strong>${s.best}%</strong></td></tr>`).join('')}</tbody>
      </table></div>` : emptyHtml('No student activity yet')}
    </div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}
