const app = document.querySelector('#app');
const editor = document.querySelector('#record-editor');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
const capturedTime = () => new Date(Date.now()+8*3600000).toISOString().slice(0,19)+'+08:00';
const duration = n => `${Math.floor(n/60)} 小時 ${n%60} 分`;
const time = v => v ? v.slice(11,16) : '--:--';
const fieldLabel = k => k==='start'?'上班':'下班';
let token = sessionStorage.getItem('flyerToken') || '', data, selectedDate = today(), busy = false;
let pending = [], pendingUser = '', sending = false, historyWorker = '', focusRecord = '';
function notice(s){const status=editor.querySelector('#editor-status');if(editor.open&&status){status.textContent=s;status.hidden=false;}const el=document.querySelector('#message');el.textContent=s;el.classList.add('visible');clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.remove('visible'),5000);}
async function api(action,payload={}){
  if(!window.API_URL)throw Error('請先在 config.js 設定 Apps Script API 網址。');
  const res=await fetch(window.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,...payload}),redirect:'follow',signal:AbortSignal.timeout(90000)});
  const result=await res.json();if(!result.ok)throw Error(result.error);return result.data;
}
async function run(fn){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await fn();}catch(e){notice(e.message);}finally{
    busy=false;editor.querySelectorAll('button').forEach(b=>b.disabled=false);
    document.querySelector('#logout').disabled=sending;
    if(data){render();if(focusRecord){const card=[...app.querySelectorAll('[data-record-card]')].find(el=>el.dataset.recordCard===focusRecord);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.querySelector('[data-clock=start]:not([disabled]),[data-manage]:not([disabled])')?.focus({preventScroll:true});focusRecord='';}}else login();
  }
}
function pendingKey(){return 'flyerPending:'+window.API_URL+':'+pendingUser;}
function persistPending(){localStorage.setItem(pendingKey(),JSON.stringify(pending));}
function loadPending(){
  if(pendingUser===data.user.worker_id)return;
  pendingUser=data.user.worker_id;pending=[];
  try{pending=JSON.parse(localStorage.getItem(pendingKey())||'[]');if(!Array.isArray(pending))pending=[];
    pending.forEach(p=>{p.state='failed';p.error='上次尚未確認儲存結果，請重試確認。';});
  }catch(e){notice('無法讀取這台裝置的待儲存打卡：'+e.message);}
}
function login(){
  document.querySelector('#logout').hidden=true;
  app.innerHTML=`<section class="card login"><h2>開始今天的工作</h2><p class="muted">輸入姓名與個人 PIN，查看你的排班與紀錄。</p>${!window.API_URL?'<p class="hint">尚未連接 Google 服務。請依 README 完成部署，再設定 config.js。</p>':''}<form id="login"><label>姓名<input name="name" required autocomplete="username" maxlength="50"></label><label>個人 PIN<input name="pin" type="password" required autocomplete="current-password"></label><button class="full">登入</button></form></section>`;
  document.querySelector('#login').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));run(async()=>{const r=await api('login',values);token=r.token;sessionStorage.setItem('flyerToken',token);await refresh();});};
}
async function refresh(){data=await api('dashboard',{date:selectedDate});loadPending();render();}
function imageLinks(r){return data.images.filter(i=>i.record_id===r.record_id).map((i,n)=>`<a href="${escapeHtml(i.drive_url)}" target="_blank" rel="noopener">路線圖 ${n+1} ↗</a>`).join('');}
function status(r){return r.actual_end?'已下班':r.actual_start?'工作中':'尚未上班';}
function recordPending(id){return pending.filter(p=>p.record_id===id);}
function viewRecord(r){const result={...r};recordPending(r.record_id).forEach(p=>result['actual_'+p.field]=p.captured_at);return result;}
function clockButtons(r,admin){
  const v=viewRecord(r);
  return `<div class="actions">${['start','end'].map(k=>{
    const p=pending.find(p=>p.record_id===r.record_id&&p.field===k);
    const disabled=v['actual_'+k]||(k==='end'&&!v.actual_start);
    return `<button data-clock="${k}" data-record="${escapeHtml(r.record_id)}" ${disabled?'disabled':''}>${p?fieldLabel(k)+'待儲存':r['actual_'+k]?'已'+fieldLabel(k):(admin?'幫他':'')+fieldLabel(k)}</button>`;
  }).join('')}</div>`;
}
function auditHistory(r){
  return data.audit.filter(a=>a.record_id===r.record_id).map(a=>{
    const actor=data.workers.find(w=>w.worker_id===a.actor_id)?.name||a.actor_id;
    const label={actual_start:'實際上班',actual_end:'實際下班',planned_start:'預計上班'}[a.field]||a.field;
    return `<p class="muted">${escapeHtml(a.changed_at)} · ${escapeHtml(label)}<br>${escapeHtml(a.old_value||'空白')} → ${escapeHtml(a.new_value)}<br>${escapeHtml(a.kind)} · 操作人：${escapeHtml(actor)}${a.reason?'<br>原因：'+escapeHtml(a.reason):''}</p>`;
  }).join('')||'<p class="muted">尚無修改</p>';
}
function recordCard(r,admin=false,inHistory=false){
  const v=viewRecord(r),unconfirmed=recordPending(r.record_id).length;
  return `<div class="record" data-record-card="${escapeHtml(r.record_id)}"><div class="row"><strong>${escapeHtml(inHistory?r.date:admin?r.name:r.date)}</strong><span class="badge ${r.actual_start&&!r.actual_end?'working':''}">${status(r)}</span></div><p>預計 ${escapeHtml(r.planned_start||'未設定')} · 實際 ${time(v.actual_start)}～${time(v.actual_end)}${unconfirmed?'（待儲存）':''}</p><p>今日 ${duration(r.minutes)}${admin&&!inHistory?` · 本週 ${duration(data.weekly[r.worker_id]||0)}`:''}</p>${admin?`${clockButtons(r,true)}<div class="actions"><button class="secondary" data-manage="${escapeHtml(r.record_id)}" ${unconfirmed?'disabled':''}>補登／修改時間與資料</button>${inHistory?'':`<button class="secondary" data-history="${escapeHtml(r.worker_id)}">查看個人歷史</button>`}</div>`:''}<div class="links">${imageLinks(r)||'<span class="muted">尚未上傳路線圖</span>'}</div>${r.note?`<p>${escapeHtml(r.note)}</p>`:''}${admin?`<details><summary>時間修改歷程</summary>${auditHistory(r)}</details>`:''}</div>`;
}
function pendingView(){
  if(!pending.length)return '';
  return `<section class="card pending-panel"><h2>待儲存打卡 · ${pending.length} 筆</h2><p class="muted">已保留按下按鈕的時間，可繼續處理其他人。這些時間尚未確認存入 Google。</p>${pending.map(p=>{
    const r=data.records.find(r=>r.record_id===p.record_id);
    return `<div class="record"><strong>${escapeHtml(r?.name||'工作紀錄')} · ${escapeHtml(p.captured_at.slice(0,10))} ${time(p.captured_at)} ${fieldLabel(p.field)}</strong><p role="status">${p.state==='failed'?'尚未儲存：'+escapeHtml(p.error):p.state==='saving'?'儲存中…':'等候儲存…'}</p>${p.state==='failed'?`<div class="actions"><button data-retry="${escapeHtml(p.request_id)}">用原時間重試</button><button class="secondary" data-discard="${escapeHtml(p.request_id)}">取消待儲存項目</button></div>`:''}</div>`;
  }).join('')}</section>`;
}
function historyView(){
  if(!historyWorker)return '';
  const name=data.workers.find(w=>w.worker_id===historyWorker)?.name||'';
  return `<section id="history" class="card"><h2>${escapeHtml(name)}的歷史紀錄</h2>${data.records.filter(r=>r.worker_id===historyWorker).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>recordCard(r,true,true)).join('')||'<p class="muted">尚無紀錄。</p>'}</section>`;
}
function render(){
  document.querySelector('#logout').hidden=false;document.querySelector('#logout').disabled=busy||sending;
  const admin=data.user.role==='admin';
  app.innerHTML=`<section class="card intro"><small style="color:#c7ded3">${admin?'管理者工作台':'今天，也一步一步完成'}</small><h2 style="margin-top:10px">${escapeHtml(data.user.name)}</h2><div class="row"><span>${escapeHtml(selectedDate)} · ${admin?'人員出勤總覽':'我的工作紀錄'}</span><button class="secondary" id="refresh">重新整理</button></div></section>${pendingView()}${admin?adminView():workerView()}<section class="card"><details><summary>修改我的 PIN</summary><form id="change-pin"><label>目前 PIN<input name="old_pin" type="password" autocomplete="current-password" required></label><label>新 PIN<input name="new_pin" type="password" autocomplete="new-password" minlength="6" maxlength="100" required></label><button>更新 PIN</button></form></details></section>`;
  document.querySelector('#refresh').onclick=()=>run(refresh);
  document.querySelector('#change-pin').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('changePin',p);notice('PIN 已更新');});};
  bindForms(admin);
  if(busy)app.querySelectorAll('button').forEach(b=>b.disabled=true);
}
function workerView(){
  const r=data.records.find(r=>r.date===selectedDate),v=r&&viewRecord(r);
  return `<div class="columns"><section class="card"><h2>今日工作</h2>${!r?'<p class="muted">今天未排班，請聯絡管理者。</p>':`<label>預計上班</label><div class="value">${escapeHtml(r.planned_start||'未設定')}</div><div class="grid">${['start','end'].map(k=>`<div><div class="row"><label>實際${fieldLabel(k)}</label><button class="edit" data-edit="${k}" data-record="${escapeHtml(r.record_id)}" ${recordPending(r.record_id).length?'disabled':''}>編輯</button></div><div class="value">${time(v['actual_'+k])}</div></div>`).join('')}</div>${clockButtons(r,false)}<div class="grid stats"><div><label>今日工時</label><p class="stat">${duration(r.minutes)}</p>${r.actual_start&&!r.actual_end?'<small>工作中 · 下班後結算</small>':''}</div><div><label>本週工時</label><p class="stat">${duration(data.weekly[data.user.worker_id]||0)}</p><small>週一至週日</small></div></div><h3>今日路線圖 · ${data.images.filter(i=>i.record_id===r.record_id).length} 張</h3><div class="links">${imageLinks(r)}</div><label class="button secondary full" style="text-align:center">＋ 上傳路線截圖<input id="upload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><p class="muted">每張最多 5 MB，可一次選多張。</p><form id="note"><label>備註<textarea name="note" maxlength="2000">${escapeHtml(r.note)}</textarea></label><button class="secondary">儲存備註</button></form>`}</section><section class="card"><h2>我的紀錄</h2><p class="muted">最近 30 天 · 本週 ${duration(data.weekly[data.user.worker_id]||0)}</p>${recentDays(data.records)}</section></div>`;
}
function recentDays(records){return Array.from({length:30},(_,n)=>{const d=new Date(selectedDate+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()-n);const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(d);const r=records.find(r=>r.date===date);return r?recordCard(r):`<div class="record row"><span>${date}</span><span class="muted">未排班</span></div>`;}).join('');}
function adminView(){
  const workers=data.workers.filter(w=>w.role!=='admin');
  return `<section class="card" id="clock-section"><div class="row"><h2>上下班打卡</h2><span class="badge">管理者代打卡</span></div><p class="muted">每個人的上班、下班按鈕都在這裡。</p><label>打卡紀錄日期<input id="date" type="date" value="${selectedDate}"></label>${data.records.filter(r=>r.date===selectedDate).map(r=>recordCard(r,true)).join('')||'<p class="hint">這天尚未排班，請在下方設定排班；儲存後會直接顯示打卡按鈕。</p>'}</section>${historyView()}<section class="card"><h2>設定預計上班</h2>${workers.length?'':'<p class="hint">請先在下方新增工讀生，再設定排班。</p>'}<form id="schedule"><div class="grid"><label>日期<input type="date" name="date" value="${selectedDate}" required></label><label>工讀生<select name="worker_id" required>${workers.map(w=>`<option value="${escapeHtml(w.worker_id)}">${escapeHtml(w.name)}</option>`).join('')}</select></label></div><label>預計上班時間<input type="time" name="planned_start" required></label><button ${workers.length?'':'disabled'}>儲存排班</button></form></section><section class="card"><h2>人員歷史</h2><div class="actions">${workers.map(w=>`<button class="secondary" data-history="${escapeHtml(w.worker_id)}">${escapeHtml(w.name)}</button>`).join('')||'<span class="muted">尚無工讀生。</span>'}</div></section><section class="card"><h2>新增工讀生</h2><form id="create-worker"><label>姓名<input name="name" required maxlength="50" autocomplete="off"></label><label>個人 PIN<input name="pin" type="password" required minlength="6" maxlength="100" autocomplete="new-password"></label><button>建立帳號</button></form></section>`;
}
function bindForms(admin){
  if(admin){
    document.querySelector('#create-worker').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('createWorker',p);await refresh();notice('工讀生帳號已建立');});};
    document.querySelector('#date').onchange=e=>{selectedDate=e.target.value;run(refresh);};
    document.querySelector('#schedule').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{const result=await api('schedule',p);selectedDate=p.date;focusRecord=result.record_id;await refresh();notice('排班已儲存，可以直接按上班打卡');});};
  }else{
    const r=data.records.find(r=>r.date===selectedDate),note=document.querySelector('#note'),upload=document.querySelector('#upload');
    if(note)note.onsubmit=e=>saveNote(e,r);
    if(upload)upload.onchange=e=>uploadImages(e,r);
  }
}
function enqueueClock(record_id,field){
  const r=data.records.find(r=>r.record_id===record_id),v=r&&viewRecord(r);
  if(!r||v['actual_'+field]||(field==='end'&&!v.actual_start))return;
  if(field==='start'&&r.date!==today()){notice('其他日期請使用「補登／修改時間」填寫實際時間。');return;}
  const entry={record_id,field,captured_at:capturedTime(),request_id:crypto.randomUUID(),state:'queued'};
  pending.push(entry);
  try{persistPending();}catch(e){pending.pop();notice('無法保留待儲存打卡，請允許此網站使用本機儲存空間。');return;}
  render();pumpClocks();
}
async function pumpClocks(){
  if(sending)return;sending=true;render();
  try{
    while(token&&data){
      const entry=pending.find(p=>p.state==='queued'&&!(p.field==='end'&&pending.some(s=>s.record_id===p.record_id&&s.field==='start')));
      if(!entry)break;
      entry.state='saving';render();
      try{
        const result=await api('clock',{record_id:entry.record_id,field:entry.field,captured_at:entry.captured_at,request_id:entry.request_id});
        const index=data.records.findIndex(r=>r.record_id===entry.record_id);if(index>=0)data.records[index]=result.record;
        if(result.audit){data.audit=data.audit.filter(a=>a.record_id!==entry.record_id).concat(result.audit);}
        recalculateWeekly();pending=pending.filter(p=>p!==entry);persistPending();
        notice('已儲存 '+fieldLabel(entry.field)+' '+time(entry.captured_at));
      }catch(e){entry.state='failed';entry.error=e.name==='TimeoutError'?'連線逾時，請用原時間重試':e.message;try{persistPending();}catch{}notice('打卡尚未儲存，原時間已保留，請重試。');}
      render();
    }
  }finally{sending=false;if(data)render();}
}
function recalculateWeekly(){
  const monday=new Date(selectedDate+'T12:00:00+08:00');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const start=monday.toISOString().slice(0,10);monday.setUTCDate(monday.getUTCDate()+7);const end=monday.toISOString().slice(0,10);
  data.weekly={};data.records.filter(r=>r.date>=start&&r.date<end).forEach(r=>data.weekly[r.worker_id]=(data.weekly[r.worker_id]||0)+Number(r.minutes));
}
function openManagerEditor(record_id){
  const r=data.records.find(r=>r.record_id===record_id);if(!r||recordPending(record_id).length)return;
  editor.innerHTML=`<div class="row"><h2>${escapeHtml(r.name)} · ${escapeHtml(r.date)}</h2><button class="secondary" id="close-editor" type="button">關閉</button></div><form id="edit-times"><h3>補登／修改實際時間</h3><label>實際上班<input name="start" type="datetime-local" value="${escapeHtml(r.actual_start?.slice(0,16)||r.date+'T'+(r.planned_start||'18:30'))}" required></label><label>實際下班<input name="end" type="datetime-local" value="${escapeHtml(r.actual_end?.slice(0,16)||'')}" ${r.actual_end?'required':''}></label><label>修改原因（選填）<input name="reason" maxlength="500" placeholder="例如：忘記打卡，依現場時間補登"></label><button>儲存時間</button></form><h3>原始打卡時間</h3><p class="muted">上班：${escapeHtml(r.original_start||'尚無自動打卡')}<br>下班：${escapeHtml(r.original_end||'尚無自動打卡')}</p><h3>路線截圖</h3><div class="links">${imageLinks(r)||'<span class="muted">尚未上傳</span>'}</div><label class="button secondary">＋ 幫他上傳路線截圖<input id="admin-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><form id="admin-note"><h3>備註</h3><textarea name="note" maxlength="2000">${escapeHtml(r.note)}</textarea><button class="secondary">儲存備註</button></form><details><summary>時間修改歷程</summary>${auditHistory(r)}</details>`;
  editor.querySelector('#close-editor').onclick=()=>editor.close();
  editor.querySelector('#edit-times').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('editTimes',{record_id,...p});editor.close();await refresh();notice('時間已更新，今日與該週工時已重新計算');});};
  editor.querySelector('#admin-note').onsubmit=e=>saveNote(e,r);
  editor.querySelector('#admin-upload').onchange=e=>uploadImages(e,r);
  editor.querySelector('#edit-times').insertAdjacentHTML('beforebegin','<p id="editor-status" class="hint" role="status" hidden></p>');
  editor.showModal();
}
function saveNote(e,r){e.preventDefault();const note=e.target.elements.note.value;run(async()=>{await api('note',{record_id:r.record_id,note});await refresh();notice('備註已儲存');});}
function uploadImages(e,r){const files=[...e.target.files];run(async()=>{
  for(const f of files){
    if(f.size>5*1024*1024)throw Error('每張圖片最多 5 MB');
    if(!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('請選擇 JPG、PNG 或 WebP 圖片');
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});
    await api('upload',{record_id:r.record_id,mime:f.type,base64});
  }
  await refresh();if(editor.open){editor.close();openManagerEditor(r.record_id);}notice('路線圖已上傳');
});}
app.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;
  if(b.dataset.clock)enqueueClock(b.dataset.record,b.dataset.clock);
  if(b.dataset.manage)openManagerEditor(b.dataset.manage);
  if(b.dataset.history){historyWorker=b.dataset.history;render();document.querySelector('#history')?.scrollIntoView({behavior:'smooth'});}
  if(b.dataset.edit){
    const r=data.records.find(r=>r.record_id===b.dataset.record),field=b.dataset.edit;
    const value=prompt('輸入實際日期時間（YYYY-MM-DDTHH:mm），跨午夜請填下一天日期。',r['actual_'+field]?.slice(0,16)||`${r.date}T18:30`);
    if(value!==null)run(async()=>{await api('edit',{record_id:r.record_id,field,value});await refresh();notice('時間已更新，工時已重新計算');});
  }
  if(b.dataset.retry){const p=pending.find(p=>p.request_id===b.dataset.retry);p.state='queued';delete p.error;try{persistPending();render();pumpClocks();}catch(e){p.state='failed';notice(e.message);}}
  if(b.dataset.discard&&confirm('只取消這台裝置的待儲存項目；已存入 Google 的打卡不會刪除。確定取消？')){
    const p=pending.find(p=>p.request_id===b.dataset.discard);
    pending=pending.filter(x=>x!==p&&!(p.field==='start'&&x.record_id===p.record_id&&x.field==='end'));
    try{persistPending();render();run(refresh);}catch(e){notice(e.message);}
  }
});
document.querySelector('#logout').onclick=()=>{
  if(sending||busy)return;
  if(pending.length&&!confirm('仍有打卡尚未儲存。登出後會保留在這台裝置，下次登入同一帳號可重試。確定登出？'))return;
  token='';data=null;pending=[];pendingUser='';historyWorker='';editor.close();sessionStorage.removeItem('flyerToken');login();
};
if(token)run(refresh);else login();
