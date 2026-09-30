import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const SUBJECTS = [
  { key: "physics", label: "Physics", icon: "⚡", color: "blue" },
  { key: "chemistry", label: "Chemistry", icon: "🧪", color: "green" },
  { key: "botony", label: "Botany", icon: "🌿", color: "teal" },
  { key: "zoology", label: "Zoology", icon: "🐾", color: "orange" },
];

const DEFAULT_DB = {
  tasks: [],
  dailyLog: {},
  questionLog: {},
  streakData: { currentStreak: 0, bestStreak: 0 },
  lastWeekQuestions: { physics: 0, chemistry: 0, botony: 0, zoology: 0, total: 0 },
};

function dateKey(date = new Date(), offset = 0) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOffset() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function totalQuestions(log = {}) {
  return SUBJECTS.reduce((total, subject) => total + (Number(log[subject.key]) || 0), 0);
}

function normalizeState(data) {
  return {
    syllabusList: data.syllabusList || [],
    db: {
      ...DEFAULT_DB,
      ...(data.db || {}),
      tasks: data.db?.tasks || [],
      dailyLog: data.db?.dailyLog || {},
      questionLog: data.db?.questionLog || {},
      streakData: { ...DEFAULT_DB.streakData, ...(data.db?.streakData || {}) },
      lastWeekQuestions: {
        ...DEFAULT_DB.lastWeekQuestions,
        ...(data.db?.lastWeekQuestions || {}),
      },
    },
  };
}

async function getState() {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error("Unable to load tracker data.");
  return normalizeState(await response.json());
}

async function persistState(db) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db),
  });
  if (!response.ok) throw new Error("Unable to save tracker data.");
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function App() {
  const [state, setState] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [activeView, setActiveView] = useState("dashboard");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getState().then(setState).catch((loadError) => setError(loadError.message));
  }, []);

  const updateDb = async (nextDb) => {
    setState((current) => ({ ...current, db: nextDb }));
    setSaving(true);
    setError("");
    try {
      await persistState(nextDb);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const db = state?.db || DEFAULT_DB;
  const today = dateKey();
  const selectedLog = db.questionLog[selectedDate] || {};
  const currentWeek = useMemo(() => {
    const totals = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
    for (let index = 0; index < 7; index += 1) {
      const log = db.questionLog[dateKey(new Date(), index - mondayOffset())] || {};
      SUBJECTS.forEach(({ key }) => { totals[key] += Number(log[key]) || 0; });
    }
    return { ...totals, total: totalQuestions(totals) };
  }, [db.questionLog]);

  if (!state) {
    return <main className="status-screen">{error || "Loading your study dashboard..."}</main>;
  }

  const saveQuestion = (subject, value) => {
    const nextLog = {
      ...(db.questionLog[today] || {}),
      [subject]: Math.max(0, Number(value) || 0),
    };
    updateDb({ ...db, questionLog: { ...db.questionLog, [today]: nextLog } });
  };

  const toggleTask = (taskId) => {
    const task = db.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const nextTasks = db.tasks.map((item) => (
      item.id === taskId
        ? { ...item, completed: !item.completed, completedOn: item.completed ? null : today }
        : item
    ));
    const nextDailyLog = { ...db.dailyLog };
    const amount = Number(task.hrs) || 0;
    nextDailyLog[today] = Math.max(0, (Number(nextDailyLog[today]) || 0) + (task.completed ? -amount : amount));
    updateDb({ ...db, tasks: nextTasks, dailyLog: nextDailyLog });
  };

  const updateProgress = async (chapterId, field, value) => {
    try {
      const payload = await apiRequest("/api/syllabus/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, field, value }),
      });
      setState((current) => ({ ...current, db: { ...current.db, syllabusProgress: payload.syllabusProgress } }));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const addCustomChapter = async (chapterData) => {
    const payload = await apiRequest("/api/syllabus/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chapterData),
    });
    setState((current) => ({
      ...current,
      syllabusList: [...current.syllabusList, payload.chapter],
      db: { ...current.db, customChapters: [...(current.db.customChapters || []), payload.chapter], syllabusProgress: payload.syllabusProgress },
    }));
  };

  const addMockTest = async (testData) => {
    const payload = await apiRequest("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testData),
    });
    setState((current) => ({ ...current, db: { ...current.db, mockTests: payload.mockTests } }));
  };

  const deleteMockTest = async (testId) => {
    const payload = await apiRequest(`/api/tests/${testId}`, { method: "DELETE" });
    setState((current) => ({ ...current, db: { ...current.db, mockTests: payload.mockTests } }));
  };

  const resetWeek = async () => {
    const payload = await apiRequest("/api/reset-week", { method: "POST" });
    setState((current) => ({ ...current, db: payload.db }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">NEET 2027 / study command center</p>
          <h1>Make today count.</h1>
        </div>
        <div className="topbar-status">{saving ? "Saving..." : "All progress saved"}</div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="view-nav" aria-label="Main navigation">
        {[
          ["dashboard", "Dashboard"],
          ["syllabus", "Syllabus"],
          ["tests", "Mock tests"],
          ["goals", "Study plan"],
          ["backup", "Backup"],
        ].map(([key, label]) => (
          <button className={activeView === key ? "active" : ""} key={key} onClick={() => setActiveView(key)}>
            {label}
          </button>
        ))}
      </nav>

      {activeView === "dashboard" && (
        <Dashboard
          db={db}
          today={today}
          selectedDate={selectedDate}
          selectedLog={selectedLog}
          currentWeek={currentWeek}
          onSelectDate={setSelectedDate}
          onSaveQuestion={saveQuestion}
          onToggleTask={toggleTask}
        />
      )}
      {activeView === "syllabus" && <SyllabusView chapters={state.syllabusList} progress={db.syllabusProgress || {}} onUpdate={updateProgress} onAddCustom={addCustomChapter} />}
      {activeView === "tests" && <TestsView tests={db.mockTests || []} onAdd={addMockTest} onDelete={deleteMockTest} />}
      {activeView === "goals" && <GoalsView db={db} today={today} onToggleTask={toggleTask} onUpdate={updateDb} />}
      {activeView === "backup" && <BackupView db={db} onReset={resetWeek} onImport={(imported) => updateDb(imported)} />}
    </div>
  );
}

function Dashboard({ db, today, selectedDate, selectedLog, currentWeek, onSelectDate, onSaveQuestion, onToggleTask }) {
  const todayLog = db.questionLog[today] || {};
  const selectedHours = Number(db.dailyLog[selectedDate]) || 0;
  const lastWeek = db.lastWeekQuestions || {};
  const progressMax = Math.max(currentWeek.total, Number(lastWeek.total) || 0, 1);
  const recentDays = Array.from({ length: 7 }, (_, index) => dateKey(new Date(), index - 6));
  const openTasks = db.tasks.filter((task) => !task.completed).slice(0, 4);

  return (
    <main>
      <section className="hero-grid">
        <div className="hero-panel">
          <p className="eyebrow">Focus window</p>
          <h2>Build the score<br /><em>one session at a time.</em></h2>
          <p className="hero-copy">Your study rhythm is already in motion. Keep the next useful action close.</p>
          <div className="hero-meta"><span>Today</span><strong>{formatDate(today)}</strong></div>
        </div>
        <div className="streak-panel">
          <div className="streak-orbit">🔥</div>
          <p className="eyebrow">Current streak</p>
          <strong className="streak-value">{Number(db.streakData.currentStreak) || 0}<small> days</small></strong>
          <p>Best: {Number(db.streakData.bestStreak) || 0} days</p>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="This week" value={currentWeek.total} suffix="questions" detail="Mon-Sun total" tone="blue" />
        <Metric label="Study time" value={`${Number(db.dailyLog[today]) || 0}h`} suffix="today" detail="Logged from goals" tone="green" />
        <Metric label="Selected day" value={totalQuestions(selectedLog)} suffix="questions" detail={formatDate(selectedDate)} tone="orange" />
      </section>

      <section className="content-grid">
        <div className="panel questions-panel">
          <div className="panel-heading"><div><p className="eyebrow">Daily input</p><h3>Questions solved today</h3></div><span className="live-dot">Live</span></div>
          <div className="subject-grid">
            {SUBJECTS.map((subject) => (
              <label className={`subject-input ${subject.color}`} key={subject.key}>
                <span>{subject.icon} {subject.label}</span>
                <input type="number" min="0" value={Number(todayLog[subject.key]) || 0} onChange={(event) => onSaveQuestion(subject.key, event.target.value)} />
              </label>
            ))}
          </div>
          <div className="week-compare">
            <div className="compare-heading"><span>This week</span><strong>{currentWeek.total}</strong></div>
            <div className="compare-track"><span style={{ width: `${Math.min((currentWeek.total / progressMax) * 100, 100)}%` }} /></div>
            <div className="compare-foot"><span>Last week: {Number(lastWeek.total) || 0}</span><span>{currentWeek.total >= (Number(lastWeek.total) || 0) ? "↑ Building momentum" : "Keep the rhythm"}</span></div>
          </div>
        </div>

        <div className="panel selected-panel">
          <div className="panel-heading"><div><p className="eyebrow">Look back</p><h3>Selected day</h3></div><input type="date" value={selectedDate} onChange={(event) => onSelectDate(event.target.value || today)} /></div>
          <p className="selected-date-label">{formatDate(selectedDate)}</p>
          <div className="selected-total"><strong>{totalQuestions(selectedLog)}</strong><span>questions solved</span><strong>{selectedHours}h</strong><span>study time</span></div>
          <div className="breakdown-list">
            {SUBJECTS.map((subject) => <div key={subject.key}><span>{subject.icon} {subject.label}</span><strong>{Number(selectedLog[subject.key]) || 0}</strong></div>)}
          </div>
        </div>
      </section>

      <section className="content-grid lower-grid">
        <div className="panel hours-panel"><div className="panel-heading"><div><p className="eyebrow">Last seven days</p><h3>Study hours</h3></div><span className="panel-note">Tap a day to inspect</span></div><div className="hours-chart">{recentDays.map((key) => { const hours = Number(db.dailyLog[key]) || 0; return <button className={key === selectedDate ? "day-column selected" : "day-column"} key={key} onClick={() => onSelectDate(key)}><span className="day-bar" style={{ height: `${Math.min((hours / 8) * 100, 100)}%` }} /><strong>{hours}h</strong><small>{new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</small></button>; })}</div></div>
        <div className="panel tasks-panel"><div className="panel-heading"><div><p className="eyebrow">Next actions</p><h3>Study plan</h3></div><span className="panel-note">{db.tasks.filter((task) => task.completed).length} complete</span></div>{openTasks.length ? openTasks.map((task) => <label className="task-row" key={task.id}><input type="checkbox" checked={Boolean(task.completed)} onChange={() => onToggleTask(task.id)} /><span><strong>{task.desc}</strong><small>{task.subject} · Class {task.cls} · {task.hrs}h</small></span></label>) : <p className="empty-state">Your next goals will appear here.</p>}</div>
      </section>
    </main>
  );
}

function SyllabusView({ chapters, progress, onUpdate, onAddCustom }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [custom, setCustom] = useState({ title: "", subject: "Physics", cls: "11" });
  const visible = chapters.filter((chapter) => {
    const matchesQuery = chapter.title.toLowerCase().includes(query.toLowerCase());
    const matchesSubject = subject === "all" || chapter.subject === subject;
    const matchesClass = classFilter === "all" || String(chapter.class) === classFilter;
    return matchesQuery && matchesSubject && matchesClass;
  });

  const completed = Object.values(progress).reduce((total, item) => total + (item.theory && item.ncert && item.pyq ? 1 : 0), 0);

  return <main className="feature-page">
    <div className="feature-heading"><div><p className="eyebrow">Knowledge map</p><h2>NCERT syllabus</h2><p>Turn every chapter into a small, visible win.</p></div><div className="progress-stamp"><strong>{completed}/{chapters.length}</strong><span>fully covered</span></div></div>
    <div className="toolbar"><input placeholder="Search chapters" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">All subjects</option>{["Physics", "Chemistry", "Botany", "Zoology"].map((item) => <option key={item}>{item}</option>)}</select><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">All classes</option><option value="11">Class 11</option><option value="12">Class 12</option></select></div>
    <div className="chapter-list">{visible.map((chapter) => { const item = progress[chapter.id] || {}; return <article className="chapter-row" key={chapter.id}><div><span className="chapter-subject">{chapter.subject} · Class {chapter.class}</span><h3>{chapter.title}</h3></div><div className="chapter-checks">{[["theory", "Theory"], ["ncert", "NCERT"], ["pyq", "PYQ"]].map(([field, label]) => <label key={field}><input type="checkbox" checked={Boolean(item[field])} onChange={(event) => onUpdate(chapter.id, field, event.target.checked)} />{label}</label>)}<span className="revision-count">↻ {Number(item.revisions) || 0}</span><button onClick={() => onUpdate(chapter.id, "revisions", (Number(item.revisions) || 0) + 1)}>Revise</button></div></article>; })}</div>
    <form className="add-row" onSubmit={async (event) => { event.preventDefault(); if (!custom.title.trim()) return; await onAddCustom(custom); setCustom({ title: "", subject: "Physics", cls: "11" }); }}><input placeholder="Add a custom topic" value={custom.title} onChange={(event) => setCustom({ ...custom, title: event.target.value })} /><select value={custom.subject} onChange={(event) => setCustom({ ...custom, subject: event.target.value })}>{["Physics", "Chemistry", "Botany", "Zoology"].map((item) => <option key={item}>{item}</option>)}</select><select value={custom.cls} onChange={(event) => setCustom({ ...custom, cls: event.target.value })}><option value="11">Class 11</option><option value="12">Class 12</option></select><button className="primary-button" type="submit">Add topic</button></form>
  </main>;
}

function TestsView({ tests, onAdd, onDelete }) {
  const [form, setForm] = useState({ testName: "", testType: "AIATS", testClass: "11", testDate: dateKey(), physics: 0, chemistry: 0, biology: 0, remarks: "" });
  const average = tests.length ? (tests.reduce((sum, test) => sum + Number(test.percentage || 0), 0) / tests.length).toFixed(1) : "0.0";
  const submit = async (event) => { event.preventDefault(); await onAdd(form); setForm({ ...form, testName: "", physics: 0, chemistry: 0, biology: 0, remarks: "" }); };
  return <main className="feature-page"><div className="feature-heading"><div><p className="eyebrow">Performance lab</p><h2>Mock tests</h2><p>Keep the score history honest and useful.</p></div><div className="progress-stamp"><strong>{average}%</strong><span>average score</span></div></div><form className="test-form" onSubmit={submit}><input required placeholder="Test name" value={form.testName} onChange={(event) => setForm({ ...form, testName: event.target.value })} /><select value={form.testType} onChange={(event) => setForm({ ...form, testType: event.target.value })}><option>AIATS</option><option>Fortnightly</option><option>NRT</option><option>Other</option></select><select value={form.testClass} onChange={(event) => setForm({ ...form, testClass: event.target.value })}><option value="11">Class 11</option><option value="12">Class 12</option><option value="combined">Combined</option></select><input type="date" value={form.testDate} onChange={(event) => setForm({ ...form, testDate: event.target.value })} /><div className="score-inputs"><input type="number" min="0" max="180" placeholder="Physics /180" value={form.physics} onChange={(event) => setForm({ ...form, physics: event.target.value })} /><input type="number" min="0" max="180" placeholder="Chemistry /180" value={form.chemistry} onChange={(event) => setForm({ ...form, chemistry: event.target.value })} /><input type="number" min="0" max="360" placeholder="Biology /360" value={form.biology} onChange={(event) => setForm({ ...form, biology: event.target.value })} /></div><textarea placeholder="One observation for next time" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /><button className="primary-button" type="submit">Save score</button></form><div className="test-list">{tests.map((test) => <article className="test-row" key={test.id}><div><span className="chapter-subject">{test.testType} · Class {test.testClass} · {test.testDate}</span><h3>{test.testName}</h3><p>{test.remarks || "No note added."}</p></div><div className="test-score"><strong>{test.total}</strong><span>{test.percentage}%</span><button onClick={() => onDelete(test.id)} aria-label={`Delete ${test.testName}`}>Delete</button></div></article>)}</div></main>;
}

function GoalsView({ db, today, onToggleTask, onUpdate }) {
  const [form, setForm] = useState({ desc: "", subject: "Physics", hrs: 1, cls: "11" });
  const addTask = (event) => { event.preventDefault(); if (!form.desc.trim()) return; onUpdate({ ...db, tasks: [...db.tasks, { ...form, id: Date.now(), hrs: Number(form.hrs), completed: false, completedOn: null }] }); setForm({ ...form, desc: "" }); };
  return <main className="feature-page"><div className="feature-heading"><div><p className="eyebrow">Weekly rhythm</p><h2>Study plan</h2><p>Put the next few useful hours somewhere visible.</p></div><div className="progress-stamp"><strong>{Number(db.dailyLog[today]) || 0}h</strong><span>today logged</span></div></div><form className="add-row" onSubmit={addTask}><input required placeholder="What will you study?" value={form.desc} onChange={(event) => setForm({ ...form, desc: event.target.value })} /><select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>{["Physics", "Chemistry", "Botany", "Zoology"].map((item) => <option key={item}>{item}</option>)}</select><input type="number" min="0.5" step="0.5" value={form.hrs} onChange={(event) => setForm({ ...form, hrs: event.target.value })} /><button className="primary-button">Add goal</button></form><div className="full-task-list">{db.tasks.map((task) => <label className="task-row" key={task.id}><input type="checkbox" checked={Boolean(task.completed)} onChange={() => onToggleTask(task.id)} /><span><strong>{task.desc}</strong><small>{task.subject} · Class {task.cls} · {task.hrs}h {task.completed ? `· completed ${task.completedOn}` : ""}</small></span></label>)}</div></main>;
}

function BackupView({ db, onReset, onImport }) {
  const exportJson = () => { const blob = new Blob([JSON.stringify({ db }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `neet-tracker-backup-${dateKey()}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const importJson = (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(reader.result); if (parsed.db) onImport(parsed.db); } catch { window.alert("This backup file is not valid JSON."); } }; reader.readAsText(file); };
  return <main className="feature-page"><div className="feature-heading"><div><p className="eyebrow">Keep your history portable</p><h2>Backup & reset</h2><p>Export before a device change or a new study cycle.</p></div></div><div className="backup-grid"><div className="panel"><h3>JSON backup</h3><p>Save your questions, hours, syllabus, tests, tasks, and streak data in one file.</p><div className="backup-actions"><button className="primary-button" onClick={exportJson}>Download backup</button><label className="secondary-button">Restore backup<input type="file" accept="application/json" onChange={importJson} hidden /></label></div></div><div className="panel danger-panel"><h3>Reset current week</h3><p>Clears this week’s tasks, questions, and study hours while preserving your syllabus, tests, and streak history.</p><button className="danger-button" onClick={() => { if (window.confirm("Reset the current week?")) onReset(); }}>Reset week</button></div></div></main>;
}

function Metric({ label, value, suffix, detail, tone }) {
  return <div className={`metric-card ${tone}`}><p className="eyebrow">{label}</p><strong>{value}</strong><span>{suffix}</span><small>{detail}</small></div>;
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
