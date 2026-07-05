# 🎓 Quiz Master

AI-powered online examination and quiz management system with webcam proctoring,
face verification and anti-cheating enforcement.

**Stack:** Node.js · Express · MongoDB (Mongoose) · JWT · Cloudinary · Vanilla JS + Chart.js · face-api.js · TensorFlow.js (COCO-SSD)

---

## Features

### Roles
| Role | Capabilities |
|------|--------------|
| **Admin** | Manage teachers, students, subjects, classes, departments, quizzes, questions, results, violations, announcements, audit logs. Suspend users, reset passwords, view platform analytics. |
| **Teacher** | Only their assigned subjects: question bank (CRUD + CSV import/export), quiz creation/scheduling, results, leaderboards, violation reports, analytics. |
| **Student** | Take proctored quizzes, view own results & performance charts, notifications, profile. |

### AI Proctoring (during exams)
- **Face verification before start** — webcam photo captured, stored in Cloudinary; face descriptor matched server-side against the student's stored reference (first verification enrolls the reference).
- **Continuous face detection** — exactly one face required; warnings for no face / multiple faces / face outside the circular guide; auto-submit after the quiz's warning limit.
- **Phone detection** — TensorFlow.js COCO-SSD watches the webcam feed for mobile phones.
- **Tab switch / window blur / minimize** — instant auto-submit (server enforced).
- **Camera disconnect or block** — instant auto-submit.
- **Fullscreen enforcement** — exit triggers warnings, repeats auto-submit.
- **End verification photo** — second capture on submit; both images saved to the attempt.
- Every violation is timestamped in MongoDB and visible to the subject's teacher and admins; auto-submits raise cheating alerts.

### Exam engine
- Server-side randomization of questions & options; correct answers **never leave the server** during an exam.
- Server-side scoring, grading (A–F), pass/fail, time-taken, rank and leaderboards.
- Auto-save answers; optional resume after network interruption (per-quiz setting).
- Attempt limits, scheduling windows, per-quiz pass mark and warning limit.
- Multiple sessions blocked — a second login during an exam forfeits the open attempt.

### Security
JWT access tokens (15 min) + httpOnly refresh cookie · bcrypt password hashing ·
role authorization middleware · rate limiting (tighter on auth routes) · Helmet ·
CORS · NoSQL-injection sanitization · HTML-escaped rendering (XSS) · account suspension ·
audit logs.

---

## Project structure

```
├── client/               # static frontend (served by Express)
│   ├── index.html        # login / forgot password
│   ├── admin.html        # admin SPA dashboard
│   ├── teacher.html      # teacher SPA dashboard
│   ├── student.html      # student SPA dashboard
│   ├── quiz.html         # proctored exam page
│   ├── css/styles.css    # theme (light + dark)
│   └── js/               # api client, UI kit, dashboards, proctoring engine
├── server/
│   ├── config/           # db + cloudinary
│   ├── controllers/      # business logic
│   ├── middleware/       # auth, roles, uploads, errors
│   ├── models/           # Mongoose schemas
│   ├── routes/           # REST API routes
│   └── utils/            # helpers, csv, tokens, seed
├── render.yaml           # Render blueprint
└── package.json
```

---

## Local setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env      # then edit values (Mongo URI, JWT secrets, Cloudinary)

# 3. Create the default admin
npm run seed

# 4. Run
npm run dev               # or: npm start
# open http://localhost:5000
```

Login with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`, then:
1. Create **Departments** → **Classes** → **Subjects** (assign classes + teachers).
2. Register **Teachers** (assign subjects) and **Students** (assign a class).
3. Teacher adds questions (or CSV import) → creates a quiz → **Publish**.
4. Students in that class see the quiz and take it under proctoring.

### CSV question import format
```
type,text,optionA,optionB,optionC,optionD,correctAnswer,topic,difficulty,marks
mcq,What is 2+2?,2,3,4,5,4,Arithmetic,easy,1
truefalse,The sky is blue.,,,,,True,Nature,easy,1
fillblank,Capital of Ghana?,,,,,Accra,Geography,medium,2
```

---

## Deploy to Render (from GitHub)

1. Push this repo to GitHub.
2. **MongoDB Atlas**: create a cluster + database user. In **Network Access** add
   `0.0.0.0/0` (Render's outbound IPs are dynamic).
3. **Cloudinary**: grab cloud name, API key and secret from your dashboard.
4. On Render: **New → Blueprint** (uses `render.yaml`), or **New → Web Service** with
   *Build* `npm install` and *Start* `npm start`.
5. Set environment variables:
   `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`.
6. After the first deploy, run the seed once from Render **Shell**: `npm run seed`.

> ⚠️ Never commit `.env` or paste connection strings/tokens into code, chats or issues.
> Rotate any credential that has ever been shared.

### Exam page requirements
Quizzes must be taken on a **desktop/laptop with a webcam** over **HTTPS**
(the browser blocks camera access on insecure origins — Render provides HTTPS automatically).

---

## API overview

| Area | Base path |
|------|-----------|
| Auth (login, refresh, profile, passwords) | `/api/auth` |
| Admin (users, departments, dashboard, logs) | `/api/admin` |
| Classes / Subjects | `/api/classes`, `/api/subjects` |
| Questions (+ CSV import/export) | `/api/questions` |
| Quizzes (+ publish) | `/api/quizzes` |
| Attempts (exam flow, results, leaderboard, CSV export) | `/api/attempts` |
| Violations | `/api/violations` |
| Notifications / Announcements | `/api/notifications`, `/api/announcements` |
| Analytics | `/api/analytics` |
| Health check | `/api/health` |

All endpoints return `{ success, ... }` JSON and require `Authorization: Bearer <token>`
unless noted. Role checks are enforced server-side on every route.
