/* ============================================================
   Quiz Master - Exam runner (proctored quiz taking)
   ============================================================ */
requireRole('student');

const quizId = new URLSearchParams(location.search).get('quiz');
if (!quizId) location.href = '/student.html';

const $ = (id) => document.getElementById(id);

let attempt = null;       // served attempt from the API
let current = 0;          // current question index
let answers = {};         // questionId -> answer
let timerInt = null;
let submitted = false;
let examStarted = false;
let warningCount = 0;
let warningLimit = 3;
let fullscreenExits = 0;

// Fullscreen enforcement only applies where the browser supports it.
// iOS Safari has no Fullscreen API for page elements, so we skip it there
// rather than falsely auto-submitting phone/tablet students.
const fsRequest = document.documentElement.requestFullscreen
  || document.documentElement.webkitRequestFullscreen;
const fullscreenSupported = !!fsRequest;
let fullscreenEngaged = false;
const enterFullscreen = async () => {
  if (!fullscreenSupported) return;
  try { await fsRequest.call(document.documentElement); fullscreenEngaged = true; } catch { /* user gesture needed */ }
};

// ------------------------------------------------------------ Pre-check
(async function precheck() {
  try {
    const { data } = await API.get(`/quizzes/${quizId}`);
    $('pc-quiz-title').textContent = `${data.quiz.title} — ${data.quiz.duration} minutes`;
  } catch (err) {
    $('pc-quiz-title').textContent = apiError(err);
    return;
  }

  try {
    // Start the model download and the camera prompt at the same time so the
    // models stream in while the student is granting camera permission.
    $('pc-status').textContent = 'Starting camera & loading AI…';
    const modelsReady = Proctor.loadModels((msg) => ($('pc-status').textContent = msg));
    await Proctor.startCamera($('pc-video'), $('pc-overlay'));
    $('pc-dot').classList.add('ok');
    await modelsReady; // resolves as soon as the fast face detector is ready

    // Live preview loop until the exam starts
    const previewLoop = setInterval(async () => {
      if (examStarted) return clearInterval(previewLoop);
      const { count, box } = await Proctor.detectFaces();
      if (count === 1 && Proctor.faceInCircle(box)) {
        Proctor.drawGuide('ok');
        $('pc-status').textContent = 'Face detected — you can start';
        $('pc-start').disabled = false;
      } else {
        Proctor.drawGuide(count > 1 ? 'none' : 'warn');
        $('pc-status').textContent =
          count === 0 ? 'No face detected — center your face in the circle'
          : count > 1 ? 'Multiple faces detected — only you may be visible'
          : 'Move your face inside the circle';
        $('pc-start').disabled = true;
      }
    }, 1200);
  } catch (err) {
    showPcError('Camera access is required to take this exam. Enable your webcam and reload the page.');
  }
})();

function showPcError(msg) {
  const el = $('pc-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ------------------------------------------------------------ Start exam
$('pc-start').onclick = async () => {
  $('pc-start').disabled = true;
  $('pc-start').textContent = 'Verifying…';
  try {
    // The identity models may still be finishing in the background
    await Proctor.ensureRecognition();
    // Final verification: exactly one face + capture photo + descriptor
    const det = await Proctor.detectFaces(true);
    if (det.count !== 1) throw new Error('Exactly one face must be visible to start');

    const { data } = await API.post('/attempts/start', {
      quizId,
      faceImage: Proctor.snapshot(),
      faceDescriptor: det.descriptor,
    });

    attempt = data.attempt;
    warningLimit = attempt.quiz.settings?.warningLimit || 3;
    (attempt.answers || []).forEach((a) => { if (a.answer) answers[a.question] = a.answer; });

    if (data.resumed) toast('Resuming your previous session', 'info');
    beginExam();
  } catch (err) {
    const msg = err.response ? apiError(err) : err.message;
    showPcError(msg);
    $('pc-start').disabled = false;
    $('pc-start').textContent = 'Verify Face & Start Exam';
  }
};

async function beginExam() {
  examStarted = true;
  $('precheck').style.display = 'none';
  $('exam').style.display = 'block';
  $('ex-title').textContent = attempt.quiz.title;

  // Fullscreen where supported (desktop + Android); skipped on iOS
  await enterFullscreen();

  Proctor.rebind($('ex-video'), $('ex-overlay'));
  $('ex-dot').classList.add('ok');
  Proctor.onEvent = handleProctorEvent;
  Proctor.startMonitoring();
  installAntiCheatListeners();

  startTimer();
  renderQnav();
  renderQuestion();
  updateWarningsUI();
}

// ------------------------------------------------------------ Timer
function startTimer() {
  const el = $('ex-timer');
  const tick = () => {
    const left = Math.max(0, Math.floor((new Date(attempt.endsAt) - Date.now()) / 1000));
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
    if (left <= 300) el.classList.add('low');
    if (left <= 0) {
      clearInterval(timerInt);
      submitExam('time-up', true);
    }
  };
  tick();
  timerInt = setInterval(tick, 1000);
}

// ------------------------------------------------------------ Questions UI
function renderQnav() {
  const nav = $('ex-qnav');
  nav.innerHTML = attempt.questions
    .map((q, i) => `<button data-i="${i}" class="${answers[q.id] ? 'answered' : ''} ${i === current ? 'current' : ''}">${i + 1}</button>`)
    .join('');
  nav.querySelectorAll('button').forEach((b) => (b.onclick = () => { current = Number(b.dataset.i); renderQuestion(); }));

  const done = attempt.questions.filter((q) => answers[q.id]).length;
  $('ex-progress').style.width = `${(done / attempt.questions.length) * 100}%`;
  $('ex-progress-label').textContent = `${done}/${attempt.questions.length} answered`;
}

function renderQuestion() {
  const q = attempt.questions[current];
  const box = $('ex-question');
  const chosen = answers[q.id] || '';

  let body = '';
  if (q.type === 'fillblank') {
    body = `<input id="fb-answer" placeholder="Type your answer…" value="${esc(chosen)}" autocomplete="off">`;
  } else {
    const opts = q.type === 'truefalse' ? ['True', 'False'] : q.options;
    body = opts.map((o) => `
      <div class="option ${chosen === o ? 'selected' : ''}" data-val="${esc(o)}">
        <span>${esc(o)}</span>
      </div>`).join('');
  }

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="badge blue">Question ${current + 1} of ${attempt.questions.length}</span>
      <span class="badge gray">${q.marks} mark${q.marks > 1 ? 's' : ''}</span>
    </div>
    ${q.image ? `<img src="${esc(q.image)}" style="max-height:220px;border-radius:10px;margin-top:12px">` : ''}
    <div class="qtext">${esc(q.text)}</div>
    ${body}`;

  box.querySelectorAll('.option').forEach((el) => {
    el.onclick = () => saveAnswer(q.id, el.dataset.val);
  });
  const fb = box.querySelector('#fb-answer');
  if (fb) {
    let deb;
    fb.oninput = () => { clearTimeout(deb); deb = setTimeout(() => saveAnswer(q.id, fb.value.trim(), false), 600); };
  }
  renderQnav();
}

async function saveAnswer(qid, val, rerender = true) {
  answers[qid] = val;
  if (rerender) renderQuestion();
  else renderQnav();
  try {
    await API.patch(`/attempts/${attempt.id}/answer`, { questionId: qid, answer: val });
  } catch (err) {
    // Autosave failure is non-fatal; answers are re-sent on submit anyway via server state
    console.warn('Autosave failed:', apiError(err));
  }
}

$('ex-prev').onclick = () => { if (current > 0) { current--; renderQuestion(); } };
$('ex-next').onclick = () => { if (current < attempt.questions.length - 1) { current++; renderQuestion(); } };

// ------------------------------------------------------------ Anti-cheating
function installAntiCheatListeners() {
  // Tab switching / minimizing -> instant auto-submit (server enforced)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !submitted) reportViolation('tab-switch', 'Tab hidden / app switched');
  });
  window.addEventListener('blur', () => {
    if (!submitted && document.hidden) return; // visibilitychange already fired
    if (!submitted) reportViolation('window-blur', 'Window lost focus');
  });

  // Fullscreen exit -> warning, repeated -> auto-submit via warning limit.
  // Only enforced where fullscreen actually engaged (desktop/Android).
  if (fullscreenSupported) {
    const onFsChange = async () => {
      const inFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (submitted || inFs || !fullscreenEngaged) return;
      fullscreenExits += 1;
      await reportViolation('fullscreen-exit', `Exit #${fullscreenExits}`);
      if (!submitted) {
        showWarning('Return to fullscreen immediately!');
        enterFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  // Block context menu, copy, devtools-ish shortcuts (deterrent only)
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('copy', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && ['c', 'u', 'p', 's'].includes(e.key.toLowerCase())) || e.key === 'F12') e.preventDefault();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!submitted) { e.preventDefault(); e.returnValue = ''; }
  });
}

function handleProctorEvent(type, details) {
  if (!submitted) reportViolation(type, details);
}

async function reportViolation(type, details) {
  if (submitted) return;
  const labels = {
    'no-face': 'No face detected! Stay in front of the camera.',
    'multiple-faces': 'Multiple faces detected! Only you may be visible.',
    'phone-detected': 'Mobile phone detected! Put it away.',
    'face-outside-circle': 'Keep your face inside the circle.',
    'fullscreen-exit': 'Do not exit fullscreen.',
    'tab-switch': 'Tab switching is not allowed.',
    'window-blur': 'Window focus lost.',
    'camera-disconnected': 'Camera disconnected.',
    'camera-blocked': 'Camera blocked.',
  };
  // Capture webcam evidence for visual violations so staff can review it
  let snapshot;
  if (['phone-detected', 'multiple-faces', 'face-outside-circle'].includes(type)) {
    try { snapshot = Proctor.snapshot(); } catch { /* camera may be gone */ }
  }

  try {
    const { data } = await API.post('/violations', { attemptId: attempt.id, type, details, snapshot });
    warningCount = data.warnings ?? warningCount + 1;
    warningLimit = data.warningLimit ?? warningLimit;
    updateWarningsUI();
    if (data.autoSubmit) {
      finishAfterAutoSubmit(type);
    } else {
      showWarning(`⚠️ ${labels[type] || type} (Warning ${warningCount}/${warningLimit})`);
    }
  } catch (err) {
    // If reporting fails because the attempt is closed, stop the exam
    if (err.response?.status === 400 || err.response?.status === 404) finishAfterAutoSubmit(type);
  }
}

function showWarning(msg) {
  const b = $('warn-banner');
  b.textContent = msg;
  b.style.display = 'block';
  clearTimeout(showWarning._t);
  showWarning._t = setTimeout(() => (b.style.display = 'none'), 5000);
}

function updateWarningsUI() {
  $('ex-warnings').textContent = `Warnings: ${warningCount}/${warningLimit}`;
}

/** The server already auto-submitted the attempt - show the end screen. */
function finishAfterAutoSubmit(reason) {
  if (submitted) return;
  submitted = true;
  cleanupExam();
  showDone({
    title: '⛔ Exam Auto-Submitted',
    message: `Your exam was automatically submitted due to: ${reason.replace(/-/g, ' ')}.`,
    isViolation: true,
  });
}

// ------------------------------------------------------------ Submit
$('ex-submit').onclick = async () => {
  const unanswered = attempt.questions.filter((q) => !answers[q.id]).length;
  const ok = await new Promise((resolve) => {
    const m = openModal(`
      <h2>Submit exam?</h2>
      <p style="font-size:.9rem">${unanswered ? `You still have <strong>${unanswered}</strong> unanswered question(s).` : 'All questions answered.'}</p>
      <p style="font-size:.85rem;color:var(--text-muted);margin-top:8px">A final verification photo will be captured.</p>
      <div class="modal-actions">
        <button class="btn secondary" id="sm-no">Keep working</button>
        <button class="btn success" id="sm-yes">Submit now</button>
      </div>`);
    m.querySelector('#sm-no').onclick = () => { closeModal(); resolve(false); };
    m.querySelector('#sm-yes').onclick = () => { closeModal(); resolve(true); };
  });
  if (ok) submitExam('completed', false);
};

async function submitExam(reason, isAuto) {
  if (submitted) return;
  submitted = true;
  clearInterval(timerInt);

  let faceImage = null;
  try { faceImage = Proctor.snapshot(); } catch { /* camera may be gone */ }

  try {
    const { data } = await API.post(`/attempts/${attempt.id}/submit`, { reason, faceImage });
    cleanupExam();
    const r = data.result;
    showDone({
      title: r.passed ? '🎉 Exam Submitted' : 'Exam Submitted',
      message: '',
      result: r,
    });
  } catch (err) {
    cleanupExam();
    showDone({ title: 'Exam Closed', message: apiError(err), isViolation: true });
  }
}

function cleanupExam() {
  clearInterval(timerInt);
  Proctor.stop();
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) {
    exit.call(document).catch(() => {});
  }
}

function showDone({ title, message, result, isViolation }) {
  $('exam').style.display = 'none';
  $('precheck').style.display = 'none';
  $('done').style.display = 'block';
  $('done-card').innerHTML = `
    <h2 style="margin-bottom:10px">${title}</h2>
    ${message ? `<p style="color:${isViolation ? 'var(--danger)' : 'var(--text-muted)'};font-size:.92rem">${esc(message)}</p>` : ''}
    ${result ? `
      <div class="grid cols-2" style="margin-top:18px;text-align:left">
        <div class="stat"><div><div class="value">${result.percentage}%</div><div class="label">Score (${result.score}/${result.totalMarks})</div></div></div>
        <div class="stat"><div><div class="value">${esc(result.grade)}</div><div class="label">${result.passed ? '✅ Passed' : '❌ Failed'}</div></div></div>
      </div>` : ''}
    <button class="btn block" style="margin-top:22px" onclick="location.href='/student.html'">Back to Dashboard</button>`;
}
