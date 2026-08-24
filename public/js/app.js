// NEET 2027 Master Study Tracker Client Logic

let appState = {
  syllabusList: [],
  db: {
    weekId: 0,
    tasks: [],
    dailyLog: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    questionLog: { 0: { physics: 0, chemistry: 0, botony: 0, zoology: 0 } },
    syllabusProgress: {},
    customChapters: [],
    mockTests: [],
    streakData: { currentStreak: 0, bestStreak: 0, lastActiveDate: null, streakHistory: {} },
    lastWeekQuestions: { physics: 0, chemistry: 0, botony: 0, zoology: 0, total: 0 }
  }
};

const daysArr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const quotes = [
  "Earn the stethoscope.",
  "Be the doctor you'd want.",
  "Class 11 is foundation.",
  "Precision in Physics, speed in Bio.",
  "Chemistry is the score booster.",
  "35 Hours is just the beginning.",
  "Stay focused, Dr. NEET."
];

let currentSelectedClass = "11";

// API Helpers
async function loadState() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const data = await res.json();
      appState = data;
    } else {
      throw new Error('API server returned error status');
    }
  } catch (e) {
    console.warn('Backend server unreachable, using offline localStorage fallback:', e);
    loadOfflineState();
  }
  updateStreak();
  renderAll();
}

async function saveStateBackend() {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appState.db)
    });
  } catch (e) {
    console.warn('Failed to save to backend, saving offline:', e);
    saveOfflineState();
  }
}

function saveOfflineState() {
  try {
    localStorage.setItem('neetMaster_v11_db', JSON.stringify(appState.db));
  } catch (e) {
    console.error('Offline save error:', e);
  }
}

function loadOfflineState() {
  const saved = localStorage.getItem('neetMaster_v11_db');
  if (saved) {
    try {
      appState.db = JSON.parse(saved);
    } catch (e) {
      console.error('Offline parse error:', e);
    }
  }
}

// Tab Switching
function initTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

// Class Toggle inside Goals Tab
function initClassToggle() {
  const class11Btn = document.getElementById('class11Btn');
  const class12Btn = document.getElementById('class12Btn');
  const hintSpan = document.getElementById('selectedClassHint');

  function updateClassUI() {
    if (currentSelectedClass === "11") {
      class11Btn.classList.add('active');
      class12Btn.classList.remove('active');
      if (hintSpan) hintSpan.innerHTML = '📘 Selected: Class 11';
    } else {
      class12Btn.classList.add('active');
      class11Btn.classList.remove('active');
      if (hintSpan) hintSpan.innerHTML = '📗 Selected: Class 12';
    }
  }

  if (class11Btn) class11Btn.addEventListener('click', () => { currentSelectedClass = "11"; updateClassUI(); });
  if (class12Btn) class12Btn.addEventListener('click', () => { currentSelectedClass = "12"; updateClassUI(); });
  updateClassUI();
}

function getTodayIndex() { return new Date().getDay(); }
function getTodayDateStr() { return new Date().toDateString(); }

function checkTodayActivity() {
  const today = getTodayIndex();
  const qLog = appState.db.questionLog[today] || { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
  const qTotal = (qLog.physics || 0) + (qLog.chemistry || 0) + (qLog.botony || 0) + (qLog.zoology || 0);
  const tasksCompletedToday = (appState.db.tasks || []).some(t => t.completed && t.completedOn === today);
  return qTotal > 0 || tasksCompletedToday;
}

function updateStreak() {
  const todayStr = getTodayDateStr();
  const activeToday = checkTodayActivity();

  if (!appState.db.streakData) {
    appState.db.streakData = { currentStreak: 0, bestStreak: 0, lastActiveDate: null, streakHistory: {} };
  }

  if (activeToday) {
    if (!appState.db.streakData.streakHistory[todayStr]) {
      appState.db.streakData.streakHistory[todayStr] = true;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();

      if (appState.db.streakData.lastActiveDate === yesterdayStr) {
        appState.db.streakData.currentStreak++;
      } else {
        appState.db.streakData.currentStreak = 1;
      }

      appState.db.streakData.lastActiveDate = todayStr;

      if (appState.db.streakData.currentStreak > appState.db.streakData.bestStreak) {
        appState.db.streakData.bestStreak = appState.db.streakData.currentStreak;
      }
    }
  }

  renderStreakUI();
}

function renderStreakUI() {
  const streak = appState.db.streakData ? appState.db.streakData.currentStreak : 0;
  const best = appState.db.streakData ? appState.db.streakData.bestStreak : 0;

  document.getElementById('currentStreak').innerText = streak;
  document.getElementById('bestStreakText').innerText = `🏆 Best: ${best} days`;

  const streakEmoji = document.getElementById('streakEmoji');
  const streakMsg = document.getElementById('streakMessage');

  if (streak === 0) {
    streakEmoji.innerText = '😴';
    streakMsg.innerText = 'Solve questions or complete a goal today to start your streak! 💪';
  } else if (streak < 3) {
    streakEmoji.innerText = '🌱';
    streakMsg.innerText = `Great start! ${streak} day streak! Keep going! 🔥`;
  } else if (streak < 7) {
    streakEmoji.innerText = '⚡';
    streakMsg.innerText = `Awesome! ${streak} day streak! You're on fire! 🔥`;
  } else if (streak < 14) {
    streakEmoji.innerText = '🏅';
    streakMsg.innerText = `Incredible! ${streak} day streak! NEET ready! 🎯`;
  } else if (streak < 30) {
    streakEmoji.innerText = '🌟';
    streakMsg.innerText = `Amazing! ${streak} day streak! You're unstoppable! 🚀`;
  } else if (streak < 60) {
    streakEmoji.innerText = '👑';
    streakMsg.innerText = `LEGENDARY! ${streak} day streak! Doctor in making! 🩺`;
  } else {
    streakEmoji.innerText = '🏆';
    streakMsg.innerText = `🔥 MEGA STREAK! ${streak} days! NEET Champion! ⭐`;
  }
}

// Question Inputs & Summary
function bindQuestionDirectInputs() {
  const subjects = ['physics', 'chemistry', 'botony', 'zoology'];
  subjects.forEach(sub => {
    const input = document.getElementById(sub + 'Input');
    if (input) {
      input.addEventListener('change', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        const today = getTodayIndex();
        if (!appState.db.questionLog[today]) {
          appState.db.questionLog[today] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
        }
        appState.db.questionLog[today][sub] = val;
        saveStateBackend();
        renderDashboardQuestions();
        updateStreak();
      });
    }
  });

  const resetBtn = document.getElementById('resetTodayQuestions');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const today = getTodayIndex();
      appState.db.questionLog[today] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
      ['physicsInput', 'chemistryInput', 'botonyInput', 'zoologyInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 0;
      });
      saveStateBackend();
      renderDashboardQuestions();
      updateStreak();
    });
  }
}

function renderDashboardQuestions() {
  const today = getTodayIndex();
  const qLog = appState.db.questionLog[today] || { physics: 0, chemistry: 0, botony: 0, zoology: 0 };

  document.getElementById('physicsCount').innerText = qLog.physics || 0;
  document.getElementById('chemistryCount').innerText = qLog.chemistry || 0;
  document.getElementById('botonyCount').innerText = qLog.botony || 0;
  document.getElementById('zoologyCount').innerText = qLog.zoology || 0;

  const mappings = [
    { id: 'physicsInput', key: 'physics' },
    { id: 'chemistryInput', key: 'chemistry' },
    { id: 'botonyInput', key: 'botony' },
    { id: 'zoologyInput', key: 'zoology' }
  ];
  mappings.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el && parseInt(el.value, 10) !== (qLog[key] || 0)) {
      el.value = qLog[key] || 0;
    }
  });

  const totalToday = (qLog.physics || 0) + (qLog.chemistry || 0) + (qLog.botony || 0) + (qLog.zoology || 0);
  document.getElementById('totalQuestionsToday').innerText = totalToday;

  let currentWeeklyTotal = 0;
  const currentBreakdown = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
  for (let i = 0; i < 7; i++) {
    const q = appState.db.questionLog[i];
    if (q) {
      currentBreakdown.physics += q.physics || 0;
      currentBreakdown.chemistry += q.chemistry || 0;
      currentBreakdown.botony += q.botony || 0;
      currentBreakdown.zoology += q.zoology || 0;
    }
  }
  currentWeeklyTotal = currentBreakdown.physics + currentBreakdown.chemistry + currentBreakdown.botony + currentBreakdown.zoology;

  document.getElementById('weeklyTotalQ').innerText = currentWeeklyTotal;
  document.getElementById('currentWeekTotal').innerText = currentWeeklyTotal;
  document.getElementById('currentWeekDetail').innerHTML = `
    <span>⚡${currentBreakdown.physics}</span>
    <span>🧪${currentBreakdown.chemistry}</span>
    <span>🌿${currentBreakdown.botony}</span>
    <span>🐾${currentBreakdown.zoology}</span>
  `;

  const lastWeek = appState.db.lastWeekQuestions || { physics: 0, chemistry: 0, botony: 0, zoology: 0, total: 0 };
  document.getElementById('lastWeekTotal').innerText = lastWeek.total || 0;
  document.getElementById('lastWeekDetail').innerHTML = `
    <span>⚡${lastWeek.physics || 0}</span>
    <span>🧪${lastWeek.chemistry || 0}</span>
    <span>🌿${lastWeek.botony || 0}</span>
    <span>🐾${lastWeek.zoology || 0}</span>
  `;

  const trendEl = document.getElementById('weekTrend');
  const lastTotal = lastWeek.total || 0;
  if (currentWeeklyTotal > lastTotal) {
    trendEl.className = 'week-trend trend-up';
    trendEl.innerHTML = `📈 +${currentWeeklyTotal - lastTotal} vs last week`;
  } else if (currentWeeklyTotal < lastTotal) {
    trendEl.className = 'week-trend trend-down';
    trendEl.innerHTML = `📉 -${lastTotal - currentWeeklyTotal} vs last week`;
  } else {
    trendEl.className = 'week-trend trend-same';
    trendEl.innerHTML = '↔ Same as last week';
  }

  const maxVal = Math.max(currentWeeklyTotal, lastTotal, 1);
  document.getElementById('currentWeekProgress').style.width = Math.min((currentWeeklyTotal / maxVal) * 100, 100) + '%';
}

// NCERT Syllabus Logic
function renderSyllabus() {
  const container = document.getElementById('syllabusList');
  if (!container) return;

  const searchQuery = (document.getElementById('chapterSearch')?.value || '').toLowerCase();
  const subjectFilter = document.getElementById('subjectFilter')?.value || 'all';
  const classFilter = document.getElementById('classFilter')?.value || 'all';

  const syllabusList = appState.syllabusList || [];
  const progressMap = appState.db.syllabusProgress || {};

  container.innerHTML = '';

  let totalStagePoints = 0;
  let earnedStagePoints = 0;

  syllabusList.forEach(ch => {
    const prog = progressMap[ch.id] || { theory: false, ncert: false, pyq: false, revisions: 0 };

    totalStagePoints += 4;
    if (prog.theory) earnedStagePoints += 1;
    if (prog.ncert) earnedStagePoints += 1;
    if (prog.pyq) earnedStagePoints += 1;
    if ((prog.revisions || 0) > 0) earnedStagePoints += 1;

    // Apply Filter
    const matchesSearch = ch.title.toLowerCase().includes(searchQuery) || (ch.category && ch.category.toLowerCase().includes(searchQuery));
    const matchesSubject = subjectFilter === 'all' || ch.subject === subjectFilter;
    const matchesClass = classFilter === 'all' || ch.class === classFilter;

    if (matchesSearch && matchesSubject && matchesClass) {
      const isComplete = prog.theory && prog.ncert && prog.pyq && (prog.revisions > 0);

      const card = document.createElement('div');
      card.className = `chapter-card ${isComplete ? 'completed-ch' : ''}`;
      card.innerHTML = `
        <div class="chapter-header">
          <div class="chapter-title">${escapeHtml(ch.title)}</div>
          <div>
            <span class="tag-badge tag-${ch.subject}">${ch.subject}</span>
            <span class="tag-badge" style="background:#f1f5f9; color:#475569;">Class ${ch.class}</span>
          </div>
        </div>
        <div class="chapter-controls">
          <label class="ch-checkbox-label">
            <input type="checkbox" ${prog.theory ? 'checked' : ''} onchange="toggleSyllabusStage('${ch.id}', 'theory', this.checked)">
            📖 Theory
          </label>
          <label class="ch-checkbox-label">
            <input type="checkbox" ${prog.ncert ? 'checked' : ''} onchange="toggleSyllabusStage('${ch.id}', 'ncert', this.checked)">
            📘 NCERT
          </label>
          <label class="ch-checkbox-label">
            <input type="checkbox" ${prog.pyq ? 'checked' : ''} onchange="toggleSyllabusStage('${ch.id}', 'pyq', this.checked)">
            📝 PYQs
          </label>
          <div class="revision-counter">
            <span>🔄 Rev: <strong>${prog.revisions || 0}x</strong></span>
            <button class="rev-btn" onclick="changeRevision('${ch.id}', -1)">-</button>
            <button class="rev-btn" onclick="changeRevision('${ch.id}', 1)">+</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  });

  const overallPct = totalStagePoints > 0 ? Math.round((earnedStagePoints / totalStagePoints) * 100) : 0;
  document.getElementById('overallSyllabusPercent').innerText = `${overallPct}%`;
  const bar = document.getElementById('overallSyllabusBar');
  if (bar) {
    bar.style.width = `${overallPct}%`;
    bar.innerText = `${overallPct}%`;
  }
}

async function toggleSyllabusStage(chapterId, field, value) {
  if (!appState.db.syllabusProgress[chapterId]) {
    appState.db.syllabusProgress[chapterId] = { theory: false, ncert: false, pyq: false, revisions: 0 };
  }
  appState.db.syllabusProgress[chapterId][field] = value;
  renderSyllabus();
  saveStateBackend();
  updateStreak();
}

async function changeRevision(chapterId, delta) {
  if (!appState.db.syllabusProgress[chapterId]) {
    appState.db.syllabusProgress[chapterId] = { theory: false, ncert: false, pyq: false, revisions: 0 };
  }
  let rev = (appState.db.syllabusProgress[chapterId].revisions || 0) + delta;
  if (rev < 0) rev = 0;
  appState.db.syllabusProgress[chapterId].revisions = rev;
  renderSyllabus();
  saveStateBackend();
  updateStreak();
}

// Custom Chapter Modal
function initCustomModal() {
  const modal = document.getElementById('customModal');
  const openBtn = document.getElementById('openCustomChapterModal');
  const closeBtn = document.getElementById('closeCustomModal');
  const saveBtn = document.getElementById('saveCustomChapter');

  if (openBtn) openBtn.onclick = () => modal.style.display = 'flex';
  if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';

  if (saveBtn) {
    saveBtn.onclick = async () => {
      const title = document.getElementById('customTitle').value.trim();
      const subject = document.getElementById('customSubject').value;
      const cls = document.getElementById('customClass').value;
      if (!title) return alert('Please enter topic title');

      try {
        const res = await fetch('/api/syllabus/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, subject, cls })
        });
        if (res.ok) {
          const data = await res.json();
          appState.syllabusList.push(data.chapter);
          appState.db.syllabusProgress = data.syllabusProgress;
        }
      } catch (e) {
        const id = `custom_${Date.now()}`;
        const newCh = { id, title, subject, class: cls, category: 'Custom Topic' };
        appState.syllabusList.push(newCh);
        appState.db.syllabusProgress[id] = { theory: false, ncert: false, pyq: false, revisions: 0 };
        saveStateBackend();
      }

      document.getElementById('customTitle').value = '';
      modal.style.display = 'none';
      renderSyllabus();
    };
  }
}

// Coaching Mock Test Scores Logic
function bindMockTestForm() {
  const form = document.getElementById('mockTestForm');
  const pInput = document.getElementById('testPhysics');
  const cInput = document.getElementById('testChemistry');
  const bInput = document.getElementById('testBiology');
  const totalBadge = document.getElementById('liveTotalMarks');

  function calculateLiveTotal() {
    const p = Math.max(0, Math.min(180, parseInt(pInput.value, 10) || 0));
    const c = Math.max(0, Math.min(180, parseInt(cInput.value, 10) || 0));
    const b = Math.max(0, Math.min(360, parseInt(bInput.value, 10) || 0));
    const tot = p + c + b;
    totalBadge.innerText = `${tot} / 720`;
  }

  [pInput, cInput, bInput].forEach(inp => {
    if (inp) inp.addEventListener('input', calculateLiveTotal);
  });

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const testName = document.getElementById('testName').value.trim();
      const testType = document.getElementById('testType')?.value || 'AIATS';
      const testClass = document.getElementById('testClass')?.value || '11';
      const testDate = document.getElementById('testDate').value;
      const physics = parseInt(pInput.value, 10) || 0;
      const chemistry = parseInt(cInput.value, 10) || 0;
      const biology = parseInt(bInput.value, 10) || 0;
      const remarks = document.getElementById('testRemarks').value.trim();

      try {
        const res = await fetch('/api/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testName, testType, testClass, testDate, physics, chemistry, biology, remarks })
        });
        if (res.ok) {
          const data = await res.json();
          appState.db.mockTests = data.mockTests;
        }
      } catch (e) {
        const total = physics + chemistry + biology;
        const pct = ((total / 720) * 100).toFixed(1);
        const newTest = {
          id: Date.now(),
          testName, testType, testClass, testDate, physics, chemistry, biology, total, percentage: pct, remarks
        };
        if (!appState.db.mockTests) appState.db.mockTests = [];
        appState.db.mockTests.unshift(newTest);
        saveStateBackend();
      }

      form.reset();
      calculateLiveTotal();
      renderMockTests();
    };
  }
}

function computeClassStats(testsList) {
  const count = testsList.length;
  if (count === 0) {
    return { avgTotal: 0, avgPhy: 0, avgChem: 0, avgBio: 0, avgPct: 0, count: 0 };
  }
  let sumTotal = 0, sumPhy = 0, sumChem = 0, sumBio = 0;
  testsList.forEach(t => {
    sumTotal += t.total || 0;
    sumPhy += t.physics || 0;
    sumChem += t.chemistry || 0;
    sumBio += t.biology || 0;
  });
  const avgTotal = (sumTotal / count).toFixed(1);
  const avgPhy = (sumPhy / count).toFixed(1);
  const avgChem = (sumChem / count).toFixed(1);
  const avgBio = (sumBio / count).toFixed(1);
  const avgPct = ((avgTotal / 720) * 100).toFixed(1);
  return { avgTotal, avgPhy, avgChem, avgBio, avgPct, count };
}

function renderMockTests() {
  const container = document.getElementById('mockTestList');
  if (!container) return;
  const tests = appState.db.mockTests || [];

  // Filter Class 11 and Class 12 tests
  const c11Tests = tests.filter(t => (t.testClass || '11') === '11');
  const c12Tests = tests.filter(t => t.testClass === '12');

  const overallStats = computeClassStats(tests);
  const c11Stats = computeClassStats(c11Tests);
  const c12Stats = computeClassStats(c12Tests);

  // Render Class 11 Stats
  const c11TotalEl = document.getElementById('c11AvgTotal');
  const c11PctEl = document.getElementById('c11AvgPct');
  const c11PhyEl = document.getElementById('c11AvgPhy');
  const c11ChemEl = document.getElementById('c11AvgChem');
  const c11BioEl = document.getElementById('c11AvgBio');
  const c11CountEl = document.getElementById('c11TestCount');

  if (c11TotalEl) c11TotalEl.innerText = `${c11Stats.avgTotal} / 720`;
  if (c11PctEl) c11PctEl.innerText = `${c11Stats.avgPct}% Accuracy`;
  if (c11PhyEl) c11PhyEl.innerText = `${c11Stats.avgPhy}/180`;
  if (c11ChemEl) c11ChemEl.innerText = `${c11Stats.avgChem}/180`;
  if (c11BioEl) c11BioEl.innerText = `${c11Stats.avgBio}/360`;
  if (c11CountEl) c11CountEl.innerText = `${c11Stats.count}`;

  // Render Class 12 Stats
  const c12TotalEl = document.getElementById('c12AvgTotal');
  const c12PctEl = document.getElementById('c12AvgPct');
  const c12PhyEl = document.getElementById('c12AvgPhy');
  const c12ChemEl = document.getElementById('c12AvgChem');
  const c12BioEl = document.getElementById('c12AvgBio');
  const c12CountEl = document.getElementById('c12TestCount');

  if (c12TotalEl) c12TotalEl.innerText = `${c12Stats.avgTotal} / 720`;
  if (c12PctEl) c12PctEl.innerText = `${c12Stats.avgPct}% Accuracy`;
  if (c12PhyEl) c12PhyEl.innerText = `${c12Stats.avgPhy}/180`;
  if (c12ChemEl) c12ChemEl.innerText = `${c12Stats.avgChem}/180`;
  if (c12BioEl) c12BioEl.innerText = `${c12Stats.avgBio}/360`;
  if (c12CountEl) c12CountEl.innerText = `${c12Stats.count}`;

  // Overall Bar
  const avgTotalEl = document.getElementById('avgTotalScore');
  const avgPctEl = document.getElementById('avgPercentage');
  const avgCountEl = document.getElementById('avgTestCount');
  if (avgTotalEl) avgTotalEl.innerText = `${overallStats.avgTotal} / 720`;
  if (avgPctEl) avgPctEl.innerText = `${overallStats.avgPct}%`;
  if (avgCountEl) avgCountEl.innerText = `${overallStats.count}`;

  container.innerHTML = '';
  if (tests.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">No AAKASH tests recorded yet. Add your AAKASH AIATS/NRT/TT test score above!</div>';
    return;
  }

  tests.forEach(t => {
    const typeLabel = t.testType || 'AIATS';
    const typeBadge = typeLabel === 'NRT' ? '📖 NRT' : (typeLabel === 'OMT' ? '🌐 OMT' : typeLabel);
    const classTag = (t.testClass === '12') ? 'Class 12' : (t.testClass === 'Full' ? 'Full Syllabus' : 'Class 11');
    const classBadgeColor = (t.testClass === '12') ? 'background:#f3e8ff; color:#6b21a8;' : 'background:#e0e7ff; color:#3730a3;';

    const card = document.createElement('div');
    card.className = 'test-item-card';
    card.innerHTML = `
      <div class="test-item-main">
        <div class="test-title-row">
          <span class="test-name-txt">${escapeHtml(t.testName)}</span>
          <span class="tag-badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${escapeHtml(typeBadge)}</span>
          <span class="tag-badge" style="${classBadgeColor} font-weight:700;">${classTag}</span>
          <span class="test-date-txt">📅 ${t.testDate}</span>
        </div>
        <div class="test-marks-detail">
          <span>⚡ Physics: ${t.physics}/180</span>
          <span>🧪 Chemistry: ${t.chemistry}/180</span>
          <span>🧬 Biology: ${t.biology}/360</span>
        </div>
        ${t.remarks ? `<div class="test-remarks">💬 ${escapeHtml(t.remarks)}</div>` : ''}
      </div>
      <div class="test-score-badge">
        <div class="total-num">${t.total}</div>
        <div class="total-max">/ 720</div>
        <div class="pct-num">${t.percentage}%</div>
        <button class="btn-del" onclick="deleteMockTest(${t.id})" style="margin-top:4px;">✕</button>
      </div>
    `;
    container.appendChild(card);
  });
}

async function deleteMockTest(id) {
  try {
    const res = await fetch(`/api/tests/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      appState.db.mockTests = data.mockTests;
    }
  } catch (e) {
    appState.db.mockTests = (appState.db.mockTests || []).filter(t => t.id !== id);
    saveStateBackend();
  }
  renderMockTests();
}

// Tasks & Goals Logic
function bindTasksLogic() {
  const addBtn = document.getElementById('addTaskBtn');
  if (addBtn) {
    addBtn.onclick = () => {
      const desc = document.getElementById('desc').value.trim();
      const subject = document.getElementById('subjectSelect').value;
      const hrs = parseFloat(document.getElementById('hrs').value);
      if (!desc || isNaN(hrs) || hrs <= 0) {
        return alert('Please enter topic and valid hours');
      }

      appState.db.tasks.push({
        id: Date.now(),
        desc, subject, hrs,
        cls: currentSelectedClass,
        completed: false,
        completedOn: null
      });

      document.getElementById('desc').value = '';
      document.getElementById('hrs').value = '';
      saveStateBackend();
      renderTasksAndHours();
    };
  }
}

function toggleTask(id) {
  const task = appState.db.tasks.find(t => t.id === id);
  const day = getTodayIndex();
  if (task) {
    if (!task.completed) {
      task.completed = true;
      task.completedOn = day;
      appState.db.dailyLog[day] = (appState.db.dailyLog[day] || 0) + task.hrs;
    } else {
      if (task.completedOn !== null) {
        appState.db.dailyLog[task.completedOn] = Math.max(0, (appState.db.dailyLog[task.completedOn] || 0) - task.hrs);
      }
      task.completed = false;
      task.completedOn = null;
    }
    saveStateBackend();
    renderTasksAndHours();
    updateStreak();
  }
}

function deleteTask(id) {
  const task = appState.db.tasks.find(t => t.id === id);
  if (task) {
    if (task.completed && task.completedOn !== null) {
      appState.db.dailyLog[task.completedOn] = Math.max(0, (appState.db.dailyLog[task.completedOn] || 0) - task.hrs);
    }
    appState.db.tasks = appState.db.tasks.filter(t => t.id !== id);
    saveStateBackend();
    renderTasksAndHours();
    updateStreak();
  }
}

function renderTasksAndHours() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  let total11 = 0, total12 = 0;

  (appState.db.tasks || []).forEach(task => {
    if (task.completed) {
      if (task.cls === '11') total11 += task.hrs;
      else total12 += task.hrs;
    }
    const isChecked = task.completed ? 'checked' : '';
    const deleteBtn = !task.completed
      ? `<button class="btn-del" onclick="deleteTask(${task.id})">✕</button>`
      : `<span style="font-size:10px; color:#10b981; font-weight:600;">✓ Done</span>`;

    list.innerHTML += `
      <div class="task-item">
        <input type="checkbox" class="cb" ${isChecked} onchange="toggleTask(${task.id})">
        <div style="flex:1">
          <span class="task-title ${task.completed ? 'checked' : ''}">${escapeHtml(task.desc)}</span>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">
            <span>${task.subject}</span> | <span>Class ${task.cls}</span> | <span>⏱ ${task.hrs}h</span>
          </div>
        </div>
        ${deleteBtn}
      </div>
    `;
  });

  if ((appState.db.tasks || []).length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">➕ Add weekly goals above</div>';
  }

  // Update Bar 11th and 12th
  updateBar('11', total11, 15);
  updateBar('12', total12, 20);

  // Render Daily Grid
  const grid = document.getElementById('dailyGrid');
  if (grid) {
    grid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const hours = (appState.db.dailyLog[i] || 0).toFixed(1);
      const isActive = (appState.db.dailyLog[i] || 0) > 0;
      grid.innerHTML += `
        <div class="day-node" style="border-color: ${isActive ? 'var(--success)' : '#e2e8f0'}">
          <div class="d-name">${daysArr[i]}</div>
          <div class="d-val">${hours}</div>
        </div>
      `;
    }
  }
}

function updateBar(cls, val, goal) {
  const p = Math.min((val / goal) * 100, 100);
  const bar = document.getElementById(`bar${cls}`);
  if (bar) {
    bar.style.width = p + '%';
    bar.innerText = Math.round(p) + '%';
  }
  document.getElementById(`txt${cls}`).innerText = `${val}/${goal}h`;
}

// Backup & Export Helpers
function bindBackupActions() {
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportToCSV);
  document.getElementById('exportJsonBtn')?.addEventListener('click', exportToJSON);
  document.getElementById('importJsonInput')?.addEventListener('change', importFromJSON);
  document.getElementById('manualResetBtn')?.addEventListener('click', async () => {
    if (confirm("Reset weekly study hours and question counts? (Your Streak, Syllabus progress, and Coaching Test scores will be PRESERVED)")) {
      try {
        const res = await fetch('/api/reset-week', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          appState.db = data.db;
        }
      } catch (e) {
        appState.db.tasks = [];
        appState.db.dailyLog = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        appState.db.questionLog = {};
        for (let i = 0; i < 7; i++) appState.db.questionLog[i] = { physics: 0, chemistry: 0, botony: 0, zoology: 0 };
        saveStateBackend();
      }
      renderAll();
      alert('Weekly hours reset successfully!');
    }
  });
}

function exportToCSV() {
  let csvRows = [];
  csvRows.push("=== COACHING MOCK TEST SCORES ===");
  csvRows.push("Test Name,Date,Physics (/180),Chemistry (/180),Biology (/360),Total (/720),Percentage,Remarks");
  (appState.db.mockTests || []).forEach(t => {
    csvRows.push(`"${t.testName}","${t.testDate}",${t.physics},${t.chemistry},${t.biology},${t.total},${t.percentage}%,"${t.remarks}"`);
  });

  csvRows.push("", "=== WEEKLY STUDY TASKS ===");
  csvRows.push("Topic,Subject,Hours,Class,Status");
  (appState.db.tasks || []).forEach(t => {
    csvRows.push(`"${t.desc}","${t.subject}",${t.hrs},Class ${t.cls},${t.completed ? 'Done' : 'Pending'}`);
  });

  csvRows.push("", "=== STREAK INFO ===");
  csvRows.push(`Current Streak,${appState.db.streakData ? appState.db.streakData.currentStreak : 0} days`);
  csvRows.push(`Best Streak,${appState.db.streakData ? appState.db.streakData.bestStreak : 0} days`);

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NEET_Master_Study_Log.csv`;
  a.click();
}

function exportToJSON() {
  const jsonStr = JSON.stringify(appState, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NEET_Master_Backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function importFromJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed.db) {
        appState.db = parsed.db;
        if (parsed.syllabusList) appState.syllabusList = parsed.syllabusList;
        await saveStateBackend();
        renderAll();
        alert('✅ Backup restored successfully!');
      } else {
        alert('Invalid backup file format');
      }
    } catch (err) {
      alert('Error parsing backup JSON file');
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  const quoteEl = document.getElementById('quote');
  if (quoteEl) quoteEl.innerText = `"${quotes[getTodayIndex()]}"`;

  renderStreakUI();
  renderDashboardQuestions();
  renderSyllabus();
  renderMockTests();
  renderTasksAndHours();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Global window mappings
window.toggleSyllabusStage = toggleSyllabusStage;
window.changeRevision = changeRevision;
window.deleteMockTest = deleteMockTest;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;

// Init Application
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initClassToggle();
  bindQuestionDirectInputs();
  bindMockTestForm();
  bindTasksLogic();
  bindBackupActions();
  initCustomModal();

  document.getElementById('chapterSearch')?.addEventListener('input', renderSyllabus);
  document.getElementById('subjectFilter')?.addEventListener('change', renderSyllabus);
  document.getElementById('classFilter')?.addEventListener('change', renderSyllabus);

  loadState();
});
