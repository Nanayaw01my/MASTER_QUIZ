/* ============================================================
   Student dashboard
   ============================================================ */
const user = requireRole('student');

const SECTIONS = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'subjects', icon: '📚', label: 'My Subjects' },
  { id: 'quizzes', icon: '📝', label: 'Take Quiz' },
  { id: 'history', icon: '🕘', label: 'Quiz History' },
  { id: 'announcements', icon: '📣', label: 'Announcements' },
  { id: 'notifications', icon: '🔔', label: 'Notifications' },
  { id: 'profile', icon: '👤', label: 'Profile' },
];

buildShell({
  title: 'Student Dashboard',
  items: SECTIONS,
  user,
  onNav: (id) => {
    const c = document.getElementById('content');
    destroyCharts?.();
    switch (id) {
      case 'dashboard': return renderDashboard(c);
      case 'subjects': return renderMySubjects(c);
      case 'quizzes': return renderQuizzes(c);
      case 'history': return renderHistory(c);
      case 'announcements': return renderAnnouncements(c);
      case 'notifications': return renderNotifications(c);
      case 'profile': return sectionProfile(c);
    }
  },
});

const quizCard = (z) => {
  const now = new Date();
  const start = new Date(z.startDate), end = new Date(z.endDate);
  const isActive = z.status === 'published' && start <= now && end >= now;
  const upcoming = start > now;
  const remaining = z.maxAttempts - (z.myAttempts?.used || 0);
  const canTake = isActive && (remaining > 0 || z.myAttempts?.inProgress);
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <h3 style="margin:0">${esc(z.title)}</h3>
        <span class="badge ${isActive ? 'green' : upcoming ? 'amber' : 'gray'}">${isActive ? 'Active' : upcoming ? 'Upcoming' : 'Closed'}</span>
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin:8px 0">
        ${esc(z.subject?.name || '')} · ${z.duration} min · Pass: ${z.passMark}%
      </p>
      <p style="font-size:.8rem">🕐 ${fmtDate(z.startDate)} → ${fmtDate(z.endDate)}</p>
      <p style="font-size:.8rem;margin:6px 0 12px">
        Attempts: ${z.myAttempts?.used || 0}/${z.maxAttempts}
        ${z.myAttempts?.best ? ` · Best: <strong>${z.myAttempts.best}%</strong>` : ''}
        ${z.myAttempts?.inProgress ? ' · <span class="badge amber">In progress</span>' : ''}
      </p>
      ${canTake ? `<button class="btn block" onclick="startQuiz('${z._id}')">${z.myAttempts?.inProgress ? 'Resume Quiz' : 'Start Quiz'}</button>`
        : upcoming ? '<button class="btn secondary block" disabled>Not started yet</button>'
        : remaining <= 0 ? '<button class="btn secondary block" disabled>No attempts left</button>'
        : '<button class="btn secondary block" disabled>Closed</button>'}
    </div>`;
};

function startQuiz(quizId) {
  // Quizzes require a desktop/laptop for proctoring reliability
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    return toast('Quizzes must be taken on a desktop or laptop computer with a webcam.', 'warning', 6000);
  }
  location.href = `/quiz.html?quiz=${quizId}`;
}

async function renderDashboard(c) {
  c.innerHTML = loaderHtml;
  try {
    const [{ data: quiz }, { data: res }, { data: ov }] = await Promise.all([
      API.get('/quizzes?limit=50'),
      API.get('/attempts/results?limit=100'),
      API.get('/analytics/overview'),
    ]);
    const now = new Date();
    const active = quiz.quizzes.filter((z) => new Date(z.startDate) <= now && new Date(z.endDate) >= now);
    const upcoming = quiz.quizzes.filter((z) => new Date(z.startDate) > now);

    c.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="icon">▶️</div><div><div class="value">${active.length}</div><div class="label">Available Quizzes</div></div></div>
        <div class="stat"><div class="icon">⏳</div><div><div class="value">${upcoming.length}</div><div class="label">Upcoming Quizzes</div></div></div>
        <div class="stat"><div class="icon">🏁</div><div><div class="value">${res.total}</div><div class="label">Completed</div></div></div>
        <div class="stat"><div class="icon">📊</div><div><div class="value">${ov.overview.avgScore}%</div><div class="label">My Average</div></div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>My Performance</h3><div class="chart-box"><canvas id="ch-perf"></canvas></div></div>
        <div class="card"><h3>Recent Results</h3>
          ${res.results.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Quiz</th><th>%</th><th>Grade</th><th></th></tr></thead>
            <tbody>${res.results.slice(0, 6).map((r) => `
              <tr><td>${esc(r.quiz?.title || '-')}</td><td><strong>${r.percentage}%</strong></td>
              <td><span class="badge ${r.passed ? 'green' : 'red'}">${esc(r.grade)}</span></td>
              <td><button class="btn secondary sm" onclick="resultDetailModal('${r._id}')">View</button></td></tr>`).join('')}</tbody>
          </table></div>` : emptyHtml('No results yet')}
        </div>
      </div>
      ${active.length ? `<h3 style="margin:6px 0 14px">Available now</h3><div class="grid cols-2">${active.map(quizCard).join('')}</div>` : ''}`;

    const hist = [...res.results].reverse();
    destroyCharts();
    _charts.push(new Chart(document.getElementById('ch-perf'), {
      type: 'line',
      data: {
        labels: hist.map((r) => r.quiz?.title?.slice(0, 14) || '-'),
        datasets: [{ label: 'Score %', data: hist.map((r) => r.percentage), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.15)', fill: true, tension: 0.35 }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    }));
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
          <p style="font-size:.88rem;color:var(--text-muted)">${esc(s.description || '')}</p>
          <p style="font-size:.85rem;margin-top:8px"><strong>Teachers:</strong> ${(s.teachers || []).map((t) => esc(t.name)).join(', ') || '—'}</p>
        </div>`).join('') : `<div class="card">${emptyHtml('No subjects for your class yet')}</div>`
    }</div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}

async function renderQuizzes(c) {
  c.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/quizzes?limit=50');
    if (!data.quizzes.length) { c.innerHTML = `<div class="card">${emptyHtml('No quizzes for your class yet')}</div>`; return; }
    const now = new Date();
    const groups = {
      'Available now': data.quizzes.filter((z) => new Date(z.startDate) <= now && new Date(z.endDate) >= now),
      'Upcoming': data.quizzes.filter((z) => new Date(z.startDate) > now),
      'Closed': data.quizzes.filter((z) => new Date(z.endDate) < now),
    };
    c.innerHTML = Object.entries(groups)
      .filter(([, list]) => list.length)
      .map(([label, list]) => `<h3 style="margin:6px 0 14px">${label}</h3><div class="grid cols-2">${list.map(quizCard).join('')}</div>`)
      .join('');
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}

async function renderHistory(c) {
  c.innerHTML = loaderHtml;
  let state = { page: 1 };
  const render = async () => {
    try {
      const { data } = await API.get('/attempts/results', { params: { page: state.page } });
      c.innerHTML = `<div class="card"><h3>🕘 Quiz History</h3>
        ${data.results.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Quiz</th><th>Subject</th><th>Score</th><th>%</th><th>Grade</th><th>Result</th><th>Submitted</th><th></th></tr></thead>
          <tbody>${data.results.map((r) => `
            <tr>
              <td>${esc(r.quiz?.title || '-')}</td>
              <td>${esc(r.quiz?.subject?.code || '-')}</td>
              <td>${r.score}/${r.totalMarks}</td>
              <td><strong>${r.percentage}%</strong></td>
              <td><span class="badge ${r.passed ? 'green' : 'red'}">${esc(r.grade)}</span></td>
              <td>${r.passed ? '<span class="badge green">Pass</span>' : '<span class="badge red">Fail</span>'}</td>
              <td style="font-size:.8rem">${fmtDate(r.submittedAt)}</td>
              <td><button class="btn secondary sm" onclick="resultDetailModal('${r._id}')">View</button></td>
            </tr>`).join('')}</tbody></table></div>
          <div class="pagination" id="h-pages"></div>` : emptyHtml('No attempts yet')}
      </div>`;
      renderPagination(document.getElementById('h-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
  };
  render();
}

async function renderAnnouncements(c) {
  c.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/announcements?limit=20');
    c.innerHTML = `<div class="card"><h3>📣 Announcements</h3>
      ${data.announcements.length ? data.announcements.map((a) => `
        <div style="padding:14px 4px;border-bottom:1px solid var(--border)">
          <strong>${esc(a.title)}</strong>
          <div style="font-size:.9rem;margin-top:6px;white-space:pre-wrap">${esc(a.body)}</div>
          <div class="hint">${fmtDate(a.createdAt)}</div>
        </div>`).join('') : emptyHtml('No announcements')}
    </div>`;
  } catch (err) { c.innerHTML = emptyHtml(apiError(err)); }
}
