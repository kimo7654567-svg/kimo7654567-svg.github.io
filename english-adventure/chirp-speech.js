// Chirp audio is stored separately from each child's learning data.
const chirpSpeech = (() => {
  const pending = new Map(), memory = new Map();
  let database, context, source, generation = 0, finish = null;

  function openCache() {
    if (!database) database = new Promise(resolve => {
      if (!window.indexedDB) { resolve(null); return; }
      const timeout = setTimeout(() => resolve(null), 1500);
      try {
        const request = indexedDB.open('ea_chirp_audio_v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('audio');
        request.onsuccess = () => { clearTimeout(timeout); resolve(request.result); };
        request.onerror = request.onblocked = () => { clearTimeout(timeout); resolve(null); };
      } catch(e) { clearTimeout(timeout); resolve(null); }
    });
    return database;
  }

  async function readCache(key) {
    const db = await openCache();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction('audio', 'readonly');
        const request = tx.objectStore('audio').get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = tx.onabort = () => resolve(null);
      } catch(e) { resolve(null); }
    });
  }

  async function saveCache(key, value) {
    const db = await openCache();
    if (!db) return;
    try {
      const tx = db.transaction('audio', 'readwrite');
      tx.onerror = event => event.preventDefault();
      const store = tx.objectStore('audio');
      store.put(value, key);
      // Bound this audio cache without touching any learning records.
      const keys = store.getAllKeys();
      keys.onsuccess = () => keys.result.slice(0, Math.max(0, keys.result.length - 300))
        .forEach(oldKey => { if (oldKey !== key) store.delete(oldKey); });
    } catch(e) { /* A full/private browser cache must not prevent playback. */ }
  }

  async function getAudio(text, lang, rate) {
    const url = state.settings.scriptUrl || DEFAULT_SCRIPT_URL;
    const key = JSON.stringify(['chirp-kore-v1', url, lang, rate, text]);
    if (memory.has(key)) return memory.get(key);
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      let data = await readCache(key);
      if (!data) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
          const response = await fetch(url, { method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'tts_chirp', text, lang, rate }), signal: controller.signal });
          if (!response.ok) throw new Error('語音服務 HTTP ' + response.status);
          const result = await response.json();
          if (!result.ok) throw new Error(result.error || '語音服務沒有回傳音訊');
          data = JSON.parse(result.text);
          if (!data.audioData || data.mimeType !== 'audio/mpeg') throw new Error('收到的語音格式不正確');
        } catch(e) {
          if (e.name === 'AbortError') throw new Error('語音載入逾時，請再按一次發音');
          throw e;
        } finally { clearTimeout(timeout); }
        void saveCache(key, data);
      }
      if (memory.size >= 100) memory.delete(memory.keys().next().value);
      memory.set(key, data);
      return data;
    })();
    pending.set(key, task);
    try { return await task; }
    finally { pending.delete(key); }
  }

  function stop() {
    generation++;
    if (source) {
      try { source.onended = null; source.stop(); source.disconnect(); } catch(e) {}
      source = null;
    }
    if (finish) { finish(false); finish = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  async function play(text, lang, rate) {
    stop();
    const token = generation;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('此瀏覽器不支援音訊播放，請使用新版 Safari 或 Chrome');
      if (!context || context.state === 'closed') context = new AudioContext();
      // Resume inside the original click event, before any network/cache awaits.
      const ready = context.resume();
      showToast('⏳ 載入語音…', 45000);
      let resumeTimeout;
      try {
        await Promise.race([ready, new Promise((resolve, reject) => {
          resumeTimeout = setTimeout(() => reject(new Error('請點擊發音按鈕以允許播放')), 3000);
        })]);
      } finally { clearTimeout(resumeTimeout); }
      if (token !== generation) return false;
      const data = await getAudio(text, lang, rate);
      if (token !== generation) return false;
      const bytes = Uint8Array.from(atob(data.audioData), c => c.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer);
      if (token !== generation) return false;
      if (context.state !== 'running') throw new Error('播放暫停，請再按一次發音');
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      source = node;
      showToast('🔊 播放中', 1200);
      return await new Promise(resolve => {
        finish = resolve;
        node.onended = () => {
          node.disconnect();
          if (source === node) { source = null; finish = null; }
          resolve(token === generation);
        };
        node.start();
      });
    } catch(e) {
      if (token === generation) showToast('❌ ' + e.message + '；可再按一次重試', 8000);
      return false;
    }
  }
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return { play, stop };
})();
