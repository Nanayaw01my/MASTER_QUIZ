/* ============================================================
   Sections shared between the admin and teacher dashboards
   (question bank, quizzes, results, violations, profile)
   ============================================================ */

// ---------------------------------------------------------- Question bank
async function sectionQuestions(container) {
  container.innerHTML = loaderHtml;
  const { data: subj } = await API.get('/subjects?limit=100');
  const subjects = subj.subjects;
  let state = { page: 1, subject: '', search: '', difficulty: '' };

  const render = async () => {
    const list = document.getElementById('q-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/questions', { params: { page: state.page, subject: state.subject || undefined, search: state.search || undefined, difficulty: state.difficulty || undefined } });
      if (!data.questions.length) { list.innerHTML = emptyHtml('No questions found'); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Question</th><th>Subject</th><th>Type</th><th>Topic</th><th>Difficulty</th><th>Marks</th><th></th></tr></thead>
        <tbody>${data.questions.map((q) => `
          <tr>
            <td style="white-space:normal;max-width:340px">${esc(q.text.slice(0, 90))}${q.text.length > 90 ? '…' : ''}</td>
            <td>${esc(q.subject?.code || '')}</td>
            <td><span class="badge blue">${esc(q.type)}</span></td>
            <td>${esc(q.topic)}</td>
            <td><span class="badge ${q.difficulty === 'hard' ? 'red' : q.difficulty === 'easy' ? 'green' : 'amber'}">${esc(q.difficulty)}</span></td>
            <td>${q.marks}</td>
            <td>
              <button class="btn secondary sm" onclick='questionModal(${attrJson(q)})'>Edit</button>
              <button class="btn danger sm" onclick="deleteQuestion('${q._id}')">Del</button>
            </td>
          </tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="q-pages"></div>`;
      renderPagination(document.getElementById('q-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };

  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="q-subject"><option value="">All subjects</option>${subjects.map((s) => `<option value="${s._id}">${esc(s.name)}</option>`).join('')}</select>
        <select id="q-diff"><option value="">Any difficulty</option><option>easy</option><option>medium</option><option>hard</option></select>
        <input id="q-search" placeholder="Search questions…">
        <span class="spacer"></span>
        <button class="btn secondary" id="q-import">Import CSV</button>
        <button class="btn secondary" id="q-export">Export CSV</button>
        <button class="btn" id="q-new">+ New Question</button>
      </div>
      <div id="q-list"></div>
    </div>`;

  document.getElementById('q-subject').onchange = (e) => { state.subject = e.target.value; state.page = 1; render(); };
  document.getElementById('q-diff').onchange = (e) => { state.difficulty = e.target.value; state.page = 1; render(); };
  let deb;
  document.getElementById('q-search').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.search = e.target.value; state.page = 1; render(); }, 400); };
  document.getElementById('q-new').onclick = () => questionModal(null, subjects, render);
  document.getElementById('q-export').onclick = () => downloadCsv(`/api/questions/export${state.subject ? `?subject=${state.subject}` : ''}`, 'questions.csv');
  document.getElementById('q-import').onclick = () => importQuestionsModal(subjects, render);

  window._qSubjects = subjects; // for edit modal
  window._qRefresh = render;
  render();
}

function questionModal(qJson, subjects = window._qSubjects, refresh = window._qRefresh) {
  const q = qJson ? JSON.parse(qJson) : null;
  const m = openModal(`
    <h2>${q ? 'Edit' : 'New'} Question</h2>
    <div class="form-row">
      <div class="form-group"><label>Subject</label>
        <select id="qm-subject">${subjects.map((s) => `<option value="${s._id}" ${q && (q.subject?._id || q.subject) === s._id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Type</label>
        <select id="qm-type">
          <option value="mcq" ${q?.type === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
          <option value="truefalse" ${q?.type === 'truefalse' ? 'selected' : ''}>True / False</option>
          <option value="fillblank" ${q?.type === 'fillblank' ? 'selected' : ''}>Fill in the Blank</option>
        </select></div>
    </div>
    <div class="form-group"><label>Question text</label><textarea id="qm-text" rows="3">${esc(q?.text || '')}</textarea></div>
    <div id="qm-options-wrap">
      ${[0, 1, 2, 3].map((i) => `<div class="form-group"><label>Option ${String.fromCharCode(65 + i)}${i > 1 ? ' (optional)' : ''}</label><input id="qm-opt${i}" value="${esc(q?.options?.[i] || '')}"></div>`).join('')}
    </div>
    <div class="form-group"><label>Correct answer</label><input id="qm-answer" value="${esc(q?.correctAnswer || '')}"><div class="hint">MCQ: must exactly match one option. True/False: True or False. Fill-blank: expected text.</div></div>
    <div class="form-row">
      <div class="form-group"><label>Topic</label><input id="qm-topic" value="${esc(q?.topic || 'General')}"></div>
      <div class="form-group"><label>Difficulty</label>
        <select id="qm-diff"><option ${q?.difficulty === 'easy' ? 'selected' : ''}>easy</option><option ${!q || q.difficulty === 'medium' ? 'selected' : ''}>medium</option><option ${q?.difficulty === 'hard' ? 'selected' : ''}>hard</option></select></div>
    </div>
    <div class="form-group"><label>Marks</label><input type="number" id="qm-marks" min="0.5" step="0.5" value="${q?.marks || 1}"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="qm-save">${q ? 'Update' : 'Create'}</button>
    </div>`, { wide: true });

  const typeSel = m.querySelector('#qm-type');
  const optsWrap = m.querySelector('#qm-options-wrap');
  const syncType = () => { optsWrap.style.display = typeSel.value === 'mcq' ? 'block' : 'none'; };
  typeSel.onchange = syncType;
  syncType();

  m.querySelector('#qm-save').onclick = async () => {
    const body = {
      subject: m.querySelector('#qm-subject').value,
      type: typeSel.value,
      text: m.querySelector('#qm-text').value.trim(),
      options: [0, 1, 2, 3].map((i) => m.querySelector(`#qm-opt${i}`).value.trim()).filter(Boolean),
      correctAnswer: m.querySelector('#qm-answer').value.trim(),
      topic: m.querySelector('#qm-topic').value.trim(),
      difficulty: m.querySelector('#qm-diff').value,
      marks: Number(m.querySelector('#qm-marks').value) || 1,
    };
    try {
      if (q) await API.put(`/questions/${q._id}`, body);
      else await API.post('/questions', body);
      toast(`Question ${q ? 'updated' : 'created'}`, 'success');
      closeModal();
      refresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function deleteQuestion(id) {
  if (!(await confirmModal('Delete this question permanently?'))) return;
  try {
    await API.delete(`/questions/${id}`);
    toast('Question deleted', 'success');
    window._qRefresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

function importQuestionsModal(subjects, refresh) {
  const m = openModal(`
    <h2>Import Questions (CSV)</h2>
    <p class="hint" style="margin-bottom:12px">Columns: <code>type,text,optionA,optionB,optionC,optionD,correctAnswer,topic,difficulty,marks</code></p>
    <div class="form-group"><label>Target subject</label>
      <select id="im-subject">${subjects.map((s) => `<option value="${s._id}">${esc(s.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label>CSV file</label><input type="file" id="im-file" accept=".csv"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="im-go">Import</button>
    </div>`);
  m.querySelector('#im-go').onclick = async () => {
    const file = m.querySelector('#im-file').files[0];
    if (!file) return toast('Choose a CSV file', 'warning');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await API.post(`/questions/import?subject=${m.querySelector('#im-subject').value}`, fd);
      toast(`Imported ${data.imported} questions${data.failed ? `, ${data.failed} failed` : ''}`, data.failed ? 'warning' : 'success', 6000);
      if (data.errors?.length) console.warn('Import errors:', data.errors);
      closeModal();
      refresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function downloadCsv(url, filename) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${Auth.token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------------------------------------------------------- Quizzes (manage)
async function sectionQuizzes(container) {
  container.innerHTML = loaderHtml;
  const [{ data: subj }, { data: cls }] = await Promise.all([API.get('/subjects?limit=100'), API.get('/classes')]);
  const subjects = subj.subjects, classes = cls.classes;
  let state = { page: 1 };

  const render = async () => {
    const list = document.getElementById('quiz-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/quizzes', { params: { page: state.page } });
      if (!data.quizzes.length) { list.innerHTML = emptyHtml('No quizzes yet — create one!'); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Subject</th><th>Class</th><th>Questions</th><th>Duration</th><th>Window</th><th>Status</th><th></th></tr></thead>
        <tbody>${data.quizzes.map((z) => `
          <tr>
            <td>${esc(z.title)}</td>
            <td>${esc(z.subject?.code || '')}</td>
            <td>${esc(z.classRef?.name || '')}</td>
            <td>${z.questionTotal ?? '-'}</td>
            <td>${z.duration}m</td>
            <td style="font-size:.78rem">${fmtDate(z.startDate)}<br>→ ${fmtDate(z.endDate)}</td>
            <td><span class="badge ${z.status === 'published' ? 'green' : z.status === 'draft' ? 'amber' : 'gray'}">${esc(z.status)}</span></td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              ${z.status === 'draft' ? `<button class="btn success sm" onclick="publishQuiz('${z._id}')">Publish</button>` : ''}
              <button class="btn secondary sm" onclick="quizModal('${z._id}')">Edit</button>
              <button class="btn secondary sm" onclick="leaderboardModal('${z._id}')">Board</button>
              <button class="btn danger sm" onclick="deleteQuiz('${z._id}')">Del</button>
            </td>
          </tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="quiz-pages"></div>`;
      renderPagination(document.getElementById('quiz-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };

  container.innerHTML = `
    <div class="card">
      <div class="toolbar"><h3 style="margin:0">Quizzes</h3><span class="spacer"></span><button class="btn" id="quiz-new">+ Create Quiz</button></div>
      <div id="quiz-list"></div>
    </div>`;
  document.getElementById('quiz-new').onclick = () => quizModal(null);

  window._quizCtx = { subjects, classes, refresh: render };
  render();
}

async function quizModal(quizId) {
  const { subjects, classes, refresh } = window._quizCtx;
  let quiz = null;
  if (quizId) {
    const { data } = await API.get(`/quizzes/${quizId}`);
    quiz = data.quiz;
  }
  const dt = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const s = quiz?.settings || {};

  const m = openModal(`
    <h2>${quiz ? 'Edit' : 'Create'} Quiz</h2>
    <div class="form-group"><label>Title</label><input id="z-title" value="${esc(quiz?.title || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Subject</label>
        <select id="z-subject">${subjects.map((x) => `<option value="${x._id}" ${quiz && (quiz.subject?._id || quiz.subject) === x._id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Class</label>
        <select id="z-class">${classes.map((x) => `<option value="${x._id}" ${quiz && (quiz.classRef?._id || quiz.classRef) === x._id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Duration (minutes)</label><input type="number" id="z-duration" min="1" value="${quiz?.duration || 30}"></div>
      <div class="form-group"><label>Pass mark (%)</label><input type="number" id="z-pass" min="0" max="100" value="${quiz?.passMark ?? 50}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start date</label><input type="datetime-local" id="z-start" value="${dt(quiz?.startDate)}"></div>
      <div class="form-group"><label>End date</label><input type="datetime-local" id="z-end" value="${dt(quiz?.endDate)}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Max attempts</label><input type="number" id="z-attempts" min="1" value="${quiz?.maxAttempts || 1}"></div>
      <div class="form-group"><label>Questions to serve (0 = all)</label><input type="number" id="z-count" min="0" value="${quiz?.questionCount || 0}"></div>
    </div>
    <div class="form-row">
      <div class="checkbox-row"><input type="checkbox" id="z-rq" ${!quiz || quiz.randomizeQuestions ? 'checked' : ''}><label for="z-rq">Randomize questions</label></div>
      <div class="checkbox-row"><input type="checkbox" id="z-ro" ${!quiz || quiz.randomizeOptions ? 'checked' : ''}><label for="z-ro">Randomize options</label></div>
    </div>
    <div class="form-row" style="margin-top:8px">
      <div class="checkbox-row"><input type="checkbox" id="z-resume" ${s.allowResume ? 'checked' : ''}><label for="z-resume">Allow resume after disconnect</label></div>
      <div class="checkbox-row"><input type="checkbox" id="z-review" ${s.showReview !== false ? 'checked' : ''}><label for="z-review">Show answers in review</label></div>
    </div>
    <div class="form-row" style="margin-top:8px">
      <div class="checkbox-row"><input type="checkbox" id="z-proctor" ${s.requireProctoring !== false ? 'checked' : ''}><label for="z-proctor">Require AI proctoring</label></div>
      <div class="form-group"><label>Warning limit before auto-submit</label><input type="number" id="z-warn" min="1" value="${s.warningLimit || 3}"></div>
    </div>
    <div class="form-group">
      <label>Questions</label>
      <div id="z-qpick" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">${loaderHtml}</div>
      <div class="hint"><span id="z-qcount">0</span> selected</div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="z-save">${quiz ? 'Update' : 'Create'}</button>
    </div>`, { wide: true });

  const selected = new Set((quiz?.questions || []).map((q) => q._id || q));
  const loadQuestions = async () => {
    const subjectId = m.querySelector('#z-subject').value;
    const box = m.querySelector('#z-qpick');
    box.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/questions', { params: { subject: subjectId, limit: 100 } });
      box.innerHTML = data.questions.length
        ? data.questions.map((q) => `
          <div class="checkbox-row" style="margin-bottom:6px">
            <input type="checkbox" class="z-q" value="${q._id}" ${selected.has(q._id) ? 'checked' : ''}>
            <label style="font-size:.85rem">${esc(q.text.slice(0, 80))} <span class="badge gray">${esc(q.type)}</span></label>
          </div>`).join('')
        : '<div class="empty">No questions in this subject yet</div>';
      box.querySelectorAll('.z-q').forEach((cb) => {
        cb.onchange = () => { cb.checked ? selected.add(cb.value) : selected.delete(cb.value); count(); };
      });
      count();
    } catch (err) { box.innerHTML = emptyHtml(apiError(err)); }
  };
  const count = () => { m.querySelector('#z-qcount').textContent = selected.size; };
  m.querySelector('#z-subject').onchange = () => { selected.clear(); loadQuestions(); };
  loadQuestions();

  m.querySelector('#z-save').onclick = async () => {
    const body = {
      title: m.querySelector('#z-title').value.trim(),
      subject: m.querySelector('#z-subject').value,
      classRef: m.querySelector('#z-class').value,
      duration: Number(m.querySelector('#z-duration').value),
      passMark: Number(m.querySelector('#z-pass').value),
      startDate: m.querySelector('#z-start').value,
      endDate: m.querySelector('#z-end').value,
      maxAttempts: Number(m.querySelector('#z-attempts').value),
      questionCount: Number(m.querySelector('#z-count').value),
      randomizeQuestions: m.querySelector('#z-rq').checked,
      randomizeOptions: m.querySelector('#z-ro').checked,
      questions: [...selected],
      settings: {
        allowResume: m.querySelector('#z-resume').checked,
        showReview: m.querySelector('#z-review').checked,
        requireProctoring: m.querySelector('#z-proctor').checked,
        warningLimit: Number(m.querySelector('#z-warn').value) || 3,
      },
    };
    if (!body.title || !body.startDate || !body.endDate) return toast('Title, start and end dates are required', 'warning');
    try {
      if (quiz) await API.put(`/quizzes/${quiz._id}`, body);
      else await API.post('/quizzes', body);
      toast(`Quiz ${quiz ? 'updated' : 'created'}`, 'success');
      closeModal();
      refresh();
    } catch (err) { toast(apiError(err), 'error'); }
  };
}

async function publishQuiz(id) {
  try {
    await API.patch(`/quizzes/${id}/publish`);
    toast('Quiz published — students have been notified', 'success');
    window._quizCtx.refresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

async function deleteQuiz(id) {
  if (!(await confirmModal('Delete this quiz?'))) return;
  try {
    await API.delete(`/quizzes/${id}`);
    toast('Quiz deleted', 'success');
    window._quizCtx.refresh();
  } catch (err) { toast(apiError(err), 'error'); }
}

async function leaderboardModal(quizId) {
  try {
    const { data } = await API.get(`/attempts/leaderboard/${quizId}`);
    openModal(`
      <h2>🏆 Leaderboard</h2>
      ${data.leaderboard.length ? `<div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Student</th><th>Best %</th><th>Attempts</th></tr></thead>
        <tbody>${data.leaderboard.map((r, i) => `
          <tr><td>${i + 1}</td><td>${esc(r.student.name)} ${r.student.regNumber ? `<span class="hint">(${esc(r.student.regNumber)})</span>` : ''}</td>
          <td><strong>${r.best}%</strong></td><td>${r.attempts}</td></tr>`).join('')}</tbody></table></div>` : emptyHtml('No attempts yet')}
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Close</button></div>`);
  } catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Results
async function sectionResults(container, { exportable = true } = {}) {
  let state = { page: 1 };
  const render = async () => {
    const list = document.getElementById('r-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/attempts/results', { params: { page: state.page } });
      if (!data.results.length) { list.innerHTML = emptyHtml('No results yet'); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Quiz</th><th>Subject</th><th>Score</th><th>%</th><th>Grade</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
        <tbody>${data.results.map((r) => `
          <tr>
            <td>${esc(r.student?.name || '-')}</td>
            <td>${esc(r.quiz?.title || '-')}</td>
            <td>${esc(r.quiz?.subject?.code || '-')}</td>
            <td>${r.score}/${r.totalMarks}</td>
            <td><strong>${r.percentage}%</strong></td>
            <td><span class="badge ${r.passed ? 'green' : 'red'}">${esc(r.grade)}</span></td>
            <td><span class="badge ${r.status === 'auto-submitted' ? 'red' : 'blue'}">${esc(r.status)}</span>${r.submitReason && r.submitReason !== 'completed' ? `<div class="hint">${esc(r.submitReason)}</div>` : ''}</td>
            <td style="font-size:.8rem">${fmtDate(r.submittedAt)}</td>
            <td><button class="btn secondary sm" onclick="resultDetailModal('${r._id}')">View</button></td>
          </tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="r-pages"></div>`;
      renderPagination(document.getElementById('r-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };

  container.innerHTML = `
    <div class="card">
      <div class="toolbar"><h3 style="margin:0">Results</h3><span class="spacer"></span>
        ${exportable ? '<button class="btn secondary" id="r-export">Export CSV</button>' : ''}</div>
      <div id="r-list"></div>
    </div>`;
  if (exportable) document.getElementById('r-export').onclick = () => downloadCsv('/api/attempts/results/export/csv', 'results.csv');
  render();
}

async function resultDetailModal(id) {
  try {
    const { data } = await API.get(`/attempts/results/${id}`);
    const r = data.result;
    openModal(`
      <h2>Result — ${esc(r.quiz?.title || '')}</h2>
      <div class="grid cols-4" style="margin-bottom:14px">
        <div class="stat"><div><div class="value">${r.percentage}%</div><div class="label">Score (${r.score}/${r.totalMarks})</div></div></div>
        <div class="stat"><div><div class="value">${esc(r.grade)}</div><div class="label">${r.passed ? 'Passed' : 'Failed'}</div></div></div>
        <div class="stat"><div><div class="value">#${data.rank || '-'}</div><div class="label">Rank of ${data.totalStudents}</div></div></div>
        <div class="stat"><div><div class="value">${fmtDur(r.timeTaken)}</div><div class="label">Time taken</div></div></div>
      </div>
      ${r.faceImageStart?.url || r.faceImageEnd?.url ? `
        <div style="display:flex;gap:12px;margin-bottom:14px">
          ${r.faceImageStart?.url ? `<div><div class="hint">Start verification</div><img src="${esc(r.faceImageStart.url)}" style="width:120px;border-radius:8px"></div>` : ''}
          ${r.faceImageEnd?.url ? `<div><div class="hint">End verification</div><img src="${esc(r.faceImageEnd.url)}" style="width:120px;border-radius:8px"></div>` : ''}
        </div>` : ''}
      <div class="table-wrap" style="max-height:320px;overflow-y:auto"><table>
        <thead><tr><th>Question</th><th>Answer</th><th>Correct</th></tr></thead>
        <tbody>${(r.answers || []).map((a) => `
          <tr>
            <td style="white-space:normal;max-width:300px">${esc(a.question?.text?.slice(0, 100) || '-')}</td>
            <td>${esc(a.answer || '—')}${a.question?.correctAnswer && !a.correct ? `<div class="hint">Correct: ${esc(a.question.correctAnswer)}</div>` : ''}</td>
            <td>${a.correct ? '<span class="badge green">✓</span>' : '<span class="badge red">✗</span>'}</td>
          </tr>`).join('')}</tbody></table></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="window.print()">Print / PDF</button>
        <button class="btn" onclick="closeModal()">Close</button>
      </div>`, { wide: true });
  } catch (err) { toast(apiError(err), 'error'); }
}

// ---------------------------------------------------------- Violations
async function sectionViolations(container) {
  let state = { page: 1 };
  const render = async () => {
    const list = document.getElementById('v-list');
    list.innerHTML = loaderHtml;
    try {
      const { data } = await API.get('/violations', { params: { page: state.page } });
      if (!data.violations.length) { list.innerHTML = emptyHtml('No violations recorded 🎉'); return; }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Quiz</th><th>Type</th><th>Details</th><th>When</th></tr></thead>
        <tbody>${data.violations.map((v) => `
          <tr>
            <td>${esc(v.student?.name || '-')}</td>
            <td>${esc(v.quiz?.title || '-')}</td>
            <td><span class="badge red">${esc(v.type)}</span></td>
            <td style="white-space:normal">${esc(v.details || '')}</td>
            <td style="font-size:.8rem">${fmtDate(v.occurredAt)}</td>
          </tr>`).join('')}</tbody></table></div>
        <div class="pagination" id="v-pages"></div>`;
      renderPagination(document.getElementById('v-pages'), data.page, data.pages, (p) => { state.page = p; render(); });
    } catch (err) { list.innerHTML = emptyHtml(apiError(err)); }
  };
  container.innerHTML = `<div class="card"><h3>⚠️ Proctoring Violations</h3><div id="v-list"></div></div>`;
  render();
}

// ---------------------------------------------------------- Profile
async function sectionProfile(container) {
  container.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/auth/me');
    const u = data.user;
    Auth.user = { ...Auth.user, ...u };
    container.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <h3>Profile</h3>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
            <span class="avatar" style="width:64px;height:64px;font-size:1.4rem" id="pf-avatar">
              ${u.profileImage ? `<img src="${esc(u.profileImage)}">` : esc(u.name[0])}</span>
            <div>
              <input type="file" id="pf-file" accept="image/*" style="display:none">
              <button class="btn secondary sm" onclick="document.getElementById('pf-file').click()">Change photo</button>
            </div>
          </div>
          <div class="form-group"><label>Name</label><input id="pf-name" value="${esc(u.name)}"></div>
          <div class="form-group"><label>Email</label><input value="${esc(u.email)}" disabled></div>
          <div class="form-group"><label>Phone</label><input id="pf-phone" value="${esc(u.phone || '')}"></div>
          <button class="btn" id="pf-save">Save Profile</button>
        </div>
        <div class="card">
          <h3>Change Password</h3>
          <div class="form-group"><label>Current password</label><input type="password" id="pw-cur"></div>
          <div class="form-group"><label>New password</label><input type="password" id="pw-new"></div>
          <div class="form-group"><label>Confirm new password</label><input type="password" id="pw-conf"></div>
          <button class="btn" id="pw-save">Update Password</button>
        </div>
      </div>`;

    document.getElementById('pf-save').onclick = async () => {
      try {
        const { data: d } = await API.put('/auth/profile', {
          name: document.getElementById('pf-name').value.trim(),
          phone: document.getElementById('pf-phone').value.trim(),
        });
        Auth.user = { ...Auth.user, ...d.user };
        toast('Profile updated', 'success');
      } catch (err) { toast(apiError(err), 'error'); }
    };

    document.getElementById('pf-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('image', file);
      try {
        const { data: d } = await API.put('/auth/profile/picture', fd);
        document.getElementById('pf-avatar').innerHTML = `<img src="${esc(d.profileImage)}">`;
        Auth.user = { ...Auth.user, profileImage: d.profileImage };
        toast('Photo updated', 'success');
      } catch (err) { toast(apiError(err), 'error'); }
    };

    document.getElementById('pw-save').onclick = async () => {
      const cur = document.getElementById('pw-cur').value;
      const nw = document.getElementById('pw-new').value;
      if (nw !== document.getElementById('pw-conf').value) return toast('Passwords do not match', 'warning');
      try {
        await API.put('/auth/password', { currentPassword: cur, newPassword: nw });
        toast('Password updated', 'success');
        ['pw-cur', 'pw-new', 'pw-conf'].forEach((id) => (document.getElementById(id).value = ''));
      } catch (err) { toast(apiError(err), 'error'); }
    };
  } catch (err) { container.innerHTML = emptyHtml(apiError(err)); }
}

// ---------------------------------------------------------- Analytics charts
let _charts = [];
function destroyCharts() { _charts.forEach((c) => c.destroy()); _charts = []; }

async function sectionAnalytics(container, { showTop = true } = {}) {
  container.innerHTML = loaderHtml;
  try {
    const [ov, sub, mon, top] = await Promise.all([
      API.get('/analytics/overview'),
      API.get('/analytics/subjects'),
      API.get('/analytics/monthly'),
      showTop ? API.get('/analytics/top-students') : Promise.resolve({ data: { students: [] } }),
    ]);
    const o = ov.data.overview;
    destroyCharts();
    container.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="icon">📊</div><div><div class="value">${o.avgScore}%</div><div class="label">Average Score</div></div></div>
        <div class="stat"><div class="icon">📝</div><div><div class="value">${o.totalAttempts}</div><div class="label">Total Attempts</div></div></div>
        <div class="stat"><div class="icon">✅</div><div><div class="value">${o.passRate}%</div><div class="label">Pass Rate</div></div></div>
        <div class="stat"><div class="icon">❌</div><div><div class="value">${o.failRate}%</div><div class="label">Fail Rate</div></div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>Subject Performance</h3><div class="chart-box"><canvas id="ch-subjects"></canvas></div></div>
        <div class="card"><h3>Monthly Activity</h3><div class="chart-box"><canvas id="ch-monthly"></canvas></div></div>
      </div>
      ${showTop ? `<div class="card"><h3>🏆 Top Students</h3><div id="top-students">${
        top.data.students.length ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Student</th><th>Avg %</th><th>Attempts</th></tr></thead>
          <tbody>${top.data.students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.student.name)}</td><td><strong>${s.avgScore}%</strong></td><td>${s.attempts}</td></tr>`).join('')}</tbody>
        </table></div>` : emptyHtml('No data yet')
      }</div></div>` : ''}`;

    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--text-muted');
    Chart.defaults.borderColor = css.getPropertyValue('--border');
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    const subjects = sub.data.subjects;
    _charts.push(new Chart(document.getElementById('ch-subjects'), {
      type: 'bar',
      data: {
        labels: subjects.map((s) => s.subject),
        datasets: [
          { label: 'Avg Score %', data: subjects.map((s) => s.avgScore), backgroundColor: 'rgba(250,204,21,0.85)', borderRadius: 8 },
          { label: 'Pass Rate %', data: subjects.map((s) => s.passRate), backgroundColor: 'rgba(34,197,94,0.55)', borderRadius: 8 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    }));
    const monthly = mon.data.monthly;
    _charts.push(new Chart(document.getElementById('ch-monthly'), {
      type: 'line',
      data: {
        labels: monthly.map((mm) => mm.month),
        datasets: [
          { label: 'Attempts', data: monthly.map((mm) => mm.attempts), borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,0.14)', fill: true, tension: 0.4, pointBackgroundColor: '#facc15' },
          { label: 'Avg Score %', data: monthly.map((mm) => mm.avgScore), borderColor: '#f59e0b', tension: 0.4, pointBackgroundColor: '#f59e0b' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    }));
  } catch (err) { container.innerHTML = emptyHtml(apiError(err)); }
}
