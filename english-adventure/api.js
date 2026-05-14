// ==================== API ====================
// 請把 SCRIPT_URL 換成你最新部署的網址
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHmM7yXQskkWHKXF0B-obIJrMAhuKCdKaSDZnhjZUOogYykrlJSq762CeD5YlQt560/exec';
const SECRET = '5566';

async function callScript(payload) {
  const params = encodeURIComponent(JSON.stringify({ ...payload, secret: SECRET }));
  const res = await fetch(SCRIPT_URL + '?data=' + params, { method: 'GET' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '未知錯誤');
  return JSON.parse(data.text.replace(/```json|```/g, '').trim());
}
