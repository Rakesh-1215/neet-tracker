const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Schema for Persistent Cloud Storage
let useMongoDB = false;

const stateSchema = new mongoose.Schema({
  key: { type: String, default: 'main_db', unique: true },
  weekId: Number,
  tasks: Array,
  dailyLog: Object,
  questionLog: Object,
  syllabusProgress: Object,
  customChapters: Array,
  mockTests: Array,
  streakData: Object,
  lastWeekQuestions: Object
}, { timestamps: true });

const StateModel = mongoose.model('AppState', stateSchema);

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB Atlas Cloud Database!');
      useMongoDB = true;
    })
    .catch(err => {
      console.error('❌ MongoDB Connection Error, falling back to local storage:', err);
    });
} else {
  console.log('ℹ️ MONGODB_URI not provided. Using local db.json file storage.');
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SYLLABUS_FILE = path.join(DATA_DIR, 'syllabus.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load default syllabus
let defaultSyllabus = [];
if (fs.existsSync(SYLLABUS_FILE)) {
  try {
    defaultSyllabus = JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error parsing syllabus.json:', e);
  }
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}

function createInitialDB() {
  const currentWeek = getWeekNumber(new Date());
  const initialSyllabusProgress = {};
  defaultSyllabus.forEach(ch => {
    initialSyllabusProgress[ch.id] = {
      theory: false,
      ncert: false,
      pyq: false,
      revisions: 0
    };
  });

  const questionLog = {};
  for (let i = 0; i < 7; i++) {
    questionLog[i] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
  }

  // Pre-loaded Aakash Test Series sample entries
  const initialAakashTests = [
    {
      id: 1700000000001,
      testName: "AAKASH AIATS-01 (Class 11 Syllabus)",
      testType: "AIATS",
      testDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      physics: 155,
      chemistry: 160,
      biology: 330,
      total: 645,
      percentage: "89.6",
      remarks: "Great speed in Biology. Need to revise Optics formulas for Physics."
    },
    {
      id: 1700000000002,
      testName: "AAKASH Fortnightly Test (FT-02)",
      testType: "Fortnightly",
      testDate: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
      physics: 140,
      chemistry: 150,
      biology: 320,
      total: 610,
      percentage: "84.7",
      remarks: "Silly calculation mistakes in Physical Chemistry."
    }
  ];

  return {
    weekId: currentWeek,
    tasks: [],
    dailyLog: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    questionLog: questionLog,
    syllabusProgress: initialSyllabusProgress,
    customChapters: [],
    mockTests: initialAakashTests,
    streakData: {
      currentStreak: 56,
      bestStreak: 56,
      lastActiveDate: new Date().toDateString(),
      streakHistory: {
        [new Date().toDateString()]: true
      }
    },
    lastWeekQuestions: { physics: 0, chemistry: 0, botony: 0, zoology: 0, total: 0 }
  };
}

async function readDB() {
  if (useMongoDB) {
    try {
      let doc = await StateModel.findOne({ key: 'main_db' });
      if (!doc) {
        const initial = createInitialDB();
        doc = await StateModel.create({ key: 'main_db', ...initial });
      }
      const data = doc.toObject();
      delete data._id;
      delete data.__v;
      return data;
    } catch (e) {
      console.error('MongoDB Read error, falling back to db.json:', e);
    }
  }

  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDB();
    writeDBLocal(initial);
    return initial;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.syllabusProgress) {
      data.syllabusProgress = {};
      defaultSyllabus.forEach(ch => {
        data.syllabusProgress[ch.id] = { theory: false, ncert: false, pyq: false, revisions: 0 };
      });
    }
    if (!data.mockTests) data.mockTests = [];
    if (!data.customChapters) data.customChapters = [];
    return data;
  } catch (e) {
    console.error('Error reading db.json, recreating:', e);
    const initial = createInitialDB();
    writeDBLocal(initial);
    return initial;
  }
}

function writeDBLocal(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Local JSON write error:', e);
  }
}

async function writeDB(data) {
  writeDBLocal(data);
  if (useMongoDB) {
    try {
      await StateModel.findOneAndUpdate(
        { key: 'main_db' },
        { $set: data },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.error('MongoDB Write Error:', e);
    }
  }
}

// API Routes

// Get full app state & default syllabus
app.get('/api/state', async (req, res) => {
  const db = await readDB();
  const currentWeek = getWeekNumber(new Date());
  
  if (db.weekId !== currentWeek) {
    let lastWeekSubjects = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
    for (let i = 0; i < 7; i++) {
      const q = db.questionLog[i] || { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
      lastWeekSubjects.physics += q.physics || 0;
      lastWeekSubjects.chemistry += q.chemistry || 0;
      lastWeekSubjects.botony += q.botony || 0;
      lastWeekSubjects.zoology += q.zoology || 0;
    }
    db.lastWeekQuestions = {
      physics: lastWeekSubjects.physics,
      chemistry: lastWeekSubjects.chemistry,
      botony: lastWeekSubjects.botony,
      zoology: lastWeekSubjects.zoology,
      total: lastWeekSubjects.physics + lastWeekSubjects.chemistry + lastWeekSubjects.botony + lastWeekSubjects.zoology
    };
    db.tasks = [];
    db.dailyLog = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    db.questionLog = {};
    for (let i = 0; i < 7; i++) {
      db.questionLog[i] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
    }
    db.weekId = currentWeek;
    await writeDB(db);
  }

  res.json({
    syllabusList: [...defaultSyllabus, ...(db.customChapters || [])],
    db: db
  });
});

// Update full state
app.post('/api/state', async (req, res) => {
  const newDB = req.body;
  await writeDB(newDB);
  res.json({ success: true, db: newDB });
});

// Update Syllabus Progress
app.post('/api/syllabus/update', async (req, res) => {
  const { chapterId, field, value } = req.body;
  const db = await readDB();
  if (!db.syllabusProgress[chapterId]) {
    db.syllabusProgress[chapterId] = { theory: false, ncert: false, pyq: false, revisions: 0 };
  }
  db.syllabusProgress[chapterId][field] = value;
  await writeDB(db);
  res.json({ success: true, syllabusProgress: db.syllabusProgress });
});

// Add Custom Chapter
app.post('/api/syllabus/custom', async (req, res) => {
  const { title, subject, cls, category } = req.body;
  if (!title || !subject || !cls) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const db = await readDB();
  const id = `custom_${Date.now()}`;
  const newChapter = {
    id,
    title,
    subject,
    class: cls,
    category: category || 'Custom Topic'
  };
  if (!db.customChapters) db.customChapters = [];
  db.customChapters.push(newChapter);
  db.syllabusProgress[id] = { theory: false, ncert: false, pyq: false, revisions: 0 };
  await writeDB(db);
  res.json({ success: true, chapter: newChapter, syllabusProgress: db.syllabusProgress });
});

// Add Mock Test
app.post('/api/tests', async (req, res) => {
  const { testName, testType, testClass, testDate, physics, chemistry, biology, remarks } = req.body;
  const p = Math.max(0, Math.min(180, parseInt(physics, 10) || 0));
  const c = Math.max(0, Math.min(180, parseInt(chemistry, 10) || 0));
  const b = Math.max(0, Math.min(360, parseInt(biology, 10) || 0));
  const total = p + c + b;
  const percentage = ((total / 720) * 100).toFixed(1);

  const db = await readDB();
  if (!db.mockTests) db.mockTests = [];
  const newTest = {
    id: Date.now(),
    testName: testName || 'AAKASH Test',
    testType: testType || 'AIATS',
    testClass: testClass || '11',
    testDate: testDate || new Date().toISOString().split('T')[0],
    physics: p,
    chemistry: c,
    biology: b,
    total: total,
    percentage: percentage,
    remarks: remarks || ''
  };
  db.mockTests.unshift(newTest);
  await writeDB(db);
  res.json({ success: true, mockTests: db.mockTests });
});

// Delete Mock Test
app.delete('/api/tests/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = await readDB();
  if (db.mockTests) {
    db.mockTests = db.mockTests.filter(t => t.id !== id);
    await writeDB(db);
  }
  res.json({ success: true, mockTests: db.mockTests });
});

// Reset Week Data
app.post('/api/reset-week', async (req, res) => {
  const db = await readDB();
  let lastWeekSubjects = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
  for (let i = 0; i < 7; i++) {
    const q = db.questionLog[i] || { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
    lastWeekSubjects.physics += q.physics || 0;
    lastWeekSubjects.chemistry += q.chemistry || 0;
    lastWeekSubjects.botony += q.botony || 0;
    lastWeekSubjects.zoology += q.zoology || 0;
  }
  db.lastWeekQuestions = {
    physics: lastWeekSubjects.physics,
    chemistry: lastWeekSubjects.chemistry,
    botony: lastWeekSubjects.botony,
    zoology: lastWeekSubjects.zoology,
    total: lastWeekSubjects.physics + lastWeekSubjects.chemistry + lastWeekSubjects.botony + lastWeekSubjects.zoology
  };
  db.tasks = [];
  db.dailyLog = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  db.questionLog = {};
  for (let i = 0; i < 7; i++) {
    db.questionLog[i] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
  }
  db.weekId = getWeekNumber(new Date());
  await writeDB(db);
  res.json({ success: true, db });
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 NEET Master Pro Full-Stack Server running on port ${PORT}`);
});
