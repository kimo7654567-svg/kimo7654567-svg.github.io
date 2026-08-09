// ==================== API ====================
// Script URL 由 state.settings 管理（設定頁可修改）
// 這裡保留預設值作為 fallback
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHmM7yXQskkWHKXF0B-obIJrMAhuKCdKaSDZnhjZUOogYykrlJSq762CeD5YlQt560/exec';

async function callScript(payload) {
  const url = (typeof state !== 'undefined' && state.settings?.scriptUrl) || DEFAULT_SCRIPT_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '未知錯誤');
  return JSON.parse(data.text.replace(/```json|```/g, '').trim());
}
