// ==================== API ====================
// Script URL 和 secret 由 state.settings 管理（設定頁可修改）
// 這裡保留預設值作為 fallback
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHmM7yXQskkWHKXF0B-obIJrMAhuKCdKaSDZnhjZUOogYykrlJSq762CeD5YlQt560/exec';
const DEFAULT_SECRET = '5566';

async function callScript(payload) {
  const url = (typeof state !== 'undefined' && state.settings?.scriptUrl) || DEFAULT_SCRIPT_URL;
  const secret = (typeof state !== 'undefined' && state.settings?.secret) || DEFAULT_SECRET;
  const params = encodeURIComponent(JSON.stringify({ ...payload, secret }));
  const res = await fetch(url + '?data=' + params, { method: 'GET' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '未知錯誤');
  return JSON.parse(data.text.replace(/```json|```/g, '').trim());
}
