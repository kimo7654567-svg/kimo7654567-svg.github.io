const app = document.querySelector('#app');
const editor = document.querySelector('#record-editor');
const pageType = document.body.dataset.page || 'clock';
const params = new URLSearchParams(location.search);
const shiftDate = (date,n) => {const d=new Date(date+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
const capturedTime = () => new Date(Date.now()+8*3600000).toISOString().slice(0,19)+'+08:00';
const duration = n => `${Math.floor(n/60)} 小時 ${n%60} 分`;
const time = v => v ? v.slice(11,16) : '--:--';
const fieldLabel = k => k==='start'?'上班':'下班';
let token = sessionStorage.getItem('flyerToken') || '', data, selectedDate = params.get('date') || today(), busy = false;
let pending = [], pendingUser = '', sending = false, historyWorker = params.get('worker_id') || 'all', focusRecord = params.get('focus') || '';
let historyFrom=shiftDate(today(),-29),historyTo=today(),historyOffset=0;
function viewParams(){return pageType==='clock'?{action:'home',date:selectedDate}:pageType==='history'?{action:'history',from:historyFrom,to:historyTo,worker_id:historyWorker,date:selectedDate,offset:historyOffset}:{action:'directory'};}
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
  document.querySelector('#login').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));run(async()=>{const q=viewParams(),view=q.action;delete q.action;const r=await api('login',{...values,...q,view});token=r.token;sessionStorage.setItem('flyerToken',token);if(r.initial){data=r.initial;loadPending();}else await refresh();});};
}
async function refresh(append=false){const q=viewParams(),action=q.action;delete q.action;const previous=append&&data?data.records:[];data=await api(action,q);if(append)data.records=previous.concat(data.records);loadPending();render();}
function imageLinks(r){return data.images.filter(i=>i.record_id===r.record_id).map((i,n)=>`<a href="${escapeHtml(i.drive_url)}" target="_blank" rel="noopener">路線圖 ${n+1} ↗</a>`).join('');}
function status(r){return r.actual_end?'已下班':r.actual_start?'工作中':'尚未上班';}
function recordPending(id){return pending.filter(p=>p.record_id===id);}
function viewRecord(r){const result={...r};recordPending(r.record_id).forEach(p=>result['actual_'+p.field]=p.captured_at);return result;}
function clockButtons(r,admin){
  const v=viewRecord(r);
  return `<div class="actions">${['start','end'].map(k=>{
    const p=pending.find(p=>p.record_id===r.record_id&&p.field===k);
    const disabled=!!p||(k==='end'&&!v.actual_start)||(r['actual_'+k]&&recordPending(r.record_id).length);
    return `<button data-clock="${k}" data-record="${escapeHtml(r.record_id)}" ${disabled?'disabled':''}>${p?fieldLabel(k)+'待儲存':r['actual_'+k]?fieldLabel(k)+' '+time(r['actual_'+k])+' ✎':(admin?'幫他':'')+fieldLabel(k)}</button>`;
  }).join('')}</div>`;
}
function auditHistory(r){
  return data.audit.filter(a=>a.record_id===r.record_id).map(a=>{
    const actor=data.workers.find(w=>w.worker_id===a.actor_id)?.name||a.actor_id;
    const label={actual_start:'實際上班',actual_end:'實際下班',planned_start:'預計上班'}[a.field]||a.field;
    return `<p class="muted">${escapeHtml(a.changed_at)} · ${escapeHtml(label)}<br>${escapeHtml(a.old_value||'空白')} → ${escapeHtml(a.new_value)}<br>${escapeHtml(a.kind)} · 操作人：${escapeHtml(actor)}${a.reason?'<br>原因：'+escapeHtml(a.reason):''}</p>`;
  }).join('')||'<p class="muted">尚無修改</p>';
}
function pendingView(){
  if(!pending.length)return '';
  return `<section class="card pending-panel"><h2>待儲存打卡 · ${pending.length} 筆</h2><p class="muted">已保留選定的時間，可繼續處理其他人。這些時間尚未確認存入 Google。</p>${pending.map(p=>{
    const r=data.records.find(r=>r.record_id===p.record_id);
    return `<div class="record"><strong>${escapeHtml(r?.name||p.name||'工作紀錄')} · ${escapeHtml(p.captured_at.slice(0,10))} ${time(p.captured_at)} ${fieldLabel(p.field)}</strong><p role="status">${p.state==='failed'?'尚未儲存：'+escapeHtml(p.error):p.state==='saving'?'儲存中…':'等候儲存…'}</p>${p.state==='failed'?`<div class="actions"><button data-retry="${escapeHtml(p.request_id)}">用原時間重試</button><button class="secondary" data-discard="${escapeHtml(p.request_id)}">取消待儲存項目</button></div>`:''}</div>`;
  }).join('')}</section>`;
}
function navigation(){
  const admin=data.user.role==='admin';
  const links=admin?[['clock','index.html','打卡'],['schedule','schedule.html','排班'],['history','history.html','紀錄'],['workers','workers.html','人員']]:[['clock','index.html','打卡'],['history','history.html','紀錄'],['workers','workers.html','我的']];
  const icons={clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',schedule:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/>',history:'<path d="M6 5h12M6 10h12M6 15h8M6 20h10"/>',workers:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'};
  return `<nav class="bottom-nav" aria-label="功能選單">${links.map(([key,href,label])=>`<a href="${href}" ${pageType===key?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg><span>${label}</span></a>`).join('')}</nav>`;
}
function personOptions(selected='all'){
  return `<option value="all" ${selected==='all'?'selected':''}>全部（All）</option>${data.workers.filter(w=>w.role!=='admin').map(w=>`<option value="${escapeHtml(w.worker_id)}" ${selected===w.worker_id?'selected':''}>${escapeHtml(w.name)}</option>`).join('')}`;
}
function recordCard(r,admin=false,inHistory=false){
  const v=viewRecord(r),unconfirmed=recordPending(r.record_id).length;
  return `<article class="record work-card" data-record-card="${escapeHtml(r.record_id)}"><div class="row"><div><span class="eyebrow">${escapeHtml(r.date)}</span><h3>${escapeHtml(r.name)}</h3></div><span class="badge ${r.actual_start&&!r.actual_end?'working':''}">${status(r)}</span></div><p class="planned">預計上班 <strong>${escapeHtml(r.planned_start||'未設定')}</strong></p><div class="time-grid"><div><span>實際上班</span><strong>${time(v.actual_start)}</strong></div><div><span>實際下班</span><strong>${time(v.actual_end)}</strong></div></div>${unconfirmed?'<p class="muted">選定時間待儲存</p>':''}${clockButtons(r,admin)}<div class="work-stats"><span>今日 <strong>${duration(Number(r.minutes))}</strong></span>${inHistory?'':`<span>本週 <strong>${duration(data.weekly[r.worker_id]||0)}</strong></span>`}</div><button class="text-button" data-manage="${escapeHtml(r.record_id)}" ${unconfirmed?'disabled':''}>${admin?'補登・路線・工作資料':'路線截圖・備註'} <span aria-hidden="true">↗</span></button></article>`;
}
function clockView(){
  const admin=data.user.role==='admin';
  return `<section id="clock-section"><div class="date-bar"><label>工作日期<input id="date" type="date" value="${selectedDate}"></label><span class="muted">${data.records.length} 筆工作</span></div><div class="work-list">${data.records.map(r=>recordCard(r,admin)).join('')||`<section class="empty-state"><h3>這天還沒有排班</h3><p>${admin?'先安排人員與上班時間，就能在這裡打卡。':'請聯絡管理者安排工作。'}</p>${admin?`<a class="button" href="schedule.html?date=${selectedDate}">安排排班</a>`:''}</section>`}</div></section>`;
}
function scheduleView(){
  if(data.user.role!=='admin')return '<section class="empty-state">排班由管理者設定。<a href="index.html">返回打卡</a></section>';
  const workers=data.workers.filter(w=>w.role!=='admin');
  return `<section class="card"><h3>安排一個工作日</h3>${workers.length?'':'<p class="hint">先到「人員」新增工讀生，再安排排班。</p>'}<form id="schedule"><label>工讀生<select name="worker_id" required>${workers.map(w=>`<option value="${escapeHtml(w.worker_id)}">${escapeHtml(w.name)}</option>`).join('')}</select></label><div class="grid"><label>日期<input type="date" name="date" value="${selectedDate}" required></label><label>預計上班<input type="time" name="planned_start" required></label></div><button class="full" ${workers.length?'':'disabled'}>確認排班</button></form></section><p class="footnote">儲存後會直接進入該人員的打卡畫面。</p>`;
}
function historyView(){
  const admin=data.user.role==='admin';
  return `<section class="card filters"><form id="history-filter">${admin?`<label>工作人員<select id="history-worker" name="worker_id">${personOptions(historyWorker)}</select></label>`:''}<div class="grid"><label>開始日期<input name="from" type="date" value="${historyFrom}" required></label><label>結束日期<input name="to" type="date" value="${historyTo}" required></label></div><button class="full">確認查詢</button></form></section><div class="section-caption"><span>查詢結果</span><span>${data.total||0} 筆</span></div><section id="history" class="work-list">${data.records.map(r=>recordCard(r,admin,true)).join('')||'<div class="empty-state"><h3>這段期間沒有紀錄</h3><p>試著調整人員或日期範圍。</p></div>'}</section>${data.next_offset!==null&&data.next_offset!==undefined?'<button id="load-more" class="secondary full">載入更多紀錄</button>':''}`;
}
function accountView(){return `<section class="card"><h3>我的登入資訊</h3><p class="muted">${escapeHtml(data.user.name)}</p><form id="change-pin"><label>目前 PIN<input name="old_pin" type="password" autocomplete="current-password" required></label><label>新 PIN<input name="new_pin" type="password" autocomplete="new-password" minlength="6" maxlength="100" required></label><button>確認更新 PIN</button></form></section>`;}
function workersView(){
  if(data.user.role!=='admin')return accountView();
  const workers=data.workers.filter(w=>w.role!=='admin');
  return `<section class="card"><h3>工作人員</h3>${workers.map(w=>`<div class="person-row"><span>${escapeHtml(w.name)}</span><a href="history.html?worker_id=${encodeURIComponent(w.worker_id)}">查看紀錄 ↗</a></div>`).join('')||'<p class="muted">尚未新增工讀生。</p>'}</section><section class="card"><h3>新增工讀生</h3><form id="create-worker"><label>姓名<input name="name" required maxlength="50" autocomplete="off"></label><label>個人 PIN<input name="pin" type="password" required minlength="6" maxlength="100" autocomplete="new-password"></label><button>確認新增</button></form></section>${accountView()}`;
}
function render(){
  document.querySelector('#logout').hidden=false;document.querySelector('#logout').disabled=busy||sending;
  const titles={clock:'上下班打卡',schedule:'安排排班',history:'歷史紀錄',workers:data.user.role==='admin'?'工作人員':'我的帳號'};
  const subtitles={clock:'選擇時間，確認後送出。',schedule:'每個人的步調，安排清楚。',history:'選擇人員與日期，查看工作紀錄。',workers:'人員與登入資訊。'};
  app.innerHTML=`<div class="page-heading"><span class="eyebrow">${escapeHtml(data.user.name)}${data.user.name==='管理者'?'':data.user.role==='admin'?' · 管理者':' · 工讀生'}</span><div class="row"><h2>${titles[pageType]}</h2><button class="text-button" id="refresh" aria-label="重新整理">重新整理 ↻</button></div><p class="muted">${subtitles[pageType]}</p></div>${pendingView()}${pageType==='clock'?clockView():pageType==='schedule'?scheduleView():pageType==='history'?historyView():workersView()}${navigation()}`;
  document.querySelector('#refresh').onclick=()=>run(refresh);
  const changePin=document.querySelector('#change-pin');if(changePin)changePin.onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('changePin',p);notice('PIN 已更新');});};
  bindForms();if(busy)app.querySelectorAll('button').forEach(b=>b.disabled=true);
}
function bindForms(){
  const schedule=document.querySelector('#schedule');if(schedule)schedule.onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{const result=await api('schedule',p);location.href='index.html?date='+encodeURIComponent(p.date)+'&focus='+encodeURIComponent(result.record_id);});};
  const create=document.querySelector('#create-worker');if(create)create.onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('createWorker',p);await refresh();notice('工讀生帳號已建立');});};
  const date=document.querySelector('#date');if(date)date.onchange=e=>{selectedDate=e.target.value;run(refresh);};
  const filter=document.querySelector('#history-filter');if(filter){filter.onsubmit=e=>{e.preventDefault();historyFrom=filter.elements.from.value;historyTo=filter.elements.to.value;historyWorker=filter.elements.worker_id?.value||'all';historyOffset=0;run(refresh);};const person=filter.elements.worker_id;if(person)person.onchange=()=>filter.requestSubmit();}
  const more=document.querySelector('#load-more');if(more)more.onclick=()=>{historyOffset=data.next_offset;run(()=>refresh(true));};
}

function enqueueClock(record_id,field,chosenTime){
  const r=data.records.find(r=>r.record_id===record_id),v=r&&viewRecord(r);
  if(!r||v['actual_'+field]||(field==='end'&&!v.actual_start))return;
  const entry={record_id,name:r.name,field,captured_at:chosenTime||capturedTime(),request_id:crypto.randomUUID(),state:'queued'};
  pending.push(entry);
  try{persistPending();}catch(e){pending.pop();notice('無法保留待儲存打卡，請允許此網站使用本機儲存空間。');return;}
  render();pumpClocks();
}
function openClockEditor(record_id,field){
  const r=data.records.find(r=>r.record_id===record_id);if(!r||pending.some(p=>p.record_id===record_id&&p.field===field))return;
  const existing=r['actual_'+field],v=viewRecord(r),now=capturedTime();
  if(field==='end'&&!v.actual_start){notice('請先設定上班時間');return;}
  const defaultDate=existing?.slice(0,10)||(field==='end'&&pageType==='clock'&&selectedDate===today()?today():r.date);
  const defaultTime=existing?.slice(11,16)||(defaultDate===today()?now.slice(11,16):field==='start'?r.planned_start||'18:30':v.actual_start?.slice(11,16)||'21:00');
  editor.innerHTML=`<h2>${escapeHtml(r.name)} · ${existing?'修改':'確認'}${fieldLabel(field)}時間</h2><p class="muted">選好日期與時間後，按下確認才會儲存。</p><p id="editor-status" class="hint" role="status" hidden></p><form id="confirm-clock"><label>日期<input name="date" type="date" value="${escapeHtml(defaultDate)}" required ${field==='start'?'readonly':''}></label><label>${fieldLabel(field)}時間<input name="time" type="time" value="${escapeHtml(defaultTime)}" required></label><p id="clock-preview" class="hint" aria-live="polite"></p><div class="actions"><button type="button" class="secondary" id="cancel-clock">取消</button><button type="submit">${existing?'確認修改':'確認'+fieldLabel(field)}</button></div></form>`;
  const form=editor.querySelector('#confirm-clock');
  const preview=()=>editor.querySelector('#clock-preview').textContent=`${r.name} · ${form.elements.date.value} ${form.elements.time.value} ${fieldLabel(field)}`;
  form.oninput=preview;preview();editor.querySelector('#cancel-clock').onclick=()=>editor.close();
  form.onsubmit=e=>{
    e.preventDefault();if(busy)return;
    const value=form.elements.date.value+'T'+form.elements.time.value,chosen=value+':00+08:00';
    if(Date.parse(chosen)>Date.now()){notice('請選擇現在或過去的實際時間');return;}
    const next={...v,['actual_'+field]:chosen};
    if(next.actual_start&&next.actual_end){const diff=Date.parse(next.actual_end)-Date.parse(next.actual_start);if(diff<0||diff>24*3600000){notice('下班必須在上班之後，且單次工時不超過 24 小時');return;}}
    if(existing){run(async()=>{await api('edit',{record_id,field,value,summary_date:selectedDate});editor.close();await refresh();notice('時間已修改，工時已重新計算');});}
    else{editor.close();enqueueClock(record_id,field,chosen);}
  };
  editor.showModal();
}
async function pumpClocks(){
  if(sending)return;sending=true;render();
  try{
    while(token&&data){
      const entry=pending.find(p=>p.state==='queued'&&!(p.field==='end'&&pending.some(s=>s.record_id===p.record_id&&s.field==='start')));
      if(!entry)break;
      entry.state='saving';render();
      try{
        const result=await api('clock',{record_id:entry.record_id,field:entry.field,captured_at:entry.captured_at,request_id:entry.request_id,summary_date:selectedDate});
        const index=data.records.findIndex(r=>r.record_id===entry.record_id);if(index>=0)data.records[index]=result.record;
        if(result.audit){data.audit=data.audit.filter(a=>a.record_id!==entry.record_id).concat(result.audit);}
        data.weekly[result.record.worker_id]=result.weekly_minutes;pending=pending.filter(p=>p!==entry);persistPending();
        notice('已儲存 '+fieldLabel(entry.field)+' '+time(entry.captured_at));
      }catch(e){entry.state='failed';entry.error=e.name==='TimeoutError'?'連線逾時，請用原時間重試':e.message;try{persistPending();}catch{}notice('打卡尚未儲存，原時間已保留，請重試。');}
      render();
    }
  }finally{sending=false;if(data)render();}
}
async function loadDetails(record_id){const detail=await api('recordDetails',{record_id});const i=data.records.findIndex(r=>r.record_id===record_id);if(i<0)data.records.push(detail.record);else data.records[i]=detail.record;data.images=data.images.filter(i=>i.record_id!==record_id).concat(detail.images);data.audit=data.audit.filter(a=>a.record_id!==record_id).concat(detail.audit);openManagerEditor(record_id);}
function openManagerEditor(record_id){
  const r=data.records.find(r=>r.record_id===record_id);if(!r||recordPending(record_id).length)return;
  editor.innerHTML=`<div class="row"><h2>${escapeHtml(r.name)} · ${escapeHtml(r.date)}</h2><button class="secondary" id="close-editor" type="button">關閉</button></div><form id="edit-times"><h3>補登／修改實際時間</h3><label>實際上班<input name="start" type="datetime-local" value="${escapeHtml(r.actual_start?.slice(0,16)||r.date+'T'+(r.planned_start||'18:30'))}" required></label><label>實際下班<input name="end" type="datetime-local" value="${escapeHtml(r.actual_end?.slice(0,16)||'')}" ${r.actual_end?'required':''}></label><label>修改原因（選填）<input name="reason" maxlength="500" placeholder="例如：忘記打卡，依現場時間補登"></label><button>確認儲存時間</button></form><h3>原始打卡時間</h3><p class="muted">上班：${escapeHtml(r.original_start||'尚無自動打卡')}<br>下班：${escapeHtml(r.original_end||'尚無自動打卡')}</p><h3>路線截圖</h3><div class="links">${imageLinks(r)||'<span class="muted">尚未上傳</span>'}</div><label class="button secondary">＋ 上傳路線截圖<input id="admin-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><form id="admin-note"><h3>備註</h3><textarea name="note" maxlength="2000">${escapeHtml(r.note)}</textarea><button class="secondary">儲存備註</button></form><details><summary>時間修改歷程</summary>${auditHistory(r)}</details>`;
  editor.querySelector('#close-editor').onclick=()=>editor.close();
  editor.querySelector('#edit-times').onsubmit=e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));run(async()=>{await api('editTimes',{record_id,...p});editor.close();await refresh();notice('時間已更新，今日與該週工時已重新計算');});};
  editor.querySelector('#admin-note').onsubmit=e=>saveNote(e,r);
  editor.querySelector('#admin-upload').onchange=e=>uploadImages(e,r);
  if(data.user.role!=='admin'){editor.querySelector('#edit-times').hidden=true;editor.querySelector('details').hidden=true;}
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
  await refresh();if(editor.open){editor.close();await loadDetails(r.record_id);}notice('路線圖已上傳');
});}
app.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;
  if(b.dataset.clock)openClockEditor(b.dataset.record,b.dataset.clock);
  if(b.dataset.manage)run(()=>loadDetails(b.dataset.manage));

  if(b.dataset.edit){
    openClockEditor(b.dataset.record,b.dataset.edit);
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
if(token){app.innerHTML='<div class="loading-state" role="status"><h2>正在準備工作紀錄</h2><p>稍等片刻…</p></div>';run(refresh);}else login();
