// ==================== STATE ====================
let state = {
  lang: 'en',           // 目前語言：'en' 或 'ja'
  words: [],            // 英文單字庫
  jaWords: [],          // 日文單字庫
  hiragana: {},         // 50音進度 { 'あ': { word:'あめ', kanji:'雨', zh:'雨', emoji:'🌧️', practiced: true } }
  xp: 0,
  totalQuizzes: 0,
  totalCorrect: 0,
  wrongWords: {},
};

const LEVELS = [
  { name: '🌱 英語新芽', min: 0 },
  { name: '🐛 努力學習者', min: 100 },
  { name: '🦋 單字探險家', min: 250 },
  { name: '⭐ 英語小勇士', min: 500 },
  { name: '🔥 句子大師', min: 900 },
  { name: '👑 英語冒險王', min: 1500 },
];

// 50音順序
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

function getLevel(xp) {
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) { if (xp >= LEVELS[i].min) { idx = i; break; } }
  const lv = LEVELS[idx], next = LEVELS[idx + 1];
  if (next) {
    const pct = Math.round(((xp - lv.min) / (next.min - lv.min)) * 100);
    return { name: lv.name, pct, label: `${xp - lv.min} / ${next.min - lv.min} XP`, num: `Lv.${idx + 1}` };
  }
  return { name: lv.name, pct: 100, label: `${xp} XP`, num: `Lv.${idx + 1}` };
}

// ==================== STORAGE ====================
function save() { try { localStorage.setItem('ea_state', JSON.stringify(state)); } catch(e){} }
function load() {
  try {
    const s = localStorage.getItem('ea_state');
    if (s) {
      const loaded = JSON.parse(s);
      state = { ...state, ...loaded };
      delete state.sentences;
    }
  } catch(e) {}
}

// ==================== IMPORT / EXPORT ====================
function exportWords() {
  const data = {
    words: state.words,
    jaWords: state.jaWords,
    hiragana: state.hiragana,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `英語冒險_${new Date().toLocaleDateString('zh-TW').replace(/\//g,'-')}.json`;
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
        if (!confirm(`確定要覆蓋？將取代現有所有資料。`)) return;
        state.words    = data.words    || [];
        state.jaWords  = data.jaWords  || [];
        state.hiragana = data.hiragana || {};
        showToast(`✅ 已載入資料`);
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

// ==================== LANGUAGE SWITCH ====================
function switchLang(lang) {
  state.lang = lang;
  save();
  // 更新國旗按鈕
  document.querySelectorAll('.lang-flag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // 更新導覽列
  renderNav();
  // 回到首頁
  showScreen('home');
}

function renderNav() {
  const nav = document.getElementById('mainNav');
  if (state.lang === 'en') {
    nav.innerHTML = `
      <button class="nav-btn active" onclick="showScreen('home')" id="nav-home"><span class="icon">🏠</span>首頁</button>
      <button class="nav-btn" onclick="showScreen('words')" id="nav-words"><span class="icon">📖</span>單字庫</button>
      <button class="nav-btn" onclick="showScreen('add')" id="nav-add"><span class="icon">➕</span>新增</button>
      <button class="nav-btn" onclick="showScreen('quiz')" id="nav-quiz"><span class="icon">🎯</span>測驗</button>
      <button class="nav-btn" onclick="showScreen('story')" id="nav-story"><span class="icon">📚</span>故事</button>
      <button class="nav-btn" onclick="showScreen('wrong')" id="nav-wrong"><span class="icon">❌</span>錯題本</button>`;
  } else {
    nav.innerHTML = `
      <button class="nav-btn active" onclick="showScreen('home')" id="nav-home"><span class="icon">🏠</span>首頁</button>
      <button class="nav-btn" onclick="showScreen('hiragana')" id="nav-hiragana"><span class="icon">あ</span>50音</button>
      <button class="nav-btn" onclick="showScreen('words')" id="nav-words"><span class="icon">📖</span>單字庫</button>
      <button class="nav-btn" onclick="showScreen('quiz')" id="nav-quiz"><span class="icon">🎯</span>測驗</button>
      <button class="nav-btn" onclick="showScreen('story')" id="nav-story"><span class="icon">📚</span>故事</button>
      <button class="nav-btn" onclick="showScreen('wrong')" id="nav-wrong"><span class="icon">❌</span>錯題本</button>`;
  }
}

// ==================== UI ====================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById('screen-' + name);
  if (!screen) return;
  screen.classList.add('active');
  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) navBtn.classList.add('active');
  if (name === 'words')    renderWordList();
  if (name === 'wrong')    renderWrong();
  if (name === 'home')     updateHome();
  if (name === 'quiz')     resetQuiz();
  if (name === 'story')    renderGenreGrid(storyState.level);
  if (name === 'hiragana') renderHiraganaScreen();
}

function updateHome() {
  const lv = getLevel(state.xp);
  document.getElementById('heroLevelName').textContent = lv.name;
  document.getElementById('heroXpBar').style.width = lv.pct + '%';
  document.getElementById('heroXpLabel').textContent = lv.label;
  document.getElementById('headerXP').textContent = state.xp;
  document.getElementById('headerLevel').textContent = lv.num;
  document.getElementById('statWords').textContent = state.lang === 'en' ? state.words.length : state.jaWords.length;
  document.getElementById('statQuizzes').textContent = state.totalQuizzes;
  document.getElementById('statCorrect').textContent = state.totalCorrect;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ==================== WORD LIST ====================
function renderWordList() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const container = document.getElementById('wordListContainer');
  const isJa = state.lang === 'ja';
  const words = isJa
    ? state.jaWords.filter(w => !q || w.word.includes(q) || w.zh.includes(q))
    : state.words.filter(w => !q || w.en.toLowerCase().includes(q) || w.zh.includes(q));

  if (!words.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>還沒有單字，去新增吧！</p></div>`;
    return;
  }
  const icons = ['🍎','🐶','⭐','🎈','🌈','🦁','🌸','🚀','🎵','🍭','🐠','🌻'];
  container.innerHTML = words.map((w, i) => {
    const sc = (w.streak||0) >= 5 ? 'streak-great' : (w.streak||0) >= 2 ? 'streak-good' : 'streak-new';
    const sl = (w.streak||0) >= 5 ? '🌟 熟練' : (w.streak||0) >= 2 ? '✅ 還不錯' : '🆕 新字';
    if (isJa) {
      return `<div class="word-item">
        <div class="word-item-icon">${icons[i % icons.length]}</div>
        <div class="word-info">
          <div class="word-en">${w.word} <span style="font-size:13px;color:#90A4AE">${w.reading||''}</span> ${w.pos ? `<span style="font-size:12px;color:#90A4AE;font-weight:600">${w.pos}</span>` : ''}</div>
          <div class="word-zh">${w.zh}</div>
          ${w.sentence ? `<div class="word-sentence" style="display:flex;align-items:center;gap:6px">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.sentence}</span>
            <button class="speak-btn" style="flex-shrink:0;width:28px;height:28px;font-size:13px" onclick="speak('${esc(w.sentence)}','ja-JP')">🔊</button>
          </div>` : ''}
        </div>
        <div class="word-meta">
          <span class="word-streak ${sc}">${sl}</span>
          <button class="speak-btn" onclick="speak('${esc(w.word)}','ja-JP')">🔊</button>
        </div>
        <button class="delete-btn" onclick="deleteJaWord(${state.jaWords.indexOf(w)})">🗑</button>
      </div>`;
    }
    return `<div class="word-item">
      <div class="word-item-icon">${icons[i % icons.length]}</div>
      <div class="word-info">
        <div class="word-en">${w.en} ${w.pos ? `<span style="font-size:12px;color:#90A4AE;font-weight:600">${w.pos}</span>` : ''}</div>
        <div class="word-zh">${w.zh}</div>
        ${w.sentence ? `<div class="word-sentence" style="display:flex;align-items:center;gap:6px">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.sentence}</span>
          <button class="speak-btn" style="flex-shrink:0;width:28px;height:28px;font-size:13px" onclick="speak('${esc(w.sentence)}')">🔊</button>
        </div>` : ''}
      </div>
      <div class="word-meta">
        <span class="word-streak ${sc}">${sl}</span>
        <button class="speak-btn" onclick="speak('${esc(w.en)}')">🔊</button>
      </div>
      <button class="delete-btn" onclick="deleteWord(${state.words.indexOf(w)})">🗑</button>
    </div>`;
  }).join('');
}

function renderWrong() {
  const container = document.getElementById('wrongContainer');
  const entries = Object.entries(state.wrongWords).filter(([,v]) => v > 0);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">🎉</div><p>還沒有錯誤記錄，繼續加油！</p></div>`;
    return;
  }
  entries.sort((a,b) => b[1]-a[1]);
  const isJa = state.lang === 'ja';
  container.innerHTML = entries.map(([key, count]) => {
    const w = isJa ? state.jaWords.find(x => x.word === key) : state.words.find(x => x.en === key);
    return `<div class="wrong-item">
      <div class="wrong-en">${key}</div>
      ${w ? `<div class="wrong-zh">${w.zh}</div>` : ''}
      <div class="wrong-count">答錯 ${count} 次</div>
    </div>`;
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
  state.words.push({ en, zh, pos, sentence, streak: 0, nextReview: Date.now() });
  save();
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
  state.jaWords.push({ word, reading, zh, pos, sentence, streak: 0, nextReview: Date.now() });
  save();
  ['addWordJa','addZhJa','addReadingJa','addPosJa','addSentenceJa'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lookupStatusJa').style.display = 'none';
  _lastLookedUp = '';
  showToast('✅ 單字加入成功！'); addXP(5);
}

function deleteWord(idx) {
  if (confirm('確定要刪除這個單字嗎？')) { state.words.splice(idx, 1); save(); renderWordList(); showToast('🗑 已刪除'); }
}
function deleteJaWord(idx) {
  if (confirm('確定要刪除這個單字嗎？')) { state.jaWords.splice(idx, 1); save(); renderWordList(); showToast('🗑 已刪除'); }
}

// ==================== XP ====================
function addXP(amount) {
  const before = getLevel(state.xp).num;
  state.xp += amount;
  const after = getLevel(state.xp).num;
  save(); updateHome();
  document.getElementById('headerXP').textContent = state.xp;
  document.getElementById('headerLevel').textContent = after;
  if (before !== after) { showToast('🎉 升級了！' + getLevel(state.xp).name); confetti(); }
}

// ==================== TTS ====================
const LEVEL_RATES = { 'L0.5': 0.65, L1: 0.7, L2: 0.78, L3: 0.82, L4: 0.9, L5: 1.0 };

function stripEmoji(text) {
  return text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA9F}]/gu, '').trim();
}

function speak(text, lang = 'en-US', rate = 0.85) {
  if (!window.speechSynthesis) { showToast('此裝置不支援語音'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(stripEmoji(text));
  u.lang = lang; u.rate = rate;
  window.speechSynthesis.speak(u);
}

// ==================== HIRAGANA 50音 ====================
let hiraganaState = { currentIdx: 0, mode: 'practice', canvas: null, ctx: null, drawing: false };

function renderHiraganaScreen() {
  const screen = document.getElementById('screen-hiragana');
  if (!screen) return;
  const practiced = HIRAGANA_FLAT.filter(c => state.hiragana[c]?.practiced).length;
  screen.innerHTML = `
    <div class="hira-header-card">
      <h2>あ 五十音練習</h2>
      <p>已練習 ${practiced} / ${HIRAGANA_FLAT.length} 個假名</p>
      <div class="hira-mode-btns">
        <button class="hira-mode-btn ${hiraganaState.mode==='practice'?'active':''}" onclick="setHiraMode('practice')">✏️ 練習模式</button>
        <button class="hira-mode-btn ${hiraganaState.mode==='quiz'?'active':''}" onclick="setHiraMode('quiz')">🎯 測驗模式</button>
      </div>
    </div>
    <div id="hiraganaContent"></div>`;
  if (hiraganaState.mode === 'practice') renderHiraganaPractice();
  else renderHiraganaQuiz();
}

function setHiraMode(mode) {
  hiraganaState.mode = mode;
  renderHiraganaScreen();
}

async function renderHiraganaPractice() {
  const content = document.getElementById('hiraganaContent');
  const char = HIRAGANA_FLAT[hiraganaState.currentIdx];
  const romaji = HIRAGANA_ROMAJI[char] || '';
  const total = HIRAGANA_FLAT.length;
  const idx = hiraganaState.currentIdx;

  // 取得或生成單字
  let wordData = state.hiragana[char];
  if (!wordData) {
    content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-soft)"><span class="loading-dots" style="color:var(--teal-dark)"><span></span><span></span><span></span></span><br><br>AI 生成單字中...</div>`;
    try {
      const r = await callScript({ type: 'ja_hiragana_word', char });
      wordData = { word: r.word, kanji: r.kanji || '', zh: r.zh, emoji: r.emoji || '📝', practiced: false };
      state.hiragana[char] = wordData;
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
        <div class="hira-boxes">
          <div class="hira-box-wrap">
            <canvas class="hira-canvas" id="hiraCanvas0" width="80" height="80"></canvas>
            <div class="hira-ghost">${char}</div>
          </div>
          ${[1,2,3,4].map(n => `<canvas class="hira-canvas" id="hiraCanvas${n}" width="80" height="80"></canvas>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="hira-clear-btn" onclick="clearAllCanvas()">🗑 清除</button>
        </div>
      </div>

      <button class="hira-done-btn" onclick="markHiraganaPracticed('${char}')">
        ${wordData.practiced ? '✅ 已完成，繼續下一個 →' : '✓ 完成練習，下一個 →'}
      </button>
    </div>`;

  // 初始化畫板
  setTimeout(() => initHiraganaCanvases(), 100);
}

function initHiraganaCanvases() {
  [0,1,2,3,4].forEach(n => {
    const canvas = document.getElementById('hiraCanvas' + n);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1A237E';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let drawing = false, lastX = 0, lastY = 0;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      return { x: (touch.clientX - rect.left) * (canvas.width / rect.width), y: (touch.clientY - rect.top) * (canvas.height / rect.height) };
    };
    canvas.addEventListener('mousedown',  e => { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; });
    canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke(); lastX = p.x; lastY = p.y; });
    canvas.addEventListener('mouseup',    () => drawing = false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke(); lastX = p.x; lastY = p.y; }, { passive: false });
    canvas.addEventListener('touchend',   () => drawing = false);
  });
}

function clearAllCanvas() {
  [0,1,2,3,4].forEach(n => {
    const canvas = document.getElementById('hiraCanvas' + n);
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  });
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
  if (newIdx < HIRAGANA_FLAT.length) {
    hiraganaState.currentIdx = newIdx;
    renderHiraganaPractice();
  } else {
    showToast('🎉 所有假名練習完成！');
    renderHiraganaScreen();
  }
}

// ---- 測驗模式 ----
let hiraQuiz = { questions: [], idx: 0, correct: 0, selected: null };

function renderHiraganaQuiz() {
  const content = document.getElementById('hiraganaContent');
  const practiced = HIRAGANA_FLAT.filter(c => state.hiragana[c]?.practiced);
  if (practiced.length < 4) {
    content.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>請先練習至少 4 個假名！</p></div>`;
    return;
  }
  // 建立題目
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
    state.wrongWords[correct] = (state.wrongWords[correct] || 0) + 1;
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

// ==================== QUIZ ====================
let quiz = { questions: [], idx: 0, correct: 0, type: '', clozeSelected: null };

function getSpacedWords() {
  const words = state.lang === 'ja' ? state.jaWords : state.words;
  const now = Date.now();
  const due = words.filter(w => w.nextReview <= now);
  const notDue = words.filter(w => w.nextReview > now);
  return [...due, ...notDue].slice(0, 10);
}

async function buildClozeQuestion(word) {
  const sentence = state.lang === 'ja' ? word.sentence : word.sentence;
  if (!sentence) return null;
  const type = state.lang === 'ja' ? 'ja_cloze' : 'cloze';
  try {
    const r = await callScript({ type, sentence });
    return { type: 'cloze', word, clozeData: r };
  } catch(e) {
    const key = state.lang === 'ja' ? word.word : word.en;
    return {
      type: 'cloze', word,
      clozeData: {
        sentence, blank_word: key,
        display_sentence: sentence.replace(new RegExp(key, 'gi'), '___'),
        options: [key, 'は', 'が', 'を'].sort(() => Math.random() - 0.5),
        answer: key
      }
    };
  }
}

async function startQuiz(type) {
  const words = getSpacedWords();
  if (!words.length) { showToast('⚠️ 請先新增單字！'); return; }
  quiz.type = type; quiz.questions = []; quiz.idx = 0; quiz.correct = 0;
  document.getElementById('quizMenu').style.display = 'none';
  document.getElementById('quizPlay').classList.add('active');
  document.getElementById('questionCard').innerHTML = `<div style="padding:30px 0;text-align:center;color:var(--text-soft)"><span class="loading-dots" style="color:var(--sky-dark)"><span></span><span></span><span></span></span><br><br>準備題目中...</div>`;
  document.getElementById('checkBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'none';
  document.getElementById('feedbackBox').style.display = 'none';

  const wordsWithSentence = words.filter(w => w.sentence);
  const qs = [];
  const total = Math.min(10, words.length);
  for (let i = 0; i < total; i++) {
    let t = type;
    if (type === 'mixed') {
      const pool = ['spelling'];
      if (wordsWithSentence.length) pool.push('sentence', 'cloze');
      t = pool[i % pool.length];
    }
    if (t === 'spelling') {
      qs.push({ type: 'spelling', word: words[i % words.length] });
    } else if (t === 'sentence') {
      if (!wordsWithSentence.length) { qs.push({ type: 'spelling', word: words[i % words.length] }); }
      else { const w = wordsWithSentence[i % wordsWithSentence.length]; qs.push({ type: 'sentence', word: w }); }
    } else if (t === 'cloze') {
      const w = wordsWithSentence[i % Math.max(wordsWithSentence.length,1)] || words[0];
      const q = await buildClozeQuestion(w);
      qs.push(q || { type: 'spelling', word: words[i % words.length] });
    }
  }
  quiz.questions = qs;
  renderQuestion();
}

function getWordKey(word) {
  return state.lang === 'ja' ? word.word : word.en;
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

  const speakLang = isJa ? 'ja-JP' : 'en-US';
  let html = '';
  if (q.type === 'spelling') {
    const label = isJa ? '聽發音，寫出日文單字（平假名）' : '聽聲音，把英文單字拼出來';
    const hint = isJa ? q.word.zh : q.word.zh;
    html = `<div class="question-type-label">${isJa?'聽寫單字':'英聽拼寫單字'}</div>
      <button class="speak-big-btn" id="speakBtn" onclick="speakQuestion()">🔊</button>
      <div class="question-hint">${label}</div>
      <div class="question-zh">${hint}</div>
      <input class="answer-input" id="answerInput" type="text" placeholder="${isJa?'輸入平假名...':'輸入英文單字...'}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">`;
  } else if (q.type === 'sentence') {
    html = `<div class="question-type-label">${isJa?'聽寫例句':'英聽寫句子'}</div>
      <button class="speak-big-btn" id="speakBtn" onclick="speakQuestion()">🔊</button>
      <div class="question-hint">${isJa?'聽發音，寫出日文例句':'聽聲音，把英文句子寫出來'}</div>
      <div class="question-zh">${q.word.zh} 的例句</div>
      <input class="answer-input" id="answerInput" type="text" placeholder="${isJa?'輸入例句...':'輸入英文句子...'}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">`;
  } else if (q.type === 'cloze') {
    const cd = q.clozeData;
    html = `<div class="question-type-label">克漏字測驗</div>
      <div class="question-hint">選出正確的單字填入空格</div>
      <div class="cloze-sentence">${cd.display_sentence.replace('___','<span style="display:inline-block;background:#E3F2FD;border-radius:8px;padding:2px 16px;min-width:80px;border-bottom:2px solid var(--sky-dark);color:var(--sky-dark)">___</span>')}</div>
      <div class="cloze-options">${cd.options.map(opt=>`<button class="cloze-opt-btn" onclick="selectClozeOption(this,'${esc(opt)}')">${opt}</button>`).join('')}</div>`;
  }
  document.getElementById('questionCard').innerHTML = html;
  setTimeout(() => speakQuestion(), 400);
}

function selectClozeOption(btn, val) {
  document.querySelectorAll('.cloze-opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  quiz.clozeSelected = val;
}

function speakQuestion() {
  const q = quiz.questions[quiz.idx];
  const btn = document.getElementById('speakBtn');
  if (!btn) return;
  btn.classList.add('speaking');
  const isJa = state.lang === 'ja';
  const lang = isJa ? 'ja-JP' : 'en-US';
  let text = '';
  if (q.type === 'spelling') text = getWordKey(q.word);
  else if (q.type === 'sentence') text = q.word.sentence;
  else if (q.type === 'cloze') text = q.clozeData.sentence;
  speak(text, lang, 0.8);
  setTimeout(() => btn && btn.classList.remove('speaking'), 2000);
}

function checkAnswer() {
  const q = quiz.questions[quiz.idx];
  let val, correct;
  if (q.type === 'cloze') {
    if (!quiz.clozeSelected) { showToast('請選擇一個答案！'); return; }
    val = quiz.clozeSelected; correct = q.clozeData.answer;
  } else {
    const input = document.getElementById('answerInput');
    val = input ? input.value.trim() : '';
    if (!val) { showToast('請填入答案！'); return; }
    correct = q.type === 'spelling' ? getWordKey(q.word) : q.word.sentence;
  }

  const isCorrect = val.toLowerCase() === correct.toLowerCase();
  const fb = document.getElementById('feedbackBox');
  fb.style.display = 'block';

  if (q.type === 'cloze') {
    document.querySelectorAll('.cloze-opt-btn').forEach(b => {
      b.disabled = true;
      if (b.textContent === correct) b.classList.add('correct-opt');
      else if (b.textContent === val && !isCorrect) b.classList.add('wrong-opt');
    });
  } else {
    const input = document.getElementById('answerInput');
    if (input) input.className = 'answer-input ' + (isCorrect ? 'correct' : 'wrong');
  }

  if (isCorrect) {
    fb.className = 'feedback-box correct';
    document.getElementById('feedbackEmoji').textContent = ['🎉','⭐','🌟','✨','🥳'][Math.floor(Math.random()*5)];
    document.getElementById('feedbackText').textContent = ['太棒了！','答對了！','好厲害！','完美！'][Math.floor(Math.random()*4)];
    document.getElementById('feedbackAnswer').textContent = '';
    quiz.correct++; state.totalCorrect++;
    if (q.type === 'spelling') {
      q.word.streak = (q.word.streak||0) + 1;
      q.word.nextReview = Date.now() + Math.pow(2, q.word.streak) * 86400000;
    }
    playCorrectSound();
    if (Math.random() < 0.4) confetti();
  } else {
    fb.className = 'feedback-box wrong';
    document.getElementById('feedbackEmoji').textContent = '💪';
    document.getElementById('feedbackText').textContent = '沒關係，再加油！';
    document.getElementById('feedbackAnswer').textContent = `正確答案：${correct}`;
    if (q.type === 'spelling') {
      q.word.streak = 0; q.word.nextReview = Date.now() + 600000;
      state.wrongWords[getWordKey(q.word)] = (state.wrongWords[getWordKey(q.word)] || 0) + 1;
    }
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
    { genre: 'Fairy Tale',       icon: '🧚', sub: '童話' },
    { genre: 'Adventure',        icon: '🗺️', sub: '冒險' },
    { genre: 'Animal Story',     icon: '🦁', sub: '動物故事' },
    { genre: 'Mystery',          icon: '🔍', sub: '推理' },
    { section: '🌍 生活類' },
    { genre: 'Daily Life',       icon: '🏠', sub: '日常生活' },
    { genre: 'Travel',           icon: '✈️', sub: '旅行' },
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
    const learnedWords = isJa ? state.jaWords.map(w => w.word) : state.words.map(w => w.en);
    const data = await callScript({
      type: isJa ? 'ja_story' : 'story',
      level: storyState.level,
      genre: storyState.genre,
      learned_words: learnedWords
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

    const speakLang = isJa ? 'ja-JP' : 'en-US';
    document.getElementById('storyBody').innerHTML = (data.sentences||[])
      .map((s,i) => `<span class="story-sent" id="story-sent-${i}" onclick="speakSentence(${i})">${s} </span>`).join('');

    const zhArea = document.getElementById('storyZhArea');
    if (data.story_zh) {
      const zhParagraphs = data.story_zh.split('\n\n').map(p=>`<p>${p}</p>`).join('');
      zhArea.innerHTML = `<button class="story-zh-toggle" onclick="toggleStoryZh(this)">🇹🇼 顯示中文翻譯</button><div class="story-zh-content" style="display:none">${zhParagraphs}</div>`;
    } else { zhArea.innerHTML = ''; }

    if (data.cultural_note) {
      const cn = document.getElementById('culturalNote');
      cn.style.display = 'block';
      cn.innerHTML = `<strong>📌 文化備註</strong>${data.cultural_note}`;
    } else { document.getElementById('culturalNote').style.display = 'none'; }

    const vocab = data.key_vocabulary || [];
    window._storyVocab = vocab;
    window._storyVocabChecked = vocab.map(() => true);
    document.getElementById('vocabList').innerHTML = vocab.map((v,i) => {
      const wordDisplay = isJa ? `${v.word} <span style="font-size:12px;color:#90A4AE">${v.reading||''}</span>` : v.en;
      const speakWord = isJa ? v.word : v.en;
      return `<div class="vocab-item">
        <span class="vocab-add-check" id="vchk${i}" onclick="toggleVocab(${i})">${window._storyVocabChecked[i]?'☑️':'⬜'}</span>
        <div>
          <div class="vocab-en">${wordDisplay} <span style="font-size:12px;color:#90A4AE">${v.pos||''}</span>
            <button class="speak-btn" style="width:26px;height:26px;font-size:12px;margin-left:4px" onclick="speak('${esc(speakWord)}','${speakLang}')">🔊</button>
          </div>
          <div class="vocab-zh">${v.zh}</div>
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
    } else { throw new Error('無法取得圖片'); }
  } catch(e) {
    imgArea.innerHTML = `<div class="story-img-error">🎨 插圖生成失敗<br><small>${e.message}</small><br><button class="story-img-btn" style="margin-top:10px" onclick="generateStoryImage()">重試</button></div>`;
  }
}

window.toggleVocab = (i) => {
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
      if (state.jaWords.find(x => x.word === v.word)) continue;
      state.jaWords.push({ word: v.word, reading: v.reading||'', zh: v.zh, pos: v.pos||'', sentence: v.sentence||'', streak: 0, nextReview: Date.now() });
    } else {
      if (state.words.find(x => x.en.toLowerCase() === (v.en||'').toLowerCase())) continue;
      let pos = v.pos||'', sentence = v.sentence||'', zh = v.zh||'';
      if (!pos) {
        try { const r = await callScript({ type: 'lookup', word: v.en }); pos = r.pos||''; sentence = r.sentence||sentence; zh = r.zh||zh; } catch(e) {}
      }
      state.words.push({ en: v.en, zh, pos, sentence, streak: 0, nextReview: Date.now() });
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
  const lang = state.lang === 'ja' ? 'ja-JP' : 'en-US';
  const u = new SpeechSynthesisUtterance(stripEmoji(storyState.sentences[idx]));
  u.lang = lang; u.rate = LEVEL_RATES[storyState.level] || 0.85;
  u.onend = () => el.classList.remove('speaking');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function readStoryAll() {
  stopReading();
  const sentences = storyState.sentences;
  if (!sentences.length) return;
  const lang = state.lang === 'ja' ? 'ja-JP' : 'en-US';
  const rate = LEVEL_RATES[storyState.level] || 0.85;
  let idx = 0;
  function speakNext() {
    if (idx >= sentences.length) { clearHighlight(); return; }
    clearHighlight();
    const el = document.getElementById('story-sent-' + idx);
    if (el) el.classList.add('speaking');
    const u = new SpeechSynthesisUtterance(stripEmoji(sentences[idx]));
    u.lang = lang; u.rate = rate;
    u.onend = () => { idx++; speakNext(); };
    window.speechSynthesis.speak(u);
  }
  speakNext();
}

function readStoryStep() {
  const idx = storyState.stepIdx;
  if (idx >= storyState.sentences.length) { storyState.stepIdx = 0; showToast('已朗讀完畢，從頭開始'); return; }
  clearHighlight();
  const el = document.getElementById('story-sent-' + idx);
  if (el) { el.classList.add('speaking'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const lang = state.lang === 'ja' ? 'ja-JP' : 'en-US';
  const u = new SpeechSynthesisUtterance(stripEmoji(storyState.sentences[idx]));
  u.lang = lang; u.rate = LEVEL_RATES[storyState.level] || 0.85;
  u.onend = () => el && el.classList.remove('speaking');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  storyState.stepIdx++;
}

function stopReading() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  clearHighlight(); storyState.stepIdx = 0;
}

function clearHighlight() {
  document.querySelectorAll('.story-sent.speaking').forEach(el => el.classList.remove('speaking'));
}

// ==================== SOUND + CONFETTI ====================
function playCorrectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523,659,784].forEach((freq,i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime+i*0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+i*0.1+0.25);
      osc.start(ctx.currentTime+i*0.1); osc.stop(ctx.currentTime+i*0.1+0.25);
    });
  } catch(e) {}
}

function confetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#FFD700','#FF6B6B','#4FC3F7','#66BB6A','#CE93D8','#FF8A65'];
  const pieces = Array.from({length:40}, () => ({
    x: Math.random()*canvas.width, y: -10,
    r: Math.random()*8+4, color: colors[Math.floor(Math.random()*colors.length)],
    vy: Math.random()*4+2, vx: (Math.random()-0.5)*3,
    rotation: Math.random()*360, rotV: (Math.random()-0.5)*10
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rotation*Math.PI/180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r); ctx.restore();
      p.x+=p.vx; p.y+=p.vy; p.rotation+=p.rotV;
    });
    if (++frame<60) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  draw();
}

// ==================== BOOT ====================
load();
renderNav();
updateHome();
