// ==================== SRS 階段設定 ====================
const SRS_STAGES = [
  { stage: 0, label: '🆕 新字',   days: 3  },
  { stage: 1, label: '📖 學習中', days: 7  },
  { stage: 2, label: '✅ 已掌握', days: 30 },
  { stage: 3, label: '🌟 熟練',   days: null },
];

function getSrsLabel(stage) { return (SRS_STAGES[stage] || SRS_STAGES[0]).label; }
function getSrsClass(stage) {
  if (stage >= 3) return 'streak-great';
  if (stage >= 1) return 'streak-good';
  return 'streak-new';
}
function calcNextReview(stage, correct) {
  if (!correct) return { stage: 0, nextReview: Date.now() + 3 * 86400000 };
  const next = Math.min(stage + 1, 3);
  const days = SRS_STAGES[next] ? SRS_STAGES[next].days : null;
  const nextReview = days ? Date.now() + days * 86400000 : Date.now() + 9999 * 86400000;
  return { stage: next, nextReview };
}

// ==================== STATE ====================
let state = {
  lang: 'en',
  currentUser: null,
  words: [],
  jaWords: [],
  hiragana: {},
  enXp: 0,
  jaXp: 0,
  xp: 0,
  totalQuizzes: 0,
  totalCorrect: 0,
  wrongWords: { en: {}, ja: {} },
  settings: {
    dailyReviewCount: 5,
    scriptUrl: 'https://script.google.com/macros/s/AKfycbzHmM7yXQskkWHKXF0B-obIJrMAhuKCdKaSDZnhjZUOogYykrlJSq762CeD5YlQt560/exec',
    secret: '5566',
  }
};

const EN_LEVELS = [
  { name: '🌱 英語新芽', min: 0 },
  { name: '🐛 努力學習者', min: 100 },
  { name: '🦋 單字探險家', min: 250 },
  { name: '⭐ 英語小勇士', min: 500 },
  { name: '🔥 句子大師', min: 900 },
  { name: '👑 英語冒險王', min: 1500 },
];
const JA_LEVELS = [
  { name: '🌱 日語新芽', min: 0 },
  { name: '🐛 努力學習者', min: 100 },
  { name: '🦋 單字探險家', min: 250 },
  { name: '⭐ 日語小勇士', min: 500 },
  { name: '🔥 句子大師', min: 900 },
  { name: '👑 日語冒險王', min: 1500 },
];
function getLevels() { return state.lang === 'ja' ? JA_LEVELS : EN_LEVELS; }

function getLevel(xp) {
  const LEVELS = getLevels();
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) { if (xp >= LEVELS[i].min) { idx = i; break; } }
  const lv = LEVELS[idx], next = LEVELS[idx + 1];
  if (next) {
    const pct = Math.round(((xp - lv.min) / (next.min - lv.min)) * 100);
    return { name: lv.name, pct, label: `${xp - lv.min} / ${next.min - lv.min} XP`, num: `Lv.${idx + 1}` };
  }
  return { name: lv.name, pct: 100, label: `${xp} XP`, num: `Lv.${idx + 1}` };
}

// ==================== 50音資料 ====================
const HIRAGANA_ROWS = [
  ['あ','い','う','え','お'],
  ['か','き','く','け','こ'],
  ['さ','し','す','せ','そ'],
  ['た','ち','つ','て','と'],
  ['な','に','ぬ','ね','の'],
  ['は','ひ','ふ','へ','ほ'],
  ['ま','み','む','め','も'],
  ['や','','ゆ','','よ'],
  ['ら','り','る','れ','ろ'],
  ['わ','','を','','ん'],
];
const HIRAGANA_FLAT = HIRAGANA_ROWS.flat().filter(c => c !== '');
const HIRAGANA_ROMAJI = {
  'あ':'a','い':'i','う':'u','え':'e','お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
  'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo',
  'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','を':'wo','ん':'n',
};

// ==================== STORAGE ====================
function getStorageKey() { return state.currentUser ? `ea_state_${state.currentUser}` : 'ea_state'; }
function save() { try { localStorage.setItem(getStorageKey(), JSON.stringify(state)); } catch(e) {} }

function load(userName) {
  try {
    const key = userName ? `ea_state_${userName}` : 'ea_state';
    const s = localStorage.getItem(key);
    if (s) {
      const loaded = JSON.parse(s);
      state = { ...state, ...loaded };
      state.currentUser = userName || loaded.currentUser || null;
      delete state.sentences;
      if (state.xp && !state.enXp) state.enXp = state.xp;
      state.xp = 0;
      if (state.wrongWords && !state.wrongWords.en) {
        state.wrongWords = { en: state.wrongWords, ja: {} };
      }
      state.words.forEach(w => { if (w.stage === undefined) w.stage = Math.min(w.streak || 0, 3); });
      state.jaWords.forEach(w => { if (w.stage === undefined) w.stage = Math.min(w.streak || 0, 3); });
      state.settings = { ...state.settings, ...loaded.settings };
    } else {
      state = {
        lang: 'en', currentUser: userName || null,
        words: [], jaWords: [], hiragana: {},
        enXp: 0, jaXp: 0, xp: 0,
        totalQuizzes: 0, totalCorrect: 0,
        wrongWords: { en: {}, ja: {} },
        settings: state.settings,
      };
    }
  } catch(e) {}
}

// ==================== 用戶管理 ====================
function getAllUsers() { return JSON.parse(localStorage.getItem('ea_users') || '[]'); }
function saveUsers(users) { localStorage.setItem('ea_users', JSON.stringify(users)); }
function getLastUser() { return localStorage.getItem('ea_last_user') || null; }
function setLastUser(name) { localStorage.setItem('ea_last_user', name); }

function loginUser(name) {
  state.currentUser = name;
  load(name);
  setLastUser(name);
  renderNav();
  updateAddSection();
  renderGenreGrid(storyState.level);
  updateHome();
  showScreen('home');
  document.getElementById('userSelectScreen').style.display = 'none';
  document.getElementById('appWrapper').style.display = 'block';
}

function showUserSelect() {
  document.getElementById('userSelectScreen').style.display = 'flex';
  document.getElementById('appWrapper').style.display = 'none';
  renderUserSelect();
}

function renderUserSelect() {
  const users = getAllUsers();
  const container = document.getElementById('userSelectScreen');
  container.innerHTML = `
    <div class="user-select-wrap">
      <div class="user-select-title">👋 你是誰？</div>
      <div class="user-list">
        ${users.map(u => `
          <button class="user-btn" onclick="loginUser('${esc(u.name)}')">
            <span class="user-emoji">${u.emoji}</span>
            <span class="user-name">${u.name}</span>
          </button>`).join('')}
        <button class="user-btn user-add-btn" onclick="showAddUser()">
          <span class="user-emoji">➕</span>
          <span class="user-name">新增用戶</span>
        </button>
      </div>
    </div>`;
}

function showAddUser() {
  const container = document.getElementById('userSelectScreen');
  const emojis = ['👦','👧','👨','👩','🧒','👴','👵','🧑','🐶','🐱','🦊','🐼'];
  container.innerHTML = `
    <div class="user-select-wrap">
      <div class="user-select-title">新增用戶</div>
      <div class="user-emoji-grid">
        ${emojis.map(e => `<button class="emoji-pick-btn" onclick="selectUserEmoji(this,'${e}')">${e}</button>`).join('')}
      </div>
      <div id="selectedEmoji" style="font-size:48px;text-align:center;margin:12px 0">👦</div>
      <input id="newUserName" type="text" placeholder="輸入名字"
        style="width:100%;border:2px solid #E3F2FD;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-size:18px;text-align:center;outline:none;-webkit-user-select:auto;user-select:auto;margin-bottom:12px">
      <button onclick="createUser()" style="width:100%;background:linear-gradient(135deg,#29B6F6,#0288D1);color:white;border:none;border-radius:14px;padding:14px;font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;cursor:pointer">
        ✅ 建立用戶
      </button>
      ${getAllUsers().length > 0 ? `<button onclick="renderUserSelect()" style="width:100%;background:#E3F2FD;color:var(--sky-dark);border:none;border-radius:14px;padding:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;margin-top:8px">← 返回</button>` : ''}
    </div>`;
}

let _selectedUserEmoji = '👦';
function selectUserEmoji(btn, emoji) {
  _selectedUserEmoji = emoji;
  document.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('selectedEmoji').textContent = emoji;
}

function createUser() {
  const name = document.getElementById('newUserName').value.trim();
  if (!name) { alert('請輸入名字'); return; }
  const users = getAllUsers();
  if (users.find(u => u.name === name)) { alert('這個名字已存在'); return; }
  users.push({ name, emoji: _selectedUserEmoji });
  saveUsers(users);
  loginUser(name);
}

// ==================== Google Sheets 同步 ====================
async function sheetsAdd(lang, wordObj) {
  if (!state.currentUser) return;
  try { await callScript({ type: 'sheets_add', user: state.currentUser, lang, word: wordObj }); }
  catch(e) { console.warn('Sheets 寫入失敗:', e.message); }
}

async function sheetsDelete(lang, word) {
  if (!state.currentUser) return;
  try { await callScript({ type: 'sheets_delete', user: state.currentUser, lang, word }); }
  catch(e) { console.warn('Sheets 刪除失敗:', e.message); }
}

async function sheetsUpdate(lang, word, stage, nextReview) {
  if (!state.currentUser) return;
  try { await callScript({ type: 'sheets_update', user: state.currentUser, lang, word, stage, nextReview }); }
  catch(e) { console.warn('Sheets 更新失敗:', e.message); }
}

async function refreshFromSheets() {
  if (!state.currentUser) return;
  showToast('🔄 從雲端讀取...');
  try {
    const data = await callScript({ type: 'sheets_read', user: state.currentUser });
    state.words = data.words || [];
    state.jaWords = data.jaWords || [];
    save();
    renderWordList();
    updateHome();
    showToast('✅ 同步完成！');
  } catch(e) {
    showToast('❌ 同步失敗：' + e.message);
  }
}

// ==================== IMPORT / EXPORT ====================
function exportWords() {
  const data = { words: state.words, jaWords: state.jaWords, hiragana: state.hiragana, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `語言冒險_${state.currentUser || 'data'}_${new Date().toLocaleDateString('zh-TW').replace(/\//g,'-')}.json`;
  a.click();
  showToast('✅ 匯出完成！');
}

let _importMode = 'merge';
function triggerImport(mode) {
  _importMode = mode;
  document.getElementById('importFileInput').value = '';
  document.getElementById('importFileInput').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (_importMode === 'replace') {
        if (!confirm(`確定要覆蓋？`)) return;
        state.words = data.words || [];
        state.jaWords = data.jaWords || [];
        state.hiragana = data.hiragana || {};
        showToast('✅ 已載入資料');
      } else {
        let added = 0;
        (data.words || []).forEach(w => {
          if (!state.words.find(x => x.en.toLowerCase() === w.en.toLowerCase())) { state.words.push(w); added++; }
        });
        (data.jaWords || []).forEach(w => {
          if (!state.jaWords.find(x => x.word === w.word)) { state.jaWords.push(w); added++; }
        });
        Object.entries(data.hiragana || {}).forEach(([k, v]) => {
          if (!state.hiragana[k]) state.hiragana[k] = v;
        });
        showToast(`✅ 合併完成！新增 ${added} 筆資料`);
      }
      save(); renderWordList();
    } catch(err) { showToast('❌ 檔案格式錯誤'); }
  };
  reader.readAsText(file);
}

// ==================== UI ====================
function getCurrentXp() { return state.lang === 'ja' ? (state.jaXp || 0) : (state.enXp || 0); }
function setCurrentXp(val) { if (state.lang === 'ja') state.jaXp = val; else state.enXp = val; }

function getDueWords() {
  const now = Date.now();
  const words = state.lang === 'ja' ? state.jaWords : state.words;
  return words
    .filter(w => (w.stage || 0) < 3 && w.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
    .slice(0, state.settings.dailyReviewCount || 5);
}

function esc(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function showToast(msg, duration) {
  duration = duration || 2500;
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), duration);
}

function updateAddSection() {
  const isJa = state.lang === 'ja';
  const enSec = document.getElementById('addEnSection');
  const jaSec = document.getElementById('addJaSection');
  if (enSec) enSec.style.display = isJa ? 'none' : 'block';
  if (jaSec) jaSec.style.display = isJa ? 'block' : 'none';
  const levelGrid = document.getElementById('levelGrid');
  if (levelGrid) {
    levelGrid.querySelectorAll('[data-level="L4"],[data-level="L5"]').forEach(btn => {
      btn.style.display = isJa ? 'none' : '';
    });
  }
}

function switchLang(lang) {
  state.lang = lang;
  save();
  document.querySelectorAll('.lang-flag').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  renderNav();
  updateAddSection();
  renderGenreGrid(storyState.level);
  showScreen('home');
}

function renderNav() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  const settingsBtn = `<button class="nav-btn" onclick="showScreen('settings')" id="nav-settings"><span class="icon">⚙️</span>設定</button>`;
  if (state.lang === 'en') {
    nav.innerHTML = `
      <button class="nav-btn active" onclick="showScreen('home')" id="nav-home"><span class="icon">🏠</span>首頁</button>
      <button class="nav-btn" onclick="showScreen('words')" id="nav-words"><span class="icon">📖</span>單字庫</button>
      <button class="nav-btn" onclick="showScreen('add')" id="nav-add"><span class="icon">➕</span>新增</button>
      <button class="nav-btn" onclick="showScreen('quiz')" id="nav-quiz"><span class="icon">🎯</span>測驗</button>
      <button class="nav-btn" onclick="showScreen('story')" id="nav-story"><span class="icon">📚</span>故事</button>
      <button class="nav-btn" onclick="showScreen('wrong')" id="nav-wrong"><span class="icon">❌</span>錯題本</button>
      ${settingsBtn}`;
  } else {
    nav.innerHTML = `
      <button class="nav-btn active" onclick="showScreen('home')" id="nav-home"><span class="icon">🏠</span>首頁</button>
      <button class="nav-btn" onclick="showScreen('hiragana')" id="nav-hiragana"><span class="icon">あ</span>50音</button>
      <button class="nav-btn" onclick="showScreen('words')" id="nav-words"><span class="icon">📖</span>單字庫</button>
      <button class="nav-btn" onclick="showScreen('quiz')" id="nav-quiz"><span class="icon">🎯</span>測驗</button>
      <button class="nav-btn" onclick="showScreen('story')" id="nav-story"><span class="icon">📚</span>故事</button>
      <button class="nav-btn" onclick="showScreen('wrong')" id="nav-wrong"><span class="icon">❌</span>錯題本</button>
      ${settingsBtn}`;
  }
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById('screen-' + name);
  if (!screen) return;
  screen.classList.add('active');
  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) navBtn.classList.add('active');
  if (name === 'words') renderWordList();
  if (name === 'wrong') renderWrong();
  if (name === 'home') updateHome();
  if (name === 'quiz') resetQuiz();
  if (name === 'story') renderGenreGrid(storyState.level);
  if (name === 'hiragana') renderHiraganaScreen();
  if (name === 'settings') renderSettings();
}

function updateHome() {
  const xp = getCurrentXp();
  const lv = getLevel(xp);
  const heroLevelName = document.getElementById('heroLevelName');
  const heroXpBar = document.getElementById('heroXpBar');
  const heroXpLabel = document.getElementById('heroXpLabel');
  const headerXP = document.getElementById('headerXP');
  const headerLevel = document.getElementById('headerLevel');
  if (heroLevelName) heroLevelName.textContent = lv.name;
  if (heroXpBar) heroXpBar.style.width = lv.pct + '%';
  if (heroXpLabel) heroXpLabel.textContent = lv.label;
  if (headerXP) headerXP.textContent = xp;
  if (headerLevel) headerLevel.textContent = lv.num;
  const statWords = document.getElementById('statWords');
  const statQuizzes = document.getElementById('statQuizzes');
  const statCorrect = document.getElementById('statCorrect');
  if (statWords) statWords.textContent = state.lang === 'en' ? state.words.length : state.jaWords.length;
  if (statQuizzes) statQuizzes.textContent = state.totalQuizzes;
  if (statCorrect) statCorrect.textContent = state.totalCorrect;

  const due = getDueWords();
  const reviewBanner = document.getElementById('reviewBanner');
  if (reviewBanner) {
    if (due.length > 0) {
      reviewBanner.style.display = 'block';
      reviewBanner.innerHTML = `<div class="review-banner" onclick="startReviewQuiz()">🔔 今天有 <strong>${due.length}</strong> 個單字需要複習！點此開始 →</div>`;
    } else {
      reviewBanner.style.display = 'none';
    }
  }
}

function addXP(amount) {
  const xp = getCurrentXp();
  const before = getLevel(xp).num;
  setCurrentXp(xp + amount);
  const after = getLevel(getCurrentXp()).num;
  save(); updateHome();
  const headerXP = document.getElementById('headerXP');
  const headerLevel = document.getElementById('headerLevel');
  if (headerXP) headerXP.textContent = getCurrentXp();
  if (headerLevel) headerLevel.textContent = after;
  if (before !== after) { showToast('🎉 升級了！' + getLevel(getCurrentXp()).name); confetti(); }
}

// ==================== WORD LIST ====================
let wordListSort = 'group';

function renderWordList() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const container = document.getElementById('wordListContainer');
  if (!container) return;
  const isJa = state.lang === 'ja';
  let words = isJa
    ? state.jaWords.filter(w => !q || w.word.includes(q) || w.zh.includes(q))
    : state.words.filter(w => !q || w.en.toLowerCase().includes(q) || w.zh.includes(q));

  if (!words.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>還沒有單字，去新增吧！</p></div>`;
    return;
  }

  const sortBar = `<div class="sort-bar">
    <span class="sort-label">排序：</span>
    <button class="sort-btn ${wordListSort==='group'?'active':''}" onclick="setWordSort('group')">🎯 熟練度</button>
    <button class="sort-btn ${wordListSort==='newest'?'active':''}" onclick="setWordSort('newest')">🆕 最新</button>
    <button class="sort-btn ${wordListSort==='oldest'?'active':''}" onclick="setWordSort('oldest')">📅 最舊</button>
    <button class="sort-btn ${wordListSort==='alpha'?'active':''}" onclick="setWordSort('alpha')">🔤 字母</button>
  </div>`;

  let html = sortBar;

  if (wordListSort === 'group') {
    const groups = [
      { key: 'new',   label: '🆕 新字',   filter: w => (w.stage||0) === 0 },
      { key: 'good',  label: '📖 學習中',  filter: w => (w.stage||0) === 1 },
      { key: 'great', label: '✅ 已掌握',  filter: w => (w.stage||0) === 2 },
      { key: 'done',  label: '🌟 熟練',    filter: w => (w.stage||0) >= 3 },
    ];
    groups.forEach(g => {
      const gWords = words.filter(g.filter);
      if (!gWords.length) return;
      html += `<div class="word-group-label">${g.label} <span class="word-group-count">${gWords.length}</span></div>`;
      html += gWords.map((w, i) => renderWordItem(w, i, isJa)).join('');
    });
  } else {
    if (wordListSort === 'newest') words = [...words].reverse();
    else if (wordListSort === 'alpha') words = [...words].sort((a, b) => (isJa ? a.word : a.en).localeCompare(isJa ? b.word : b.en));
    html += words.map((w, i) => renderWordItem(w, i, isJa)).join('');
  }

  container.innerHTML = html;
}

function setWordSort(sort) { wordListSort = sort; renderWordList(); }

function renderWordItem(w, i, isJa) {
  const icons = ['🍎','🐶','⭐','🎈','🌈','🦁','🌸','🚀','🎵','🍭','🐠','🌻'];
  const stage = w.stage !== undefined ? w.stage : (w.streak || 0);
  const sc = getSrsClass(stage);
  const sl = getSrsLabel(stage);
  if (isJa) {
    const idx = state.jaWords.indexOf(w);
    return `<div class="word-item word-item-card">
      <div class="word-item-top">
        <div class="word-item-icon">${icons[i % icons.length]}</div>
        <div class="word-info">
          <div class="word-en">${w.word} <span style="font-size:13px;color:#90A4AE">${w.reading||''}</span> ${w.pos ? `<span style="font-size:12px;color:#90A4AE;font-weight:600">${w.pos}</span>` : ''}</div>
          <div class="word-zh">${w.zh}</div>
        </div>
        <div class="word-meta">
          <span class="word-streak ${sc}">${sl}</span>
          <button class="speak-btn" onclick="speak('${esc(w.word)}','ja-JP')">🔊</button>
        </div>
        <button class="delete-btn" onclick="deleteJaWord(${idx})">🗑</button>
      </div>
      ${w.sentence ? `<div class="word-sentence-full">${w.sentence}<button class="speak-btn" style="width:26px;height:26px;font-size:12px;flex-shrink:0" onclick="speak('${esc(w.sentence)}','ja-JP')">🔊</button></div>` : ''}
    </div>`;
  }
  const idx = state.words.indexOf(w);
  return `<div class="word-item word-item-card">
    <div class="word-item-top">
      <div class="word-item-icon">${icons[i % icons.length]}</div>
      <div class="word-info">
        <div class="word-en">${w.en} ${w.pos ? `<span style="font-size:12px;color:#90A4AE;font-weight:600">${w.pos}</span>` : ''}</div>
        <div class="word-zh">${w.zh}</div>
      </div>
      <div class="word-meta">
        <span class="word-streak ${sc}">${sl}</span>
        <button class="speak-btn" onclick="speak('${esc(w.en)}')">🔊</button>
      </div>
      <button class="delete-btn" onclick="deleteWord(${idx})">🗑</button>
    </div>
    ${w.sentence ? `<div class="word-sentence-full">${w.sentence}<button class="speak-btn" style="width:26px;height:26px;font-size:12px;flex-shrink:0" onclick="speak('${esc(w.sentence)}')">🔊</button></div>` : ''}
  </div>`;
}

function renderWrong() {
  const container = document.getElementById('wrongContainer');
  if (!container) return;
  const isJa = state.lang === 'ja';
  const wrongMap = isJa ? (state.wrongWords.ja || {}) : (state.wrongWords.en || {});
  const entries = Object.entries(wrongMap).filter(([,v]) => v > 0);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">🎉</div><p>還沒有錯誤記錄，繼續加油！</p></div>`;
    return;
  }
  entries.sort((a,b) => b[1]-a[1]);
  container.innerHTML = entries.map(([key, count]) => {
    const w = isJa ? state.jaWords.find(x => x.word === key) : state.words.find(x => x.en === key);
    return `<div class="wrong-item"><div class="wrong-en">${key}</div>${w ? `<div class="wrong-zh">${w.zh}</div>` : ''}<div class="wrong-count">答錯 ${count} 次</div></div>`;
  }).join('');
}

// ==================== ADD WORD ====================
let _lastLookedUp = '';

async function autoLookup() {
  if (state.lang === 'ja') { await autoLookupJa(); return; }
  const en = document.getElementById('addWord').value.trim();
  if (!en || en === _lastLookedUp) return;
  _lastLookedUp = en;
  const status = document.getElementById('lookupStatus');
  const btn = document.getElementById('lookupBtn');
  status.style.display = 'flex'; status.style.alignItems = 'center'; status.style.gap = '6px';
  status.innerHTML = `<span class="loading-dots" style="color:#7B1FA2"><span></span><span></span><span></span></span> AI 查詢中...`;
  btn.disabled = true;
  try {
    const r = await callScript({ type: 'lookup', word: en });
    document.getElementById('addPos').value = r.pos || '';
    document.getElementById('addZh').value = r.zh || '';
    document.getElementById('addSentence').value = r.sentence || '';
    status.innerHTML = '✅ 已自動填入，可修改後再加入'; status.style.color = '#388E3C';
  } catch(e) { status.innerHTML = '❌ ' + e.message; status.style.color = '#EF5350'; }
  btn.disabled = false;
}

async function autoLookupJa() {
  const word = document.getElementById('addWordJa').value.trim();
  if (!word || word === _lastLookedUp) return;
  _lastLookedUp = word;
  const status = document.getElementById('lookupStatusJa');
  const btn = document.getElementById('lookupBtnJa');
  status.style.display = 'flex'; status.style.alignItems = 'center'; status.style.gap = '6px';
  status.innerHTML = `<span class="loading-dots" style="color:#E91E63"><span></span><span></span><span></span></span> AI 查詢中...`;
  btn.disabled = true;
  try {
    const r = await callScript({ type: 'ja_lookup', word });
    document.getElementById('addReadingJa').value = r.reading || '';
    document.getElementById('addPosJa').value = r.pos || '';
    document.getElementById('addZhJa').value = r.zh || '';
    document.getElementById('addSentenceJa').value = r.sentence || '';
    status.innerHTML = '✅ 已自動填入，可修改後再加入'; status.style.color = '#388E3C';
  } catch(e) { status.innerHTML = '❌ ' + e.message; status.style.color = '#EF5350'; }
  btn.disabled = false;
}

function addWord() {
  const en = document.getElementById('addWord').value.trim();
  const zh = document.getElementById('addZh').value.trim();
  const pos = document.getElementById('addPos').value.trim();
  const sentence = document.getElementById('addSentence').value.trim();
  if (!en || !zh) { showToast('⚠️ 請填入英文和中文'); return; }
  if (state.words.find(x => x.en.toLowerCase() === en.toLowerCase())) { showToast(`⚠️ 單字庫已有「${en}」`); return; }
  const wordObj = { en, zh, pos, sentence, stage: 0, streak: 0, nextReview: Date.now() };
  state.words.push(wordObj);
  save();
  sheetsAdd('en', wordObj);
  ['addWord','addZh','addPos','addSentence'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lookupStatus').style.display = 'none';
  _lastLookedUp = '';
  showToast('✅ 單字加入成功！'); addXP(5);
}

function addJaWord() {
  const word = document.getElementById('addWordJa').value.trim();
  const zh = document.getElementById('addZhJa').value.trim();
  const reading = document.getElementById('addReadingJa').value.trim();
  const pos = document.getElementById('addPosJa').value.trim();
  const sentence = document.getElementById('addSentenceJa').value.trim();
  if (!word || !zh) { showToast('⚠️ 請填入日文和中文'); return; }
  if (state.jaWords.find(x => x.word === word)) { showToast(`⚠️ 單字庫已有「${word}」`); return; }
  const wordObj = { word, reading, zh, pos, sentence, stage: 0, streak: 0, nextReview: Date.now() };
  state.jaWords.push(wordObj);
  save();
  sheetsAdd('ja', wordObj);
  ['addWordJa','addZhJa','addReadingJa','addPosJa','addSentenceJa'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lookupStatusJa').style.display = 'none';
  _lastLookedUp = '';
  showToast('✅ 單字加入成功！'); addXP(5);
}

function deleteWord(idx) {
  if (confirm('確定要刪除這個單字嗎？')) {
    const w = state.words[idx];
    state.words.splice(idx, 1); save();
    sheetsDelete('en', w.en);
    renderWordList(); showToast('🗑 已刪除');
  }
}

function deleteJaWord(idx) {
  if (confirm('確定要刪除這個單字嗎？')) {
    const w = state.jaWords[idx];
    state.jaWords.splice(idx, 1); save();
    sheetsDelete('ja', w.word);
    renderWordList(); showToast('🗑 已刪除');
  }
}

// ==================== TTS ====================
const LEVEL_RATES = { 'L0.5': 0.65, L1: 0.7, L2: 0.78, L3: 0.82, L4: 0.9, L5: 1.0 };

function stripEmoji(text) {
  return (text || '').replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA9F}]/gu, '').trim();
}

function speak(text, lang, rate) {
  lang = lang || 'en-US';
  rate = rate || 0.85;
  if (!window.speechSynthesis) { showToast('此裝置不支援語音'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(stripEmoji(text));
  u.lang = lang; u.rate = rate;
  window.speechSynthesis.speak(u);
}

let _ttsAudio = null;
let _ttsPlaying = false;

async function speakGemini(text, lang) {
  lang = lang || 'en';
  const langCode = lang === 'ja' ? 'ja-JP' : 'en-US';
  const rate = LEVEL_RATES[storyState.level] || 0.85;

  // 防止重複播放
  if (_ttsPlaying) { stopGeminiTTS(); }
  _ttsPlaying = true;

  try {
    if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null; }
    const result = await callScript({ type: 'tts', text: stripEmoji(text), lang });
    if (!result.audioData) throw new Error('沒有音訊資料');

    // 再次檢查是否已被取消
    if (!_ttsPlaying) return;

    const audio = new Audio(`data:${result.mimeType || 'audio/wav'};base64,${result.audioData}`);
    _ttsAudio = audio;
    return new Promise((resolve) => {
      audio.onended = () => { _ttsPlaying = false; resolve(); };
      audio.onerror = () => {
        _ttsPlaying = false;
        speakWebSpeech(text, langCode, rate).then(resolve);
      };
      audio.play().catch(() => {
        _ttsPlaying = false;
        speakWebSpeech(text, langCode, rate).then(resolve);
      });
    });
  } catch(e) {
    _ttsPlaying = false;
    return speakWebSpeech(text, langCode, rate);
  }
}

function speakWebSpeech(text, langCode, rate) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripEmoji(text));
    u.lang = langCode || 'en-US';
    u.rate = rate || 0.85;
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

async function testTTS() {
  showToast('⏳ 測試中...', 10000);
  try {
    const result = await callScript({ type: 'tts', text: 'Hello, this is a test.', lang: 'en' });
    if (result.audioData) {
      const audio = new Audio(`data:${result.mimeType || 'audio/wav'};base64,${result.audioData}`);
      audio.play();
      showToast('✅ Gemini TTS 正常！', 3000);
    } else {
      showToast('❌ 沒有音訊資料：' + JSON.stringify(result).slice(0, 80), 5000);
    }
  } catch(e) {
    showToast('❌ TTS 錯誤：' + e.message.slice(0, 100), 6000);
  }
}

function stopGeminiTTS() {
  _ttsPlaying = false;
  if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio.currentTime = 0; _ttsAudio = null; }
  window.speechSynthesis && window.speechSynthesis.cancel();
}

// ==================== FILL-IN-BLANK ====================
function makeBlank(word) {
  const len = word.length;
  let blankCount;
  if (len <= 3) blankCount = 1;
  else if (len <= 6) blankCount = 2;
  else blankCount = 3;
  const start = 1, end = len - 1;
  const available = end - start;
  const mid = Math.floor((start + end) / 2);
  const positions = new Set();
  positions.add(mid);
  let left = mid - 1, right = mid + 1;
  while (positions.size < Math.min(blankCount, available)) {
    if (left >= start) positions.add(left--);
    if (positions.size < Math.min(blankCount, available) && right < end) positions.add(right++);
    if (left < start && right >= end) break;
  }
  const display = word.split('').map((c, i) => positions.has(i) ? '_' : c).join('');
  const answer = word.split('').filter((c, i) => positions.has(i)).join('');
  return { display, answer };
}

// ==================== QUIZ ====================
let quiz = { questions: [], idx: 0, correct: 0, type: '', clozeSelected: null };

function getWordKey(word) { return state.lang === 'ja' ? word.word : word.en; }

function getSpacedWords() {
  const now = Date.now();
  const words = state.lang === 'ja' ? state.jaWords : state.words;
  const due = words.filter(w => w.nextReview <= now);
  const notDue = words.filter(w => w.nextReview > now);
  return [...due, ...notDue].slice(0, 10);
}

function startQuiz(type) {
  const words = getSpacedWords();
  if (!words.length) { showToast('⚠️ 請先新增單字！'); return; }
  quiz.type = type; quiz.questions = []; quiz.idx = 0; quiz.correct = 0;
  document.getElementById('quizMenu').style.display = 'none';
  document.getElementById('quizPlay').classList.add('active');
  document.getElementById('feedbackBox').style.display = 'none';
  const pool = [...words].sort(() => Math.random() - 0.5).slice(0, 10);
  quiz.questions = pool.map(w => ({ type: 'spelling', word: w }));
  renderQuestion();
}

function renderQuestion() {
  quiz.clozeSelected = null;
  const q = quiz.questions[quiz.idx];
  const total = quiz.questions.length;
  const isJa = state.lang === 'ja';
  document.getElementById('quizProgressText').textContent = `第 ${quiz.idx+1} 題 / 共 ${total} 題`;
  document.getElementById('quizScoreText').textContent = `✅ ${quiz.correct} 答對`;
  document.getElementById('quizProgressBar').style.width = Math.round((quiz.idx/total)*100) + '%';
  document.getElementById('feedbackBox').style.display = 'none';
  document.getElementById('feedbackBox').className = 'feedback-box';
  document.getElementById('checkBtn').style.display = 'block';
  document.getElementById('nextBtn').style.display = 'none';

  const wordKey = getWordKey(q.word);
  const { display } = makeBlank(wordKey);
  const displayHtml = display.split('').map(c =>
    c === '_' ? `<span class="blank-char">_</span>` : `<span class="fixed-char">${c}</span>`
  ).join('');
  const html = `<div class="question-type-label">填空測驗</div>
    <button class="speak-big-btn" id="speakBtn" onclick="speakQuestion()">🔊</button>
    <div class="question-hint">聽發音，寫出完整單字（提示如下）</div>
    <div class="question-zh">${q.word.zh}</div>
    <div class="blank-display">${displayHtml}</div>
    <input class="answer-input" id="answerInput" type="text" placeholder="輸入完整單字..."
      autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
      style="max-width:240px;margin:0 auto 12px;display:block">`;
  document.getElementById('questionCard').innerHTML = html;
  setTimeout(() => speakQuestion(), 400);
}

function speakQuestion() {
  const q = quiz.questions[quiz.idx];
  const btn = document.getElementById('speakBtn');
  if (!btn) return;
  btn.classList.add('speaking');
  const isJa = state.lang === 'ja';
  speak(getWordKey(q.word), isJa ? 'ja-JP' : 'en-US', 0.8);
  setTimeout(() => btn && btn.classList.remove('speaking'), 2000);
}

function checkAnswer() {
  const q = quiz.questions[quiz.idx];
  const input = document.getElementById('answerInput');
  const val = input ? input.value.trim() : '';
  if (!val) { showToast('請填入答案！'); return; }
  const correct = getWordKey(q.word);
  const isCorrect = val.toLowerCase().trim() === correct.toLowerCase().trim();
  const fb = document.getElementById('feedbackBox');
  fb.style.display = 'block';
  if (input) input.className = 'answer-input ' + (isCorrect ? 'correct' : 'wrong');

  if (isCorrect) {
    fb.className = 'feedback-box correct';
    document.getElementById('feedbackEmoji').textContent = ['🎉','⭐','🌟','✨','🥳'][Math.floor(Math.random()*5)];
    document.getElementById('feedbackText').textContent = ['太棒了！','答對了！','好厲害！','完美！'][Math.floor(Math.random()*4)];
    quiz.correct++; state.totalCorrect++;
    const { stage, nextReview } = calcNextReview(q.word.stage || 0, true);
    q.word.stage = stage; q.word.streak = stage; q.word.nextReview = nextReview;
    const days = SRS_STAGES[stage] ? SRS_STAGES[stage].days : null;
    document.getElementById('feedbackAnswer').textContent = days ? `下次複習：${days}天後` : '🌟 已熟練！';
    const lang = state.lang === 'ja' ? 'ja' : 'en';
    sheetsUpdate(lang, correct, stage, nextReview);
    playCorrectSound();
    if (Math.random() < 0.4) confetti();
  } else {
    fb.className = 'feedback-box wrong';
    document.getElementById('feedbackEmoji').textContent = '💪';
    document.getElementById('feedbackText').textContent = '沒關係，再加油！';
    document.getElementById('feedbackAnswer').textContent = `正確答案：${correct}`;
    const { stage, nextReview } = calcNextReview(q.word.stage || 0, false);
    q.word.stage = stage; q.word.streak = stage; q.word.nextReview = nextReview;
    const lang = state.lang === 'ja' ? 'ja' : 'en';
    if (!state.wrongWords[lang]) state.wrongWords[lang] = {};
    state.wrongWords[lang][correct] = (state.wrongWords[lang][correct] || 0) + 1;
    sheetsUpdate(lang, correct, stage, nextReview);
  }
  document.getElementById('checkBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'block';
  save();
}

function nextQuestion() { quiz.idx++; if (quiz.idx >= quiz.questions.length) finishQuiz(); else renderQuestion(); }

function finishQuiz() {
  state.totalQuizzes++;
  const earned = quiz.correct * 10;
  addXP(earned);
  document.getElementById('quizPlay').classList.remove('active');
  const result = document.getElementById('quizResult');
  result.classList.add('active');
  const pct = Math.round((quiz.correct/quiz.questions.length)*100);
  document.getElementById('resultEmoji').textContent = pct>=90?'🏆':pct>=70?'🎉':pct>=50?'😊':'💪';
  document.getElementById('resultScore').textContent = `${quiz.correct} / ${quiz.questions.length}`;
  document.getElementById('resultXP').textContent = `+${earned} XP 獲得！`;
  if (pct >= 80) confetti();
  save();
}

function resetQuiz() {
  document.getElementById('quizMenu').style.display = 'block';
  document.getElementById('quizPlay').classList.remove('active');
  document.getElementById('quizResult').classList.remove('active');
}

// ==================== 閃卡複習 ====================
let reviewState = { words: [], idx: 0, flipped: false };

function startReviewQuiz() {
  const due = getDueWords();
  if (!due.length) { showToast('今天沒有需要複習的單字！'); return; }
  showScreen('quiz');
  reviewState = { words: due, idx: 0, flipped: false };
  document.getElementById('quizMenu').style.display = 'none';
  document.getElementById('quizPlay').classList.remove('active');
  document.getElementById('quizResult').classList.remove('active');
  renderFlashcard();
}

function renderFlashcard() {
  const play = document.getElementById('quizPlay');
  play.classList.add('active');
  document.getElementById('checkBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'none';
  document.getElementById('feedbackBox').style.display = 'none';

  const { words, idx, flipped } = reviewState;
  const w = words[idx];
  const total = words.length;
  const isJa = state.lang === 'ja';
  const wordKey = isJa ? w.word : w.en;
  const speakLang = isJa ? 'ja-JP' : 'en-US';

  document.getElementById('quizProgressText').textContent = `複習 ${idx + 1} / ${total}`;
  document.getElementById('quizScoreText').textContent = '';
  document.getElementById('quizProgressBar').style.width = Math.round((idx / total) * 100) + '%';

  document.getElementById('questionCard').innerHTML = `
    <div class="question-type-label">📇 單字複習</div>
    <div class="flashcard" onclick="flipCard()">
      <div class="flashcard-front ${flipped ? 'hidden' : ''}">
        <div class="flashcard-word">${wordKey}</div>
        ${w.pos ? `<div class="flashcard-pos">${isJa ? (w.reading || '') : w.pos}</div>` : ''}
        <div style="margin:24px 0 24px">
          <button class="speak-btn" style="margin:0 auto;display:flex" onclick="event.stopPropagation();speak('${esc(wordKey)}','${speakLang}')">🔊</button>
        </div>
        <div class="flashcard-hint">點卡片查看中文</div>
      </div>
      <div class="flashcard-back ${flipped ? '' : 'hidden'}">
        <div class="flashcard-zh">${w.zh}</div>
        ${w.sentence ? `<div class="flashcard-sentence">${w.sentence}</div>` : ''}
        <div style="margin:24px 0 8px">
          <button class="speak-btn" style="margin:0 auto;display:flex" onclick="event.stopPropagation();speak('${esc(wordKey)}','${speakLang}')">🔊</button>
        </div>
      </div>
    </div>
    <div class="flashcard-btns ${flipped ? '' : 'pre-flip'}">
      ${flipped ? `
        <button class="flashcard-btn forgot" onclick="reviewAnswer(false)">😅 忘了</button>
        <button class="flashcard-btn remembered" onclick="reviewAnswer(true)">😊 記得</button>
      ` : `
        <button class="flashcard-btn skip" onclick="reviewAnswer(true)">⏭ 跳過（記得）</button>
      `}
    </div>`;
}

function flipCard() { reviewState.flipped = true; renderFlashcard(); }

function reviewAnswer(remembered) {
  const w = reviewState.words[reviewState.idx];
  const { stage, nextReview } = calcNextReview(w.stage || 0, remembered);
  w.stage = stage; w.streak = stage; w.nextReview = nextReview;
  const lang = state.lang === 'ja' ? 'ja' : 'en';
  sheetsUpdate(lang, getWordKey(w), stage, nextReview);
  save();
  reviewState.idx++;
  reviewState.flipped = false;
  if (reviewState.idx >= reviewState.words.length) {
    document.getElementById('quizPlay').classList.remove('active');
    const result = document.getElementById('quizResult');
    result.classList.add('active');
    document.getElementById('resultEmoji').textContent = '📇';
    document.getElementById('resultScore').textContent = `${reviewState.words.length} 個`;
    document.getElementById('resultXP').textContent = `複習完成！+${reviewState.words.length * 5} XP`;
    addXP(reviewState.words.length * 5);
  } else {
    renderFlashcard();
  }
}

// ==================== STORY ====================
let storyState = { level: 'L0.5', genre: 'Hero Quest', sentences: [], stepIdx: 0, currentTitle: '', currentGenre: '' };

const GENRES = {
  'L0.5': [
    { genre: 'Hero Quest',       icon: '⚔️', sub: '英雄任務' },
    { genre: 'Escape Room',      icon: '🔐', sub: '密室逃脫' },
    { genre: 'Adventure',        icon: '🗺️', sub: '冒險' },
    { genre: 'Animal Story',     icon: '🦁', sub: '動物故事' },
    { genre: 'Horror Story',     icon: '👻', sub: '恐怖故事' },
    { genre: 'Poppy Playtime',   icon: '🧸', sub: '波比玩具時間' },
    { genre: 'Nature & Weather', icon: '🌦️', sub: '自然天氣' },
  ],
  default: [
    { section: '✨ 想像類' },
    { genre: 'Fairy Tale',       icon: '🧚', sub: '童話故事' },
    { genre: 'Adventure',        icon: '🗺️', sub: '冒險' },
    { genre: 'Mystery',          icon: '🔍', sub: '神秘推理' },
    { genre: 'Animal Story',     icon: '🦁', sub: '動物故事' },
    { genre: 'Sports',           icon: '⚽', sub: '運動' },
    { genre: 'Nature & Weather', icon: '🌦️', sub: '自然天氣' },
    { section: '🌍 實用生活類' },
    { genre: 'Travel',           icon: '✈️', sub: '旅行' },
    { genre: 'Daily Life',       icon: '🏠', sub: '日常生活' },
    { genre: 'Medical',          icon: '🏥', sub: '醫療' },
    { genre: 'Workplace',        icon: '💼', sub: '職場' },
  ],
  ja: [
    { section: '✨ 想像類' },
    { genre: 'Fairy Tale',  icon: '🧚', sub: '童話' },
    { genre: 'Adventure',   icon: '🗺️', sub: '冒險' },
    { genre: 'Animal Story',icon: '🦁', sub: '動物故事' },
    { genre: 'Mystery',     icon: '🔍', sub: '推理' },
    { section: '🌍 生活類' },
    { genre: 'Daily Life',  icon: '🏠', sub: '日常生活' },
    { genre: 'Travel',      icon: '✈️', sub: '旅行' },
  ],
};

function renderGenreGrid(level) {
  const grid = document.getElementById('genreGrid');
  if (!grid) return;
  const isJa = state.lang === 'ja';
  const list = isJa ? GENRES['ja'] : (level === 'L0.5' ? GENRES['L0.5'] : GENRES['default']);
  grid.innerHTML = list.map(item => {
    if (item.section) return `<div class="genre-section-label">${item.section}</div>`;
    const selected = item.genre === storyState.genre ? 'selected' : '';
    return `<button class="genre-chip ${selected}" data-genre="${item.genre}" onclick="selectGenre('${item.genre}')">
      <span class="genre-icon">${item.icon}</span>
      <div class="genre-name">${item.genre}</div>
      <div class="genre-sub">${item.sub}</div>
    </button>`;
  }).join('');
}

function selectLevel(lv) {
  storyState.level = lv;
  document.querySelectorAll('.level-chip').forEach(c => c.classList.toggle('selected', c.dataset.level === lv));
  const list = lv === 'L0.5' ? GENRES['L0.5'] : GENRES['default'];
  const firstGenre = list.find(i => i.genre);
  storyState.genre = firstGenre ? firstGenre.genre : 'Adventure';
  renderGenreGrid(lv);
}

function selectGenre(g) {
  storyState.genre = g;
  document.querySelectorAll('.genre-chip').forEach(c => c.classList.toggle('selected', c.dataset.genre === g));
}

function toggleStoryZh(btn) {
  const content = btn.nextElementSibling;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '🇹🇼 隱藏中文翻譯' : '🇹🇼 顯示中文翻譯';
}

function showStorySetup() {
  stopReading();
  document.getElementById('storySetup').style.display = 'block';
  document.getElementById('storyResult').classList.remove('active');
}

async function generateStory() {
  const btn = document.getElementById('storyGenBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="loading-dots" style="color:white"><span></span><span></span><span></span></span> AI 生成故事中...`;
  const isJa = state.lang === 'ja';
  try {
    const allWords = isJa ? state.jaWords : state.words;
    const mustReview = allWords.filter(w => (w.stage||0) <= 1).slice(0, 10);
    const shouldReview = allWords.filter(w => (w.stage||0) === 2).slice(0, 10);
    const optimizedWords = [...mustReview, ...shouldReview].slice(0, 20);
    const learnedWords = isJa ? optimizedWords.map(w => w.word) : optimizedWords.map(w => w.en);
    const mustWords = isJa ? mustReview.map(w => w.word) : mustReview.map(w => w.en);

    const data = await callScript({
      type: isJa ? 'ja_story' : 'story',
      level: storyState.level,
      genre: storyState.genre,
      learned_words: learnedWords,
      must_words: mustWords
    });

    storyState.sentences = data.sentences || [];
    storyState.stepIdx = 0;
    storyState.currentTitle = data.title || '';
    storyState.currentGenre = storyState.genre;

    document.getElementById('storySetup').style.display = 'none';
    document.getElementById('storyResult').classList.add('active');
    document.getElementById('storyImageArea').innerHTML = `<button class="story-img-btn" onclick="generateStoryImage()">🎨 生成故事插圖</button>`;

    const levelNames = { 'L0.5':'Graphic Reader', L1: isJa?'入門 N5':'Starter A1', L2: isJa?'初級 N4':'Elementary A2', L3: isJa?'中級 N3':'Intermediate B1', L4:'Upper-Int B2', L5:'Advanced C1' };
    document.getElementById('storyTitle').textContent = data.title || '故事';
    document.getElementById('storyMeta').innerHTML = `
      <span class="story-badge">${storyState.genre}</span>
      <span class="story-badge">${levelNames[storyState.level]||storyState.level}</span>
      <span class="story-badge">⏱ ${data.reading_time||''}</span>`;

    document.getElementById('storyBody').innerHTML = (data.sentences||[])
      .map((s,i) => `<span class="story-sent" id="story-sent-${i}" onclick="speakSentence(${i})">${s} </span>`).join('');

    const zhArea = document.getElementById('storyZhArea');
    if (data.story_zh) {
      const zhParagraphs = data.story_zh.split('\n\n').map(p => `<p>${p}</p>`).join('');
      zhArea.innerHTML = `<button class="story-zh-toggle" onclick="toggleStoryZh(this)">🇹🇼 顯示中文翻譯</button><div class="story-zh-content" style="display:none">${zhParagraphs}</div>`;
    } else {
      zhArea.innerHTML = '';
    }

    if (data.cultural_note) {
      const cn = document.getElementById('culturalNote');
      cn.style.display = 'block';
      cn.innerHTML = `<strong>📌 文化備註</strong>${data.cultural_note}`;
    } else {
      document.getElementById('culturalNote').style.display = 'none';
    }

    const vocab = data.key_vocabulary || [];
    window._storyVocab = vocab;
    window._storyVocabChecked = vocab.map(() => true);
    const speakLang = isJa ? 'ja-JP' : 'en-US';
    document.getElementById('vocabList').innerHTML = vocab.map((v, i) => {
      const wordDisplay = isJa ? `${v.word||v.en} <span style="font-size:12px;color:#90A4AE">${v.reading||''}</span>` : (v.en||'');
      const speakWord = isJa ? (v.word||v.en||'') : (v.en||'');
      return `<div class="vocab-item">
        <span class="vocab-add-check" id="vchk${i}" onclick="toggleVocab(${i})">${window._storyVocabChecked[i]?'☑️':'⬜'}</span>
        <div>
          <div class="vocab-en">${wordDisplay} <span style="font-size:12px;color:#90A4AE">${v.pos||''}</span>
            <button class="speak-btn" style="width:26px;height:26px;font-size:12px;margin-left:4px" onclick="speak('${esc(speakWord)}','${speakLang}')">🔊</button>
          </div>
          <div class="vocab-zh">${v.zh||''}</div>
          <div class="vocab-sent">${v.sentence||''}</div>
        </div>
      </div>`;
    }).join('');

    const vBtn = document.querySelector('.vocab-import-btn');
    if (vBtn) { vBtn.textContent = '✅ 加入選取單字到單字庫'; vBtn.disabled = false; }

  } catch(e) {
    showToast('❌ ' + e.message);
    document.getElementById('storySetup').style.display = 'block';
    document.getElementById('storyResult').classList.remove('active');
  }
  btn.disabled = false;
  btn.innerHTML = '📖 生成故事！';
}

async function generateStoryImage() {
  const imgArea = document.getElementById('storyImageArea');
  imgArea.innerHTML = `<div class="story-img-loading"><span class="loading-dots" style="color:var(--teal-dark)"><span></span><span></span><span></span></span><p>AI 繪製插圖中...</p></div>`;
  try {
    const result = await callScript({ type: 'image', title: storyState.currentTitle, genre: storyState.currentGenre, level: storyState.level });
    if (result.imageData) {
      imgArea.innerHTML = `<img src="data:image/png;base64,${result.imageData}" alt="故事插圖" class="story-img">`;
    } else {
      throw new Error('無法取得圖片');
    }
  } catch(e) {
    imgArea.innerHTML = `<div class="story-img-error">🎨 插圖生成失敗<br><small>${e.message}</small><br><button class="story-img-btn" style="margin-top:10px" onclick="generateStoryImage()">重試</button></div>`;
  }
}

window.toggleVocab = function(i) {
  window._storyVocabChecked[i] = !window._storyVocabChecked[i];
  document.getElementById('vchk'+i).textContent = window._storyVocabChecked[i] ? '☑️' : '⬜';
};

async function importVocab() {
  const vocab = window._storyVocab || [];
  const isJa = state.lang === 'ja';
  let count = 0;
  for (let i = 0; i < vocab.length; i++) {
    if (!window._storyVocabChecked[i]) continue;
    const v = vocab[i];
    if (isJa) {
      const word = v.word || v.en || '';
      if (!word || state.jaWords.find(x => x.word === word)) continue;
      const wordObj = { word, reading: v.reading||'', zh: v.zh||'', pos: v.pos||'', sentence: v.sentence||'', stage: 0, streak: 0, nextReview: Date.now() };
      state.jaWords.push(wordObj);
      sheetsAdd('ja', wordObj);
    } else {
      const en = v.en || '';
      if (!en || state.words.find(x => x.en.toLowerCase() === en.toLowerCase())) continue;
      let pos = v.pos||'', sentence = v.sentence||'', zh = v.zh||'';
      if (!pos) {
        try { const r = await callScript({ type: 'lookup', word: en }); pos = r.pos||''; sentence = r.sentence||sentence; zh = r.zh||zh; } catch(e) {}
      }
      const wordObj = { en, zh, pos, sentence, stage: 0, streak: 0, nextReview: Date.now() };
      state.words.push(wordObj);
      sheetsAdd('en', wordObj);
    }
    count++;
  }
  save(); addXP(count * 5);
  showToast(`✅ 加入 ${count} 個單字！`);
  document.querySelector('.vocab-import-btn').textContent = '✅ 已加入！';
  document.querySelector('.vocab-import-btn').disabled = true;
}

function speakSentence(idx) {
  stopReading();
  const el = document.getElementById('story-sent-' + idx);
  if (!el) return;
  el.classList.add('speaking');
  const lang = state.lang === 'ja' ? 'ja' : 'en';
  showToast('⏳ 載入語音...', 8000);
  speakGemini(storyState.sentences[idx], lang).then(() => {
    el.classList.remove('speaking');
  });
}

function readStoryAll() {
  stopReading();
  const sentences = storyState.sentences;
  if (!sentences.length) return;
  const lang = state.lang === 'ja' ? 'ja' : 'en';
  let idx = 0;
  let cancelled = false;
  window._storyReadCancelled = function() { cancelled = true; };
  showToast('⏳ 載入語音...', 8000);
  async function speakNext() {
    if (cancelled || idx >= sentences.length) { clearHighlight(); return; }
    clearHighlight();
    const el = document.getElementById('story-sent-' + idx);
    if (el) el.classList.add('speaking');
    await speakGemini(sentences[idx], lang);
    if (el) el.classList.remove('speaking');
    idx++;
    speakNext();
  }
  speakNext();
}

function readStoryStep() {
  const idx = storyState.stepIdx;
  if (idx >= storyState.sentences.length) { storyState.stepIdx = 0; showToast('已朗讀完畢，從頭開始'); return; }
  clearHighlight();
  const el = document.getElementById('story-sent-' + idx);
  if (el) { el.classList.add('speaking'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const lang = state.lang === 'ja' ? 'ja' : 'en';
  if (idx === 0) showToast('⏳ 載入語音...');
  speakGemini(storyState.sentences[idx], lang).then(() => {
    if (el) el.classList.remove('speaking');
  });
  storyState.stepIdx++;
}

function stopReading() {
  if (window._storyReadCancelled) { window._storyReadCancelled(); window._storyReadCancelled = null; }
  stopGeminiTTS();
  window.speechSynthesis && window.speechSynthesis.cancel();
  clearHighlight();
  storyState.stepIdx = 0;
}

function clearHighlight() {
  document.querySelectorAll('.story-sent.speaking').forEach(el => el.classList.remove('speaking'));
}

// ==================== 50音 ====================
let hiraganaState = { currentIdx: 0, mode: 'practice' };

function renderHiraganaOverview() {
  return HIRAGANA_ROWS.map(row =>
    `<div class="hira-overview-row">${row.map(char => {
      if (!char) return `<div class="hira-overview-cell empty"></div>`;
      const practiced = state.hiragana[char] && state.hiragana[char].practiced;
      const romaji = HIRAGANA_ROMAJI[char] || '';
      return `<button class="hira-overview-cell ${practiced ? 'practiced' : ''}" onclick="jumpToChar('${char}')">
        <span class="hira-ov-char">${char}</span>
        <span class="hira-ov-romaji">${romaji}</span>
      </button>`;
    }).join('')}</div>`
  ).join('');
}

function jumpToChar(char) {
  const idx = HIRAGANA_FLAT.indexOf(char);
  if (idx === -1) return;
  hiraganaState.currentIdx = idx;
  hiraganaState.mode = 'practice';
  renderHiraganaScreen();
}

function renderHiraganaScreen() {
  const screen = document.getElementById('screen-hiragana');
  if (!screen) return;
  const practiced = HIRAGANA_FLAT.filter(c => state.hiragana[c] && state.hiragana[c].practiced).length;
  screen.innerHTML = `
    <div class="hira-header-card">
      <h2>あ 五十音練習</h2>
      <p>已練習 ${practiced} / ${HIRAGANA_FLAT.length} 個假名</p>
      <div class="hira-mode-btns">
        <button class="hira-mode-btn ${hiraganaState.mode==='practice'?'active':''}" onclick="setHiraMode('practice')">✏️ 練習模式</button>
        <button class="hira-mode-btn ${hiraganaState.mode==='quiz'?'active':''}" onclick="setHiraMode('quiz')">🎯 測驗模式</button>
      </div>
    </div>
    <div class="hira-overview">${renderHiraganaOverview()}</div>
    <div id="hiraganaContent"></div>`;
  if (hiraganaState.mode === 'practice') renderHiraganaPractice();
  else renderHiraganaQuiz();
}

function setHiraMode(mode) { hiraganaState.mode = mode; renderHiraganaScreen(); }

function autoAddHiraganaWord(wordData) {
  if (!wordData || !wordData.word || wordData.zh === '(查詢失敗)') return;
  if (state.jaWords.find(x => x.word === wordData.word)) return;
  const wordObj = { word: wordData.word, reading: wordData.word, zh: wordData.zh, pos: '名詞', sentence: '', stage: 0, streak: 0, nextReview: Date.now() };
  state.jaWords.push(wordObj);
  sheetsAdd('ja', wordObj);
}

async function renderHiraganaPractice() {
  const content = document.getElementById('hiraganaContent');
  if (!content) return;
  const char = HIRAGANA_FLAT[hiraganaState.currentIdx];
  const romaji = HIRAGANA_ROMAJI[char] || '';
  const total = HIRAGANA_FLAT.length;
  const idx = hiraganaState.currentIdx;

  let wordData = state.hiragana[char];
  if (!wordData) {
    content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-soft)"><span class="loading-dots" style="color:var(--teal-dark)"><span></span><span></span><span></span></span><br><br>AI 生成單字中...</div>`;
    try {
      const r = await callScript({ type: 'ja_hiragana_word', char });
      wordData = { word: r.word, kanji: r.kanji || '', zh: r.zh, emoji: r.emoji || '📝', practiced: false };
      state.hiragana[char] = wordData;
      autoAddHiraganaWord(wordData);
      save();
    } catch(e) {
      wordData = { word: char, kanji: '', zh: '(查詢失敗)', emoji: '❓', practiced: false };
    }
  }

  content.innerHTML = `
    <div class="hira-practice-card">
      <div class="hira-nav">
        <button class="hira-nav-btn" onclick="hiraNav(-1)" ${idx===0?'disabled':''}>‹</button>
        <span class="hira-progress">${idx+1} / ${total}</span>
        <button class="hira-nav-btn" onclick="hiraNav(1)" ${idx===total-1?'disabled':''}>›</button>
      </div>
      <div class="hira-char-display">
        <div class="hira-big-char" onclick="speak('${char}','ja-JP',0.7)">${char}</div>
        <div class="hira-romaji">${romaji}</div>
        <button class="hira-speak-btn" onclick="speak('${char}','ja-JP',0.7)">🔊 發音</button>
      </div>
      <div class="hira-word-card">
        <div class="hira-word-emoji">${wordData.emoji}</div>
        <div class="hira-word-text">${wordData.word} ${wordData.kanji ? `<span class="hira-kanji">(${wordData.kanji})</span>` : ''}</div>
        <div class="hira-word-zh">${wordData.zh}</div>
        <button class="hira-speak-btn" onclick="speak('${wordData.word}','ja-JP',0.75)">🔊 單字發音</button>
      </div>
      <div class="hira-write-section">
        <div class="hira-write-label">練習書寫</div>
        <div class="hira-big-canvas-wrap">
          <div class="hira-big-ghost">${char}</div>
          <canvas id="hiraBigCanvas" class="hira-big-canvas" width="280" height="280"></canvas>
        </div>
        <button class="hira-clear-btn" onclick="clearBigCanvas()">🗑 清除</button>
      </div>
      <button class="hira-done-btn" onclick="markHiraganaPracticed('${char}')">
        ${wordData.practiced ? '✅ 已完成，繼續下一個 →' : '✓ 完成練習，下一個 →'}
      </button>
    </div>`;
  setTimeout(() => initBigCanvas(), 100);
}

function initBigCanvas() {
  const canvas = document.getElementById('hiraBigCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1A237E'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, lastX = 0, lastY = 0;
  const getPos = function(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: (touch.clientX - rect.left) * (canvas.width / rect.width), y: (touch.clientY - rect.top) * (canvas.height / rect.height) };
  };
  canvas.addEventListener('mousedown', function(e) { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; });
  canvas.addEventListener('mousemove', function(e) { if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke(); lastX = p.x; lastY = p.y; });
  canvas.addEventListener('mouseup', function() { drawing = false; });
  canvas.addEventListener('mouseleave', function() { drawing = false; });
  canvas.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }, { passive: false });
  canvas.addEventListener('touchmove', function(e) { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke(); lastX = p.x; lastY = p.y; }, { passive: false });
  canvas.addEventListener('touchend', function() { drawing = false; });
}

function clearBigCanvas() {
  const canvas = document.getElementById('hiraBigCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function hiraNav(dir) {
  const newIdx = hiraganaState.currentIdx + dir;
  if (newIdx < 0 || newIdx >= HIRAGANA_FLAT.length) return;
  hiraganaState.currentIdx = newIdx;
  renderHiraganaPractice();
}

function markHiraganaPracticed(char) {
  if (state.hiragana[char]) state.hiragana[char].practiced = true;
  save();
  const newIdx = hiraganaState.currentIdx + 1;
  if (newIdx < HIRAGANA_FLAT.length) { hiraganaState.currentIdx = newIdx; renderHiraganaPractice(); }
  else { showToast('🎉 所有假名練習完成！'); renderHiraganaScreen(); }
}

let hiraQuiz = { questions: [], idx: 0, correct: 0, selected: null };

function renderHiraganaQuiz() {
  const content = document.getElementById('hiraganaContent');
  if (!content) return;
  const practiced = HIRAGANA_FLAT.filter(c => state.hiragana[c] && state.hiragana[c].practiced);
  if (practiced.length < 4) {
    content.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>請先練習至少 4 個假名！</p></div>`;
    return;
  }
  hiraQuiz.questions = [];
  const pool = [...practiced].sort(() => Math.random() - 0.5).slice(0, Math.min(10, practiced.length));
  pool.forEach(char => {
    const wordData = state.hiragana[char];
    const wrong = practiced.filter(c => c !== char).sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [char, ...wrong].sort(() => Math.random() - 0.5);
    hiraQuiz.questions.push({ char, wordData, options });
  });
  hiraQuiz.idx = 0; hiraQuiz.correct = 0;
  renderHiraganaQuestion();
}

function renderHiraganaQuestion() {
  hiraQuiz.selected = null;
  const content = document.getElementById('hiraganaContent');
  if (!content) return;
  const q = hiraQuiz.questions[hiraQuiz.idx];
  const total = hiraQuiz.questions.length;
  content.innerHTML = `
    <div class="hira-quiz-card">
      <div class="quiz-header">
        <div class="quiz-progress-text">第 ${hiraQuiz.idx+1} 題 / 共 ${total} 題</div>
        <div class="quiz-score-text">✅ ${hiraQuiz.correct} 答對</div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(hiraQuiz.idx/total*100)}%"></div></div>
      <div class="hira-quiz-word">
        <div class="hira-quiz-emoji">${q.wordData.emoji}</div>
        <div class="hira-quiz-word-text">${q.wordData.word}</div>
        <div class="hira-quiz-zh">${q.wordData.zh}</div>
        <button class="hira-speak-btn" onclick="speak('${q.wordData.word}','ja-JP',0.75)">🔊</button>
      </div>
      <div class="hira-quiz-label">這個單字的開頭假名是？</div>
      <div class="hira-quiz-options">
        ${q.options.map(opt => `<button class="hira-opt-btn" onclick="selectHiraOption(this,'${opt}','${q.char}')">${opt}<br><span style="font-size:11px;color:#90A4AE">${HIRAGANA_ROMAJI[opt]||''}</span></button>`).join('')}
      </div>
      <div id="hiraFeedback" style="display:none" class="feedback-box"></div>
      <button class="check-btn" id="hiraCheckBtn" onclick="checkHiraAnswer('${q.char}')" style="margin-top:12px">✓ 確認答案</button>
      <button class="next-btn" id="hiraNextBtn" onclick="nextHiraganaQuestion()" style="margin-top:8px">下一題 →</button>
    </div>`;
}

function selectHiraOption(btn, val, correct) {
  document.querySelectorAll('.hira-opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  hiraQuiz.selected = val;
}

function checkHiraAnswer(correct) {
  if (!hiraQuiz.selected) { showToast('請選擇答案！'); return; }
  const isCorrect = hiraQuiz.selected === correct;
  const fb = document.getElementById('hiraFeedback');
  fb.style.display = 'block';
  document.querySelectorAll('.hira-opt-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent.trim().startsWith(correct)) b.classList.add('correct-opt');
    else if (b.textContent.trim().startsWith(hiraQuiz.selected) && !isCorrect) b.classList.add('wrong-opt');
  });
  if (isCorrect) {
    fb.className = 'feedback-box correct';
    fb.innerHTML = `<div class="feedback-emoji">${['🎉','⭐','✨','🌟'][Math.floor(Math.random()*4)]}</div><div class="feedback-text">正確！</div>`;
    hiraQuiz.correct++; state.totalCorrect++;
    playCorrectSound();
  } else {
    fb.className = 'feedback-box wrong';
    fb.innerHTML = `<div class="feedback-emoji">💪</div><div class="feedback-text">再加油！</div><div class="feedback-answer">正確答案：${correct}（${HIRAGANA_ROMAJI[correct]}）</div>`;
    state.wrongWords.ja = state.wrongWords.ja || {};
    state.wrongWords.ja[correct] = (state.wrongWords.ja[correct] || 0) + 1;
  }
  document.getElementById('hiraCheckBtn').style.display = 'none';
  document.getElementById('hiraNextBtn').style.display = 'block';
  save();
}

function nextHiraganaQuestion() {
  hiraQuiz.idx++;
  if (hiraQuiz.idx >= hiraQuiz.questions.length) {
    state.totalQuizzes++;
    const earned = hiraQuiz.correct * 10;
    addXP(earned);
    const content = document.getElementById('hiraganaContent');
    const pct = Math.round(hiraQuiz.correct / hiraQuiz.questions.length * 100);
    content.innerHTML = `<div class="quiz-result active" style="padding:20px 0">
      <div class="result-emoji">${pct>=90?'🏆':pct>=70?'🎉':pct>=50?'😊':'💪'}</div>
      <div class="result-title">測驗完成！</div>
      <div class="result-score">${hiraQuiz.correct} / ${hiraQuiz.questions.length}</div>
      <div class="result-xp">+${earned} XP 獲得！</div>
      <button class="result-back-btn" onclick="renderHiraganaQuiz()">再玩一次 🔄</button>
    </div>`;
    if (pct >= 80) confetti();
    save();
    return;
  }
  renderHiraganaQuestion();
}

// ==================== 設定頁 ====================
function renderSettings() {
  const screen = document.getElementById('screen-settings');
  if (!screen) return;
  const s = state.settings;
  screen.innerHTML = `
    <div class="settings-card">
      <h3>👤 用戶</h3>
      <div class="settings-row">
        <div class="settings-label">目前：${state.currentUser || '未登入'}</div>
        <button onclick="showUserSelect()" style="background:#E3F2FD;color:var(--sky-dark);border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer">切換用戶</button>
      </div>
    </div>
    <div class="settings-card">
      <h3>☁️ 雲端同步</h3>
      <p style="font-size:13px;color:var(--text-soft);margin-bottom:12px">新增/刪除單字時自動同步到雲端。手動同步可從雲端讀取最新資料。</p>
      <button onclick="refreshFromSheets()" style="width:100%;background:linear-gradient(135deg,#26C6DA,#00838F);color:white;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">🔄 從雲端重新整理單字庫</button>
    </div>
    <div class="settings-card">
      <h3>📚 學習設定</h3>
      <div class="settings-row">
        <div class="settings-label">每日複習單字數</div>
        <input type="number" id="settingReviewCount" value="${s.dailyReviewCount}" min="1" max="20"
          style="width:60px;border:2px solid #E3F2FD;border-radius:10px;padding:8px;font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;text-align:center;color:var(--text);outline:none">
      </div>
    </div>
    <div class="settings-card">
      <h3>🔗 API 設定</h3>
      <div class="input-group">
        <label>Script 網址</label>
        <input type="text" id="settingScriptUrl" value="${s.scriptUrl}" style="-webkit-user-select:auto;user-select:auto" placeholder="https://script.google.com/...">
      </div>
      <div class="input-group">
        <label>密碼</label>
        <input type="text" id="settingSecret" value="${s.secret}" style="-webkit-user-select:auto;user-select:auto" placeholder="5566">
      </div>
    </div>
    <button class="submit-btn" onclick="saveSettings()" style="margin-bottom:14px">💾 儲存設定</button>
    <div class="settings-card" style="border-top:3px solid var(--red)">
      <h3>⚠️ 危險操作</h3>
      <button onclick="clearAllData()" style="width:100%;background:#FFEBEE;color:var(--red);border:none;border-radius:12px;padding:13px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">🗑 清除此用戶的本機資料</button>
    </div>`;
}

function saveSettings() {
  state.settings.dailyReviewCount = parseInt(document.getElementById('settingReviewCount').value) || 5;
  state.settings.scriptUrl = document.getElementById('settingScriptUrl').value.trim();
  state.settings.secret = document.getElementById('settingSecret').value.trim();
  save();
  showToast('✅ 設定已儲存！');
  updateHome();
}

function clearAllData() {
  if (!confirm('確定要清除此用戶的所有本機資料？')) return;
  if (!confirm('再次確認：所有單字、進度、XP 都會消失！')) return;
  localStorage.removeItem(getStorageKey());
  location.reload();
}

// ==================== SOUND + CONFETTI ====================
function playCorrectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach(function(freq, i) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i*0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.1 + 0.25);
      osc.start(ctx.currentTime + i*0.1); osc.stop(ctx.currentTime + i*0.1 + 0.25);
    });
  } catch(e) {}
}

function confetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#FFD700','#FF6B6B','#4FC3F7','#66BB6A','#CE93D8','#FF8A65'];
  const pieces = Array.from({length: 40}, function() {
    return {
      x: Math.random() * canvas.width, y: -10,
      r: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
      vy: Math.random() * 4 + 2, vx: (Math.random() - 0.5) * 3,
      rotation: Math.random() * 360, rotV: (Math.random() - 0.5) * 10
    };
  });
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(function(p) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r); ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rotation += p.rotV;
    });
    if (++frame < 60) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ==================== BOOT ====================
try {
  const lastUser = getLastUser();
  if (lastUser && getAllUsers().find(function(u) { return u.name === lastUser; })) {
    loginUser(lastUser);
  } else {
    showUserSelect();
  }
} catch(e) {
  console.error('BOOT 錯誤：', e);
  try {
    document.getElementById('userSelectScreen').style.display = 'flex';
    document.getElementById('appWrapper').style.display = 'none';
    renderUserSelect();
  } catch(e2) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif"><h2>載入錯誤</h2><p>' + e.message + '</p><button onclick="localStorage.clear();location.reload()">清除資料並重新載入</button></div>';
  }
}
