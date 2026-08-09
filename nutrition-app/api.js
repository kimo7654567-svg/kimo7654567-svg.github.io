const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyziLzpDRO59mBwD8cHPkzxuDaeQPsqCPY2K164aKA45iFi8VkYNvlr4rqNXwRxcD9uFQ/exec';

function getScriptUrl() {
  return localStorage.getItem('nutritionScriptUrl') || DEFAULT_SCRIPT_URL;
}

async function callApi(action, payload = {}) {
  const url = getScriptUrl();
  if (!url) throw new Error('請先在設定中填入 Google Apps Script 網址');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'API 操作失敗');
  return result.data;
}
