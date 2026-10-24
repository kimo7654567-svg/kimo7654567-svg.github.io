// Background session accounting. Separate storage leaves existing learning data intact.
const learningTime = (() => {
  const PREFIX = 'ea_learning_session_';
  const IDLE = 5 * 60 * 1000;
  let session = null, lastTick = 0, lastInput = 0, active = false, sending = false;

  function persist() {
    if (!session) return;
    try { localStorage.setItem(PREFIX + session.id, JSON.stringify(session)); } catch(e) {}
  }

  function tick() {
    if (!session) return;
    const now = Date.now();
    // A delayed timer after device sleep must not count the whole suspended interval.
    if (active && now - lastTick <= 90000) {
      session.activeMs += Math.max(0, Math.min(now, lastInput + IDLE) - lastTick);
    }
    lastTick = now;
    active = !document.hidden && document.hasFocus() && now < lastInput + IDLE;
    session.observedAt = now;
    persist();
  }

  async function flush() {
    if (sending) return;
    sending = true;
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
      for (const key of keys.slice(0, 10)) {
        const raw = localStorage.getItem(key);
        const record = JSON.parse(raw);
        if (!record) continue;
        const res = await fetch(record.url, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'learning_session', ...record }), keepalive: true,
        });
        const result = await res.json();
        if (!res.ok || !result.ok) break;
        // Do not erase a newer heartbeat written while this request was pending.
        if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
      }
    } catch(e) { /* Retry at the next heartbeat or next visit. */ }
    finally { sending = false; }
  }

  function stop() {
    if (!session) return;
    tick();
    session.endedAt = Date.now();
    persist();
    session = null;
    void flush();
  }

  function start(user, url) {
    stop();
    const now = Date.now();
    session = { id: crypto.randomUUID(), user, url, startedAt: now, observedAt: now,
      lastActivityAt: now, activeMs: 0, endedAt: null };
    lastTick = lastInput = now;
    active = !document.hidden && document.hasFocus();
    persist();
    void flush();
  }

  function input(event) {
    if (!session || !event.isTrusted || document.hidden || !document.hasFocus()) return;
    tick();
    lastInput = session.lastActivityAt = Date.now();
    active = true;
    persist();
  }
  ['pointerdown', 'keydown', 'scroll'].forEach(type =>
    document.addEventListener(type, input, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { tick(); void flush(); });
  window.addEventListener('blur', () => { tick(); active = false; void flush(); });
  window.addEventListener('focus', () => {
    tick();
    if (session && !document.hidden) {
      lastInput = session.lastActivityAt = Date.now();
      active = true;
      persist();
    }
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', event => {
    if (event.persisted && state.currentUser && document.getElementById('appWrapper').style.display !== 'none') {
      start(state.currentUser, state.settings.scriptUrl || DEFAULT_SCRIPT_URL);
    }
  });
  window.addEventListener('online', () => { void flush(); });
  setInterval(() => { tick(); void flush(); }, 60000);
  return { start, stop };
})();
