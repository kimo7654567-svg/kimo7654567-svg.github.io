// ==================== STATE ====================
let state = {
  words: [], xp: 0,
  totalQuizzes: 0, totalCorrect: 0, wrongWords: {},
};

const LEVELS = [
  { name: '🌱 英語新芽', min: 0 },
  { name: '🐛 努力學習者', min: 100 },
  { name: '🦋 單字探險家', min: 250 },
  { name: '⭐ 英語小勇士', min: 500 },
  { name: '🔥 句子大師', min: 900 },
  { name: '👑 英語冒險王', min: 1500 },
];

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
      delete state.sentences; // 相容舊版
    }
  } catch(e) {}
}

// ==================== UI ====================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'words') renderWordList();
  if (name === 'wrong') renderWrong();
  if (name === 'home') updateHome();
  if (name === 'quiz') resetQuiz();
  if (name === 'story') renderGenreGrid(storyState.level);
}

function updateHome() {
  const lv = getLevel(state.xp);
  document.getElementById('heroLevelName').textContent = lv.name;
  document.getElementById('heroXpBar').style.width = lv.pct + '%';
  document.getElementById('heroXpLabel').textContent = lv.label;
  document.getElementById('headerXP').textContent = state.xp;
  document.getElementById('headerLevel').textContent = lv.num;
  document.getElementById('statWords').textContent = state.words.length;
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

function renderWordList() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const container = document.getElementById('wordListContainer');
  const words = state.words.filter(w => !q || w.en.toLowerCase().includes(q) || w.zh.includes(q));
  if (!words.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>還沒有單字，去新增吧！</p></div>`;
    return;
  }
  const icons = ['🍎','🐶','⭐','🎈','🌈','🦁','🌸','🚀','🎵','🍭','🐠','🌻'];
  container.innerHTML = words.map((w, i) => {
    const sc = w.streak >= 5 ? 'streak-great' : w.streak >= 2 ? 'streak-good' : 'streak-new';
    const sl = w.streak >= 5 ? '🌟 熟練' : w.streak >= 2 ? '✅ 還不錯' : '🆕 新字';
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
  container.innerHTML = entries.map(([en, count]) => {
    const w = state.words.find(x => x.en === en);
    return `<div class="wrong-item"><div class="wrong-en">${en}</div>${w ? `<div class="wrong-zh">${w.zh}</div>` : ''}<div class="wrong-count">答錯 ${count} 次</div></div>`;
  }).join('');
}

// ==================== IMPORT / EXPORT ====================
function exportWords() {
  const data = { words: state.words, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `英語冒險單字庫_${new Date().toLocaleDateString('zh-TW').replace(/\//g,'-')}.json`;
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
      const newWords = data.words || [];
      if (_importMode === 'replace') {
        if (!confirm(`確定要覆蓋？將取代現有 ${state.words.length} 個單字。`)) return;
        state.words = newWords;
        showToast(`✅ 已載入 ${state.words.length} 個單字`);
      } else {
        let added = 0;
        newWords.forEach(w => {
          if (!state.words.find(x => x.en.toLowerCase() === w.en.toLowerCase())) {
            state.words.push(w); added++;
          }
        });
        showToast(`✅ 合併完成！新增 ${added} 個單字`);
      }
      save(); renderWordList();
    } catch(err) {
      showToast('❌ 檔案格式錯誤');
    }
  };
  reader.readAsText(file);
}

// ==================== WORDS ====================
let _lastLookedUp = '';

async function autoLookup() {
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
    status.innerHTML = '✅ 已自動填入，可修改後再加入';
    status.style.color = '#388E3C';
  } catch(e) {
    status.innerHTML = '❌ ' + e.message;
    status.style.color = '#EF5350';
  }
  btn.disabled = false;
}

function addWord() {
  const en = document.getElementById('addWord').value.trim();
  const zh = document.getElementById('addZh').value.trim();
  const pos = document.getElementById('addPos').value.trim();
  const sentence = document.getElementById('addSentence').value.trim();
  if (!en || !zh) { showToast('⚠️ 請填入英文和中文'); return; }
  state.words.push({ en, zh, pos, sentence, streak: 0, nextReview: Date.now() });
  save();
  ['addWord','addZh','addPos','addSentence'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lookupStatus').style.display = 'none';
  _lastLookedUp = '';
  showToast('✅ 單字加入成功！'); addXP(5);
}

function deleteWord(idx) {
  if (confirm('確定要刪除這個單字嗎？')) {
    state.words.splice(idx, 1); save(); renderWordList(); showToast('🗑 已刪除');
  }
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

function speak(text, rate = 0.85) {
  if (!window.speechSynthesis) { showToast('此裝置不支援語音'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(stripEmoji(text));
  u.lang = 'en-US'; u.rate = rate;
  window.speechSynthesis.speak(u);
}

// ==================== QUIZ ====================
let quiz = { questions: [], idx: 0, correct: 0, type: '', clozeSelected: null };

function getSpacedWords() {
  const now = Date.now();
  const due = state.words.filter(w => w.nextReview <= now);
  const notDue = state.words.filter(w => w.nextReview > now);
  return [...due, ...notDue].slice(0, 10);
}

async function buildClozeQuestion(word) {
  if (!word.sentence) return null;
  try {
    const r = await callScript({ type: 'cloze', sentence: word.sentence });
    return { type: 'cloze', word, clozeData: r };
  } catch(e) {
    return {
      type: 'cloze', word,
      clozeData: {
        sentence: word.sentence,
        blank_word: word.en,
        display_sentence: word.sentence.replace(new RegExp(word.en, 'gi'), '___'),
        options: [word.en, 'the', 'a', 'in'].sort(() => Math.random() - 0.5),
        answer: word.en
      }
    };
  }
}

async function startQuiz(type) {
  if (!state.words.length) { showToast('⚠️ 請先新增單字！'); return; }
  const words = getSpacedWords();
  if (!words.length) { showToast('⚠️ 單字不足'); return; }

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
      if (!wordsWithSentence.length) {
        qs.push({ type: 'spelling', word: words[i % words.length] });
      } else {
        const w = wordsWithSentence[i % wordsWithSentence.length];
        qs.push({ type: 'sentence', word: w });
      }
    } else if (t === 'cloze') {
      const w = wordsWithSentence[i % Math.max(wordsWithSentence.length, 1)] || words[0];
      const q = await buildClozeQuestion(w);
      qs.push(q || { type: 'spelling', word: words[i % words.length] });
    }
  }
  quiz.questions = qs;
  renderQuestion();
}

function renderQuestion() {
  quiz.clozeSelected = null;
  const q = quiz.questions[quiz.idx];
  const total = quiz.questions.length;
  document.getElementById('quizProgressText').textContent = `第 ${quiz.idx + 1} 題 / 共 ${total} 題`;
  document.getElementById('quizScoreText').textContent = `✅ ${quiz.correct} 答對`;
  document.getElementById('quizProgressBar').style.width = Math.round((quiz.idx / total) * 100) + '%';
  document.getElementById('feedbackBox').style.display = 'none';
  document.getElementById('feedbackBox').className = 'feedback-box';
  document.getElementById('checkBtn').style.display = 'block';
  document.getElementById('nextBtn').style.display = 'none';

  let html = '';
  if (q.type === 'spelling') {
    html = `<div class="question-type-label">英聽拼寫單字</div>
      <button class="speak-big-btn" id="speakBtn" onclick="speakQuestion()">🔊</button>
      <div class="question-hint">聽聲音，把英文單字拼出來</div>
      <div class="question-zh">${q.word.zh}</div>
      <input class="answer-input" id="answerInput" type="text" placeholder="輸入英文單字..." autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">`;
  } else if (q.type === 'sentence') {
    html = `<div class="question-type-label">英聽寫句子</div>
      <button class="speak-big-btn" id="speakBtn" onclick="speakQuestion()">🔊</button>
      <div class="question-hint">聽聲音，把英文句子寫出來</div>
      <div class="question-zh">${q.word.zh} 的例句</div>
      <input class="answer-input" id="answerInput" type="text" placeholder="輸入英文句子..." autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">`;
  } else if (q.type === 'cloze') {
    const cd = q.clozeData;
    html = `<div class="question-type-label">克漏字測驗</div>
      <div class="question-hint">選出正確的單字填入空格</div>
      <div class="cloze-sentence">${cd.display_sentence.replace('___', '<span style="display:inline-block;background:#E3F2FD;border-radius:8px;padding:2px 16px;min-width:80px;border-bottom:2px solid var(--sky-dark);color:var(--sky-dark)">___</span>')}</div>
      <div class="cloze-options">
        ${cd.options.map(opt => `<button class="cloze-opt-btn" onclick="selectClozeOption(this,'${esc(opt)}')">${opt}</button>`).join('')}
      </div>`;
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
  let text = '';
  if (q.type === 'spelling') text = q.word.en;
  else if (q.type === 'sentence') text = q.word.sentence;
  else if (q.type === 'cloze') text = q.clozeData.sentence;
  speak(text, 0.8);
  setTimeout(() => btn && btn.classList.remove('speaking'), 2000);
}

function checkAnswer() {
  const q = quiz.questions[quiz.idx];
  let val, correct;
  if (q.type === 'cloze') {
    if (!quiz.clozeSelected) { showToast('請選擇一個答案！'); return; }
    val = quiz.clozeSelected;
    correct = q.clozeData.answer;
  } else {
    const input = document.getElementById('answerInput');
    val = input ? input.value.trim() : '';
    if (!val) { showToast('請填入答案！'); return; }
    correct = q.type === 'spelling' ? q.word.en : q.word.sentence;
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
      q.word.streak = (q.word.streak || 0) + 1;
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
      q.word.streak = 0;
      q.word.nextReview = Date.now() + 600000;
      state.wrongWords[q.word.en] = (state.wrongWords[q.word.en] || 0) + 1;
    }
  }
  document.getElementById('checkBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'block';
  save();
}

function nextQuestion() {
  quiz.idx++;
  if (quiz.idx >= quiz.questions.length) finishQuiz();
  else renderQuestion();
}

function finishQuiz() {
  state.totalQuizzes++;
  const earned = quiz.correct * 10;
  addXP(earned);
  document.getElementById('quizPlay').classList.remove('active');
  const result = document.getElementById('quizResult');
  result.classList.add('active');
  const pct = Math.round((quiz.correct / quiz.questions.length) * 100);
  document.getElementById('resultEmoji').textContent = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '😊' : '💪';
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
    { genre: 'Hero Quest',  icon: '⚔️', sub: '英雄任務' },
    { genre: 'Robot/Tech',  icon: '🤖', sub: '機器人科技' },
    { genre: 'Escape Room', icon: '🔐', sub: '密室逃脫' },
    { genre: 'Adventure',   icon: '🗺️', sub: '冒險' },
    { genre: 'Animal Story',icon: '🦁', sub: '動物故事' },
    { genre: 'Sci-Fi',      icon: '🚀', sub: '科幻' },
  ],
  default: [
    { section: '✨ 想像類' },
    { genre: 'Fairy Tale',  icon: '🧚', sub: '童話故事' },
    { genre: 'Adventure',   icon: '🗺️', sub: '冒險' },
    { genre: 'Mystery',     icon: '🔍', sub: '神秘推理' },
    { genre: 'Sci-Fi',      icon: '🚀', sub: '科幻' },
    { genre: 'Animal Story',icon: '🦁', sub: '動物故事' },
    { section: '🌍 實用生活類' },
    { genre: 'Travel',      icon: '✈️', sub: '旅行' },
    { genre: 'Daily Life',  icon: '🏠', sub: '日常生活' },
    { genre: 'Medical',     icon: '🏥', sub: '醫療' },
    { genre: 'Workplace',   icon: '💼', sub: '職場' },
  ]
};

function renderGenreGrid(level) {
  const list = level === 'L0.5' ? GENRES['L0.5'] : GENRES['default'];
  const grid = document.getElementById('genreGrid');
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
  // 切換 level 時重設 genre 為該 level 的第一個
  const list = lv === 'L0.5' ? GENRES['L0.5'] : GENRES['default'];
  const firstGenre = list.find(i => i.genre);
  storyState.genre = firstGenre ? firstGenre.genre : 'Adventure';
  renderGenreGrid(lv);
}

function selectGenre(g) {
  storyState.genre = g;
  document.querySelectorAll('.genre-chip').forEach(c => c.classList.toggle('selected', c.dataset.genre === g));
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
  try {
    const data = await callScript({
      type: 'story',
      level: storyState.level,
      genre: storyState.genre,
      learned_words: state.words.map(w => w.en)
    });
    storyState.sentences = data.sentences || [];
    storyState.stepIdx = 0;
    storyState.currentTitle = data.title || '';
    storyState.currentGenre = storyState.genre;

    document.getElementById('storySetup').style.display = 'none';
    document.getElementById('storyResult').classList.add('active');

    // 重置圖片區
    document.getElementById('storyImageArea').innerHTML =
      `<button class="story-img-btn" onclick="generateStoryImage()">🎨 生成故事插圖</button>`;

    const levelNames = { 'L0.5':'Graphic Reader', L1:'Starter A1', L2:'Elementary A2', L3:'Intermediate B1', L4:'Upper-Int B2', L5:'Advanced C1' };
    document.getElementById('storyTitle').textContent = data.title || '故事';
    document.getElementById('storyMeta').innerHTML = `
      <span class="story-badge">${storyState.genre}</span>
      <span class="story-badge">${levelNames[storyState.level]}</span>
      <span class="story-badge">⏱ ${data.reading_time || ''}</span>`;

    document.getElementById('storyBody').innerHTML = (data.sentences || [])
      .map((s, i) => `<span class="story-sent" id="story-sent-${i}" onclick="speakSentence(${i})">${s} </span>`)
      .join('');

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
    document.getElementById('vocabList').innerHTML = vocab.map((v, i) => `
      <div class="vocab-item">
        <span class="vocab-add-check" id="vchk${i}" onclick="toggleVocab(${i})">${window._storyVocabChecked[i] ? '☑️' : '⬜'}</span>
        <div>
          <div class="vocab-en">${v.en} <span style="font-size:12px;color:#90A4AE">${v.pos||''}</span>
            <button class="speak-btn" style="width:26px;height:26px;font-size:12px;margin-left:4px" onclick="speak('${esc(v.en)}')">🔊</button>
          </div>
          <div class="vocab-zh">${v.zh}</div>
          <div class="vocab-sent">${v.sentence||''}</div>
        </div>
      </div>`).join('');

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
    const result = await callScript({
      type: 'image',
      title: storyState.currentTitle,
      genre: storyState.currentGenre,
      level: storyState.level
    });
    if (result.imageData) {
      imgArea.innerHTML = `<img src="data:image/png;base64,${result.imageData}" alt="故事插圖" class="story-img">`;
    } else {
      throw new Error('無法取得圖片');
    }
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
  let count = 0;
  for (let i = 0; i < vocab.length; i++) {
    if (!window._storyVocabChecked[i]) continue;
    const v = vocab[i];
    if (state.words.find(x => x.en.toLowerCase() === v.en.toLowerCase())) continue;
    let pos = v.pos || '', sentence = v.sentence || '', zh = v.zh || '';
    if (!pos) {
      try {
        const r = await callScript({ type: 'lookup', word: v.en });
        pos = r.pos || ''; sentence = r.sentence || sentence; zh = r.zh || zh;
      } catch(e) {}
    }
    state.words.push({ en: v.en, zh, pos, sentence, streak: 0, nextReview: Date.now() });
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
  const u = new SpeechSynthesisUtterance(stripEmoji(storyState.sentences[idx]));
  u.lang = 'en-US'; u.rate = LEVEL_RATES[storyState.level] || 0.85;
  u.onend = () => el.classList.remove('speaking');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function readStoryAll() {
  stopReading();
  const sentences = storyState.sentences;
  if (!sentences.length) return;
  const rate = LEVEL_RATES[storyState.level] || 0.85;
  let idx = 0;
  function speakNext() {
    if (idx >= sentences.length) { clearHighlight(); return; }
    clearHighlight();
    const el = document.getElementById('story-sent-' + idx);
    if (el) el.classList.add('speaking');
    const u = new SpeechSynthesisUtterance(stripEmoji(sentences[idx]));
    u.lang = 'en-US'; u.rate = rate;
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
  const u = new SpeechSynthesisUtterance(stripEmoji(storyState.sentences[idx]));
  u.lang = 'en-US'; u.rate = LEVEL_RATES[storyState.level] || 0.85;
  u.onend = () => el && el.classList.remove('speaking');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  storyState.stepIdx++;
}

function stopReading() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  clearHighlight();
  storyState.stepIdx = 0;
}

function clearHighlight() {
  document.querySelectorAll('.story-sent.speaking').forEach(el => el.classList.remove('speaking'));
}

// ==================== SOUND + CONFETTI ====================
function playCorrectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
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
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#FFD700','#FF6B6B','#4FC3F7','#66BB6A','#CE93D8','#FF8A65'];
  const pieces = Array.from({length: 40}, () => ({
    x: Math.random() * canvas.width, y: -10,
    r: Math.random() * 8 + 4, color: colors[Math.floor(Math.random()*colors.length)],
    vy: Math.random() * 4 + 2, vx: (Math.random()-0.5)*3,
    rotation: Math.random() * 360, rotV: (Math.random()-0.5)*10
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
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
load();
updateHome();
