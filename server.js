const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const AUTH_SECRET = process.env.AUTH_SECRET || 'local-development-auth-secret';
const LEGACY_OWNER_EMAIL = (process.env.LEGACY_OWNER_EMAIL || '').trim().toLowerCase();
const AUTH_COOKIE = 'neet_tracker_session';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ============================================================
// MongoDB Schema for Persistent Cloud Storage
// ============================================================

let useMongoDB = false;

const stateSchema = new mongoose.Schema({
  key: { type: String, default: 'main_db', unique: true },
  ownerId: { type: String, default: null, index: true },
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

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  trackerType: { type: String, enum: ['neet', 'ca'], default: 'neet' }
}, { timestamps: true });

const UserModel = mongoose.model('TrackerUser', userSchema);


if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB Atlas Cloud Database!');
      useMongoDB = true;
    })
    .catch(err => {
      console.error(
        '❌ MongoDB Connection Error, falling back to local storage:',
        err
      );
    });
} else {
  console.log(
    'ℹ️ MONGODB_URI not provided. Using local db.json file storage.'
  );
}


// ============================================================
// File Paths
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SYLLABUS_FILE = path.join(DATA_DIR, 'syllabus.json');
const CA_SYLLABUS_FILE = path.join(DATA_DIR, 'ca-syllabus.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_DATA_DIR = path.join(DATA_DIR, 'users');


// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordHash, passwordSalt: salt };
}

function passwordsMatch(password, user) {
  const candidate = hashPassword(password, user.passwordSalt).passwordHash;
  return crypto.timingSafeEqual(
    Buffer.from(candidate, 'hex'),
    Buffer.from(user.passwordHash, 'hex')
  );
}

function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: String(user._id || user.id),
    email: user.email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function getCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function serializeUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name || '',
    email: user.email,
    trackerType: user.trackerType || 'neet'
  };
}

function localUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function saveLocalUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (useMongoDB) return UserModel.findOne({ email: normalized });
  return localUsers().find(user => user.email === normalized) || null;
}

async function createUser(input) {
  const normalized = normalizeEmail(input.email);
  const password = hashPassword(input.password);
  if (useMongoDB) {
    return UserModel.create({
      name: input.name || '',
      email: normalized,
      ...password,
      trackerType: input.trackerType === 'ca' ? 'ca' : 'neet'
    });
  }
  const user = {
    id: crypto.randomUUID(),
    name: input.name || '',
    email: normalized,
    ...password,
    trackerType: input.trackerType === 'ca' ? 'ca' : 'neet'
  };
  const users = localUsers();
  users.push(user);
  saveLocalUsers(users);
  return user;
}

async function findUserById(id) {
  if (useMongoDB) return UserModel.findById(id);
  return localUsers().find(user => user.id === id) || null;
}

async function authenticateRequest(req) {
  const session = readSessionToken(getCookies(req)[AUTH_COOKIE]);
  if (!session) return null;
  return findUserById(session.id);
}

async function requireAuth(req, res, next) {
  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = serializeUser(user);
  next();
}


// ============================================================
// Load Default Syllabus
// ============================================================

function loadSyllabus(file, label) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Error parsing ${label}:`, e);
    return [];
  }
}

const syllabusByTracker = {
  neet: loadSyllabus(SYLLABUS_FILE, 'syllabus.json'),
  ca: loadSyllabus(CA_SYLLABUS_FILE, 'ca-syllabus.json')
};

function syllabusForTrackerType(trackerType = 'neet') {
  return syllabusByTracker[trackerType === 'ca' ? 'ca' : 'neet'];
}


// ============================================================
// Date Helpers
// ============================================================

function getWeekNumber(d) {
  d = new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    )
  );

  d.setUTCDate(
    d.getUTCDate() + 4 - (d.getUTCDay() || 7)
  );

  return Math.ceil(
    (
      (
        d -
        new Date(
          Date.UTC(d.getUTCFullYear(), 0, 1)
        )
      ) / 86400000 +
      1
    ) / 7
  );
}


// Returns date as YYYY-MM-DD
function getDateKey(date = new Date(), offset = 0) {
  const d = new Date(date);

  d.setDate(d.getDate() + offset);

  const year = d.getFullYear();
  const month = String(
    d.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    d.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


// Returns Monday of the current week
function getCurrentWeekStart() {
  const today = new Date();

  const day = today.getDay();

  // Sunday = 0, Monday = 1
  const daysFromMonday =
    day === 0 ? 6 : day - 1;

  const monday = new Date(today);

  monday.setDate(
    today.getDate() - daysFromMonday
  );

  monday.setHours(0, 0, 0, 0);

  return monday;
}


// ============================================================
// Create Initial Database
// ============================================================

function createInitialDB(trackerType = 'neet') {
  const currentWeek = getWeekNumber(new Date());
  const trackerSyllabus = syllabusForTrackerType(trackerType);

  const initialSyllabusProgress = {};

  trackerSyllabus.forEach(ch => {
    initialSyllabusProgress[ch.id] = {
      theory: false,
      ncert: false,
      pyq: false,
      revisions: 0
    };
  });


  // Date-based question log
  const questionLog = {};


  // Pre-loaded Aakash Test Series sample entries
  const initialAakashTests = [
    {
      id: 1700000000001,
      testName: "AAKASH AIATS-01 (Class 11 Syllabus)",
      testType: "AIATS",
      testDate: new Date(
        Date.now() - 7 * 86400000
      ).toISOString().split('T')[0],
      physics: 155,
      chemistry: 160,
      biology: 330,
      total: 645,
      percentage: "89.6",
      remarks:
        "Great speed in Biology. Need to revise Optics formulas for Physics."
    },
    {
      id: 1700000000002,
      testName: "AAKASH Fortnightly Test (FT-02)",
      testType: "Fortnightly",
      testDate: new Date(
        Date.now() - 14 * 86400000
      ).toISOString().split('T')[0],
      physics: 140,
      chemistry: 150,
      biology: 320,
      total: 610,
      percentage: "84.7",
      remarks:
        "Silly calculation mistakes in Physical Chemistry."
    }
  ];


  return {
    weekId: currentWeek,

    tasks: [],

    // Date-based study hours
    dailyLog: {},

    // Date-based questions
    questionLog: questionLog,

    syllabusProgress: initialSyllabusProgress,

    customChapters: [],

    mockTests: trackerType === 'ca' ? [] : initialAakashTests,

    streakData: {
      currentStreak: 56,
      bestStreak: 56,
      lastActiveDate: new Date().toDateString(),

      streakHistory: {
        [new Date().toDateString()]: true
      }
    },

    lastWeekQuestions: {
      physics: 0,
      chemistry: 0,
      botony: 0,
      zoology: 0,
      total: 0
    }
  };
}


// ============================================================
// Database Read
// ============================================================

function stateKeyFor(ownerId) {
  return ownerId ? `user:${ownerId}` : 'main_db';
}

function localStateFile(ownerId) {
  return ownerId ? path.join(USER_DATA_DIR, `${String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`) : DB_FILE;
}

function hasMeaningfulTrackerData(data) {
  if (!data || typeof data !== 'object') return false;
  const initial = createInitialDB();
  const hasChangedMockTests = JSON.stringify(data.mockTests || []) !== JSON.stringify(initial.mockTests || []);
  const hasChangedStreak =
    Number(data.streakData?.currentStreak) !== Number(initial.streakData?.currentStreak) ||
    Number(data.streakData?.bestStreak) !== Number(initial.streakData?.bestStreak) ||
    Object.keys(data.streakData?.streakHistory || {}).length > 1;

  return Boolean(
    (Array.isArray(data.tasks) && data.tasks.length) ||
    hasChangedMockTests ||
    (Array.isArray(data.customChapters) && data.customChapters.length) ||
    (data.dailyLog && Object.keys(data.dailyLog).length) ||
    (data.questionLog && Object.keys(data.questionLog).length) ||
    (data.syllabusProgress && Object.values(data.syllabusProgress).some(progress =>
      progress && (progress.theory || progress.ncert || progress.pyq || Number(progress.revisions) > 0)
    )) ||
    hasChangedStreak
  );
}

async function readDB(ownerId = null, trackerType = 'neet') {

  const stateKey = stateKeyFor(ownerId);
  const stateFile = localStateFile(ownerId);
  const trackerSyllabus = syllabusForTrackerType(trackerType);

  if (useMongoDB) {
    try {

      let doc = await StateModel.findOne({
        key: stateKey
      });

      if (!doc) {
        let initial = createInitialDB(trackerType);

        // The first configured legacy owner receives a copy of the existing
        // NEET tracker without deleting or mutating the legacy record.
        if (ownerId && LEGACY_OWNER_EMAIL) {
          const owner = await UserModel.findById(ownerId);
          if (owner && owner.email === LEGACY_OWNER_EMAIL) {
            const legacy = await StateModel.findOne({ key: 'main_db' });
            if (legacy) {
              initial = legacy.toObject();
              delete initial._id;
              delete initial.__v;
            }
          }
        }

        doc = await StateModel.create({
          ...initial,
          key: stateKey,
          ownerId
        });
      } else if (ownerId && LEGACY_OWNER_EMAIL) {
        const owner = await UserModel.findById(ownerId);
        const current = doc.toObject();
        const legacy = await StateModel.findOne({ key: 'main_db' });

        // Repair an account created before migration was configured, but
        // never overwrite meaningful data already belonging to that user.
        if (
          owner && owner.email === LEGACY_OWNER_EMAIL &&
          !hasMeaningfulTrackerData(current) &&
          legacy && hasMeaningfulTrackerData(legacy.toObject())
        ) {
          const migrated = legacy.toObject();
          delete migrated._id;
          delete migrated.__v;
          doc = await StateModel.findOneAndUpdate(
            { key: stateKey },
            { $set: { ...migrated, key: stateKey, ownerId } },
            { new: true }
          );
          console.log(`✅ Repaired legacy tracker data for ${owner.email}`);
        }
      }

      const data = doc.toObject();

      // Older CA accounts were created with the NEET seed mock tests.
      // Remove only that untouched seed data; never remove user-entered tests.
      if (
        trackerType === 'ca' &&
        JSON.stringify(data.mockTests || []) === JSON.stringify(createInitialDB('neet').mockTests || [])
      ) {
        data.mockTests = [];
        await StateModel.updateOne(
          { key: stateKey },
          { $set: { mockTests: [] } }
        );
      }

      delete data._id;
      delete data.__v;

      return data;

    } catch (e) {

      console.error(
        'MongoDB Read error, falling back to db.json:',
        e
      );
    }
  }


  if (!fs.existsSync(stateFile)) {

    let initial = createInitialDB(trackerType);

    if (ownerId && LEGACY_OWNER_EMAIL) {
      const owner = localUsers().find(user => user.id === ownerId);
      if (owner && owner.email === LEGACY_OWNER_EMAIL && fs.existsSync(DB_FILE)) {
        initial = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      }
    }

    writeDBLocal(initial, ownerId);

    return initial;
  }


  try {

    const data = JSON.parse(
      fs.readFileSync(stateFile, 'utf8')
    );

    if (ownerId && LEGACY_OWNER_EMAIL) {
      const owner = localUsers().find(user => user.id === ownerId);
      const legacy = fs.existsSync(DB_FILE)
        ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
        : null;

      if (
        owner && owner.email === LEGACY_OWNER_EMAIL &&
        !hasMeaningfulTrackerData(data) &&
        hasMeaningfulTrackerData(legacy)
      ) {
        writeDBLocal(legacy, ownerId);
        return legacy;
      }
    }


    if (!data.syllabusProgress) {

      data.syllabusProgress = {};

      trackerSyllabus.forEach(ch => {
        data.syllabusProgress[ch.id] = {
          theory: false,
          ncert: false,
          pyq: false,
          revisions: 0
        };
      });
    }


    if (!data.mockTests) {
      data.mockTests = [];
    }

    if (!data.customChapters) {
      data.customChapters = [];
    }

    if (!data.dailyLog) {
      data.dailyLog = {};
    }

    if (!data.questionLog) {
      data.questionLog = {};
    }

    if (!data.lastWeekQuestions) {
      data.lastWeekQuestions = {
        physics: 0,
        chemistry: 0,
        botony: 0,
        zoology: 0,
        total: 0
      };
    }

    return data;

  } catch (e) {

    console.error(
      'Error reading db.json, recreating:',
      e
    );

    const initial = createInitialDB();

    writeDBLocal(initial, ownerId);

    return initial;
  }
}


// ============================================================
// Database Write
// ============================================================

function writeDBLocal(data, ownerId = null) {
  try {

    fs.writeFileSync(
      localStateFile(ownerId),
      JSON.stringify(data, null, 2),
      'utf8'
    );

  } catch (e) {

    console.error(
      'Local JSON write error:',
      e
    );
  }
}


async function writeDB(data, ownerId = null) {

  writeDBLocal(data, ownerId);

  if (useMongoDB) {
    try {

      await StateModel.findOneAndUpdate(
        { key: stateKeyFor(ownerId) },
        // Backups can contain the legacy `main_db` key. Always bind saved
        // state to the currently authenticated user's key instead.
        { $set: { ...data, key: stateKeyFor(ownerId), ownerId } },
        {
          upsert: true,
          new: true
        }
      );

    } catch (e) {

      console.error(
        'MongoDB Write Error:',
        e
      );
    }
  }
}


// ============================================================
// Calculate Previous Week Questions
// ============================================================

function calculateLastWeekQuestions(db) {

  const currentWeekStart =
    getCurrentWeekStart();

  const lastWeekStart =
    new Date(currentWeekStart);

  lastWeekStart.setDate(
    lastWeekStart.getDate() - 7
  );


  const lastWeekSubjects = {
    physics: 0,
    chemistry: 0,
    botony: 0,
    zoology: 0
  };


  for (let i = 0; i < 7; i++) {

    const date = new Date(
      lastWeekStart
    );

    date.setDate(
      lastWeekStart.getDate() + i
    );

    const dateKey =
      getDateKey(date);


    const q =
      db.questionLog[dateKey] || {
        physics: 0,
        chemistry: 0,
        botony: 0,
        zoology: 0
      };


    lastWeekSubjects.physics +=
      Number(q.physics) || 0;

    lastWeekSubjects.chemistry +=
      Number(q.chemistry) || 0;

    lastWeekSubjects.botony +=
      Number(q.botony) || 0;

    lastWeekSubjects.zoology +=
      Number(q.zoology) || 0;
  }


  return {
    physics: lastWeekSubjects.physics,
    chemistry: lastWeekSubjects.chemistry,
    botony: lastWeekSubjects.botony,
    zoology: lastWeekSubjects.zoology,

    total:
      lastWeekSubjects.physics +
      lastWeekSubjects.chemistry +
      lastWeekSubjects.botony +
      lastWeekSubjects.zoology
  };
}


// Lightweight health check for uptime monitoring
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'NEET Master Pro',
    storage: useMongoDB ? 'mongodb' : 'local'
  });
});

// ============================================================
// Authentication
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, trackerType } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes('@') || String(password || '').length < 8) {
    return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  }

  if (await findUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  try {
    const user = await createUser({ name, email: normalizedEmail, password, trackerType });
    setSessionCookie(res, createSessionToken(user));
    res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Unable to create the account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const user = await findUserByEmail(req.body?.email);
  if (!user || !passwordsMatch(req.body?.password || '', user)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  setSessionCookie(res, createSessionToken(user));
  res.json({ user: serializeUser(user) });
});

app.get('/api/auth/me', async (req, res) => {
  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: serializeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  return requireAuth(req, res, next);
});

// ============================================================
// API Routes
// ============================================================


// Get full app state & default syllabus
app.get('/api/state', async (req, res) => {

  const db = await readDB(req.user.id, req.user.trackerType);

  const currentWeek =
    getWeekNumber(new Date());


  // New week detected
  if (db.weekId !== currentWeek) {

    // Save previous week's question summary
    db.lastWeekQuestions =
      calculateLastWeekQuestions(db);


    // Reset ONLY weekly tasks.
    // Historical dailyLog/questionLog are preserved.
    db.tasks = [];

    db.weekId = currentWeek;

    await writeDB(db, req.user.id);
  }


  res.json({
    syllabusList: [
      ...syllabusForTrackerType(req.user.trackerType),
      ...(db.customChapters || [])
    ],

    db: db
  });
});


// Update full state
app.post('/api/state', async (req, res) => {

  const newDB = req.body;

  await writeDB(newDB, req.user.id);

  res.json({
    success: true,
    db: newDB
  });
});


// ============================================================
// Update Syllabus Progress
// ============================================================

app.post('/api/syllabus/update', async (req, res) => {

  const {
    chapterId,
    field,
    value
  } = req.body;

  const db = await readDB(req.user.id);

  if (!db.syllabusProgress[chapterId]) {

    db.syllabusProgress[chapterId] = {
      theory: false,
      ncert: false,
      pyq: false,
      revisions: 0
    };
  }

  db.syllabusProgress[chapterId][field] =
    value;

  await writeDB(db, req.user.id);

  res.json({
    success: true,
    syllabusProgress:
      db.syllabusProgress
  });
});


// ============================================================
// Add Custom Chapter
// ============================================================

app.post('/api/syllabus/custom', async (req, res) => {

  const {
    title,
    subject,
    cls,
    category
  } = req.body;

  if (!title || !subject || !cls) {
    return res.status(400).json({
      error: 'Missing required fields'
    });
  }

  const db = await readDB(req.user.id);

  const id =
    `custom_${Date.now()}`;

  const newChapter = {
    id,
    title,
    subject,
    class: cls,
    category:
      category || 'Custom Topic'
  };

  if (!db.customChapters) {
    db.customChapters = [];
  }

  db.customChapters.push(
    newChapter
  );

  db.syllabusProgress[id] = {
    theory: false,
    ncert: false,
    pyq: false,
    revisions: 0
  };

  await writeDB(db, req.user.id);

  res.json({
    success: true,
    chapter: newChapter,
    syllabusProgress:
      db.syllabusProgress
  });
});


// ============================================================
// Add Mock Test
// ============================================================

app.post('/api/tests', async (req, res) => {

  const {
    testName,
    testType,
    testClass,
    testDate,
    physics,
    chemistry,
    biology,
    economics,
    remarks
  } = req.body;

  const isCA = req.user.trackerType === 'ca';
  const maxPerPaper = isCA ? 100 : 180;
  const maxBiology = isCA ? 100 : 360;
  const maxTotal = isCA ? 400 : 720;


  const p = Math.max(
    0,
    Math.min(
      maxPerPaper,
      parseInt(physics, 10) || 0
    )
  );

  const c = Math.max(
    0,
    Math.min(
      maxPerPaper,
      parseInt(chemistry, 10) || 0
    )
  );

  const b = Math.max(
    0,
    Math.min(
      maxBiology,
      parseInt(biology, 10) || 0
    )
  );

  const e = isCA
    ? Math.max(0, Math.min(100, parseInt(economics, 10) || 0))
    : 0;


  const total =
    p + c + b + e;

  const percentage =
    ((total / maxTotal) * 100).toFixed(1);


  const db = await readDB(req.user.id, req.user.trackerType);

  if (!db.mockTests) {
    db.mockTests = [];
  }


  const newTest = {

    id: Date.now(),

    testName:
      testName || (isCA ? 'CA Foundation Mock' : 'AAKASH Test'),

    testType:
      testType || 'AIATS',

    testClass:
      testClass || '11',

    testDate:
      testDate ||
      new Date()
        .toISOString()
        .split('T')[0],

    physics: p,
    chemistry: c,
    biology: b,
    economics: e,

    total: total,

    percentage: percentage,

    remarks:
      remarks || ''
  };


  db.mockTests.unshift(
    newTest
  );

  await writeDB(db, req.user.id);

  res.json({
    success: true,
    mockTests:
      db.mockTests
  });
});


// ============================================================
// Delete Mock Test
// ============================================================

app.delete('/api/tests/:id', async (req, res) => {

  const id =
    parseInt(req.params.id, 10);

  const db =
    await readDB(req.user.id);

  if (db.mockTests) {

    db.mockTests =
      db.mockTests.filter(
        t => t.id !== id
      );

    await writeDB(db, req.user.id);
  }

  res.json({
    success: true,
    mockTests:
      db.mockTests
  });
});


// ============================================================
// Reset Week Data
// ============================================================

app.post('/api/reset-week', async (req, res) => {

  const db = await readDB(req.user.id);


  // Save the previous calendar week's
  // question summary before resetting.
  db.lastWeekQuestions =
    calculateLastWeekQuestions(db);


  const currentWeekStart =
    getCurrentWeekStart();


  // Remove ONLY current week's
  // daily question and study-hour data.
  for (let i = 0; i < 7; i++) {

    const date =
      new Date(currentWeekStart);

    date.setDate(
      currentWeekStart.getDate() + i
    );

    const dateKey =
      getDateKey(date);


    delete db.dailyLog[dateKey];

    delete db.questionLog[dateKey];
  }


  // Reset weekly tasks
  db.tasks = [];


  db.weekId =
    getWeekNumber(new Date());


  await writeDB(db, req.user.id);


  res.json({
    success: true,
    db: db
  });
});


// ============================================================
// Serve frontend SPA fallback
// ============================================================

app.get('*', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});


// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {

  console.log(
    `🚀 NEET Master Pro Full-Stack Server running on port ${PORT}`
  );
});
