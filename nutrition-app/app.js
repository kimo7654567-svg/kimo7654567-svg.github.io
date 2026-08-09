const $ = selector => document.querySelector(selector);
const state = { members: [], active: null, profile: null, files: [], analysis: null };
const avatarIds = ['adult-1', 'adult-2', 'child-1', 'child-2'];
const nutrientLabels = { calories: '熱量 kcal', protein_g: '蛋白質 g', fat_g: '脂肪 g', carbohydrate_g: '碳水 g', fiber_g: '纖維 g', sodium_mg: '鈉 mg', calcium_mg: '鈣 mg', iron_mg: '鐵 mg', zinc_mg: '鋅 mg', vitamin_a_ug: '維生素 A μg', vitamin_c_mg: '維生素 C mg', vitamin_d_ug: '維生素 D μg', omega3_mg: 'Omega-3 mg' };

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const avatarUrl = id => `avatars/${id}.svg`;
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2800);
}

async function loadMembers() {
  try {
    state.members = await callApi('list_members');
    renderMembers();
  } catch (error) {
    renderMembers();
    toast(error.message);
  }
}

function renderMembers() {
  $('#members').innerHTML = state.members.map(member => `<button class="member" data-id="${member.member_id}"><img src="${avatarUrl(member.avatar_id)}" alt=""><b>${escapeHtml(member.name)}</b><small>${member.is_child ? '兒童' : '成人'}</small></button>`).join('');
  document.querySelectorAll('.member').forEach(button => button.onclick = () => selectMember(button.dataset.id));
}

async function selectMember(memberId) {
  state.active = state.members.find(member => member.member_id === memberId);
  try {
    state.profile = await callApi('get_profile', { memberId });
  } catch (error) {
    toast(error.message);
    return;
  }
  $('#membersView').classList.add('hidden');
  $('#homeView').classList.remove('hidden');
  $('#activeAvatar').src = avatarUrl(state.active.avatar_id);
  $('#activeName').textContent = state.active.name;
  $('#activeMode').textContent = state.active.is_child ? '兒童模式' : '成人模式';
  $('#historyDate').value = today();
  await refreshHome();
}

async function refreshHome() {
  await Promise.allSettled([loadDailySummary(), loadMeals()]);
}

async function loadDailySummary() {
  try {
    const summary = await callApi('daily_summary', { memberId: state.active.member_id, date: today() });
    $('#calories').textContent = Math.round(summary.calories);
    $('#protein').textContent = Math.round(summary.protein_g);
    $('#vegetables').textContent = Number(summary.vegetable_serving).toFixed(1);
    $('#feedback').textContent = summary.feedback;
  } catch (error) {
    $('#feedback').textContent = error.message;
  }
}

async function loadMeals() {
  try {
    const meals = await callApi('get_meals', { memberId: state.active.member_id, date: $('#historyDate').value || today() });
    $('#mealList').innerHTML = meals.length ? meals.map(food => `<div class="food-row"><span>${escapeHtml(food.food_name)}</span><b>${Math.round(Number(food.estimated_weight_g))} g</b></div>`).join('') : '<p class="muted">今天還沒有紀錄。</p>';
  } catch (error) {
    $('#mealList').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function openMemberDialog(profile = null) {
  const form = $('#memberForm');
  form.reset();
  form.elements.namedItem('member_id').value = profile ? profile.member_id : '';
  $('#memberFormStatus').textContent = '';
  if (profile) {
    ['name', 'birthday', 'sex', 'height_cm', 'weight_kg', 'activity_level', 'usual_daily_steps', 'goal', 'allergy'].forEach(key => {
      if (form.elements[key]) form.elements[key].value = profile[key] ?? '';
    });
    form.querySelector(`[name=is_child][value="${Boolean(profile.is_child)}"]`).checked = true;
  }
  renderAvatarOptions(profile ? profile.avatar_id : 'adult-1');
  toggleChildFields();
  $('#memberDialog').showModal();
}

function renderAvatarOptions(selected) {
  $('#avatars').innerHTML = avatarIds.map(id => `<label><input type="radio" name="avatar_id" value="${id}" ${id === selected ? 'checked' : ''}><img src="${avatarUrl(id)}" alt="人像"></label>`).join('');
}

function toggleChildFields() {
  const child = $('#memberForm [name=is_child]:checked').value === 'true';
  $('#goalRow').classList.toggle('hidden', child);
}

$('#memberForm').onsubmit = async event => {
  event.preventDefault();
  const submitButton = $('#memberSubmitBtn');
  const status = $('#memberFormStatus');
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const profile = {
    name: values.name, birthday: values.birthday, sex: values.sex,
    height_cm: Number(values.height_cm), weight_kg: Number(values.weight_kg),
    activity_level: values.activity_level, is_child: values.is_child === 'true',
    usual_daily_steps: values.usual_daily_steps ? Number(values.usual_daily_steps) : null,
    goal: values.is_child === 'true' ? null : values.goal,
    allergy: values.allergy || '', avatar_id: values.avatar_id,
  };
  const memberId = values.member_id;
  try {
    submitButton.disabled = true;
    submitButton.textContent = memberId ? '儲存中…' : '建立中…';
    status.textContent = memberId
      ? '正在儲存個人資料…'
      : '正在建立個人資料與專屬 Google Sheet，第一次可能需要 10～20 秒，請稍候。';
    const created = memberId
      ? await callApi('update_profile', { memberId, profile })
      : await callApi('create_member', { profile });
    $('#memberDialog').close();
    await loadMembers();
    await selectMember(created.member_id);
    toast(memberId ? '個人資料已更新' : '家庭成員已建立');
  } catch (error) {
    status.textContent = `儲存失敗：${error.message}`;
    toast(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '儲存';
  }
};

function openPhotoDialog() {
  state.manualEntry = false;
  state.files = [];
  state.analysis = null;
  $('#captureStep').classList.remove('hidden');
  $('#reviewStep').classList.add('hidden');
  $('#photoDialogTitle').textContent = '新增餐點';
  $('#reviewNotice').textContent = '以下皆為照片估算值。請確認並修改後再保存。';
  $('#addManualFoodBtn').classList.add('hidden');
  if ($('#manualMealTypeRow')) $('#manualMealTypeRow').classList.add('hidden');
  $('#photos').value = '';
  renderPreviews();
  $('#photoDialog').showModal();
}

function emptyManualFood() {
  return {
    name: '', quantity: 1, estimated_total_weight_g: 100, confidence: 1,
    nutrients: Object.fromEntries(Object.keys(nutrientLabels).map(key => [key, 0])),
    vegetable_serving: 0, fruit_serving: 0, dairy_serving: 0,
    note: '手動紀錄', observed_in_images: [],
  };
}

function openManualEntry() {
  state.manualEntry = true;
  state.files = [];
  state.analysis = { foods: [emptyManualFood()] };
  $('#captureStep').classList.add('hidden');
  $('#reviewStep').classList.remove('hidden');
  $('#photoDialogTitle').textContent = '手動新增餐點';
  $('#reviewNotice').textContent = '請輸入食物名稱與重量；未填寫的營養項目會記為 0。';
  if (!$('#manualMealTypeRow')) {
    $('#reviewNotice').insertAdjacentHTML('beforebegin', '<label id="manualMealTypeRow">餐別<select id="manualMealType"><option value="breakfast">早餐</option><option value="brunch">早午餐</option><option value="lunch">午餐</option><option value="dinner">晚餐</option><option value="snack">點心</option></select></label>');
  }
  $('#manualMealTypeRow').classList.remove('hidden');
  $('#addManualFoodBtn').classList.remove('hidden');
  renderFoodEditor();
  $('#photoDialog').showModal();
}

function addFiles(fileList) {
  const accepted = [...fileList].filter(file => /^image\/(jpeg|png|webp)$/.test(file.type));
  const available = 6 - state.files.length;
  state.files.push(...accepted.slice(0, available));
  if (accepted.length > available) toast('每餐最多六張照片');
  renderPreviews();
}

function renderPreviews() {
  $('#photoCount').textContent = `已選 ${state.files.length} / 6 張`;
  $('#previews').innerHTML = state.files.map((file, index) => `<div class="preview"><img src="${URL.createObjectURL(file)}" alt="照片 ${index + 1}"><button data-index="${index}">×</button></div>`).join('');
  document.querySelectorAll('.preview button').forEach(button => button.onclick = () => {
    state.files.splice(Number(button.dataset.index), 1);
    renderPreviews();
  });
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
}

async function analyzePhotos() {
  if (!state.files.length) return toast('請先拍攝或選擇至少一張照片');
  const button = $('#analyzeBtn');
  button.disabled = true;
  button.textContent = '壓縮並分析中…';
  try {
    const images = [];
    for (const file of state.files) images.push(await compressImage(file));
    state.analysis = await callApi('analyze_food', { images });
    if (!state.analysis.is_food_image) {
      toast(state.analysis.reason || '無法可靠辨識食物');
      return;
    }
    renderFoodEditor();
    $('#captureStep').classList.add('hidden');
    $('#reviewStep').classList.remove('hidden');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = '分析這一餐'; }
}

function renderFoodEditor() {
  $('#foodEditor').innerHTML = state.analysis.foods.map((food, index) => `<div class="food-card" data-index="${index}"><div class="dialog-head"><b>食物 ${index + 1}</b>${state.analysis.foods.length > 1 ? `<button type="button" class="remove-food" data-remove="${index}">刪除</button>` : ''}</div><label>食物名稱<input data-key="name" maxlength="100" required value="${escapeHtml(food.name)}"></label><div class="two"><label>數量<input type="number" min="1" data-key="quantity" value="${food.quantity}"></label><label>合計重量 g<input type="number" min="0.1" step="0.1" data-key="estimated_total_weight_g" value="${food.estimated_total_weight_g}"></label></div>${food.observed_in_images && food.observed_in_images.length ? `<small class="muted">出現在照片 ${food.observed_in_images.join('、')}；只計算一次</small>` : ''}<div class="food-grid">${Object.entries(nutrientLabels).map(([key, label]) => `<label>${label}<input type="number" min="0" step="0.1" data-nutrient="${key}" value="${food.nutrients[key] ?? 0}"></label>`).join('')}</div><div class="food-grid"><label>蔬菜份<input type="number" min="0" step="0.5" data-key="vegetable_serving" value="${food.vegetable_serving || 0}"></label><label>水果份<input type="number" min="0" step="0.5" data-key="fruit_serving" value="${food.fruit_serving || 0}"></label><label>乳品份<input type="number" min="0" step="0.5" data-key="dairy_serving" value="${food.dairy_serving || 0}"></label></div><label>備註<input data-key="note" value="${escapeHtml(food.note || '')}"></label></div>`).join('');
  document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    state.analysis.foods.splice(Number(button.dataset.remove), 1);
    renderFoodEditor();
  });
}

function editedFoods() {
  return [...document.querySelectorAll('.food-card')].map((card, index) => {
    const food = structuredClone(state.analysis.foods[index]);
    card.querySelectorAll('[data-key]').forEach(input => food[input.dataset.key] = input.type === 'number' ? Number(input.value) : input.value);
    card.querySelectorAll('[data-nutrient]').forEach(input => food.nutrients[input.dataset.nutrient] = Number(input.value));
    return food;
  });
}

async function saveMeal() {
  try {
    if (editedFoods().some(food => !String(food.name).trim())) throw new Error('請填寫每一項食物名稱');
    await callApi('save_meal', { memberId: state.active.member_id, meal: { date: today(), time: new Date().toTimeString().slice(0, 5), meal_type: state.manualEntry ? $('#manualMealType').value : $('#mealType').value, foods: editedFoods() } });
    state.files = [];
    state.analysis = null;
    $('#previews').innerHTML = '';
    $('#photoDialog').close();
    await refreshHome();
    toast('已保存文字紀錄，照片未保存');
  } catch (error) { toast(error.message); }
}

async function showAdvice() {
  showInfo('飲食建議', '<p>正在整理今日與七日紀錄…</p>');
  try {
    const advice = await callApi('nutrition_advice', { memberId: state.active.member_id, date: today() });
    $('#infoBody').innerHTML = `<p>${escapeHtml(advice.data_quality)}</p><h3>做得好的地方</h3>${renderList(advice.strengths)}<h3>紀錄中較少的來源</h3>${renderList(advice.lower_recorded_sources)}<h3>自己做</h3>${renderList(advice.home_cooking)}<h3>外食方便買</h3>${renderList(advice.eating_out)}<p class="muted">${escapeHtml(advice.caution)}</p>`;
  } catch (error) { $('#infoBody').textContent = error.message; }
}

async function showWeekly() {
  const now = new Date();
  const start = new Date(now.getTime() - 6 * 86400000).toLocaleDateString('en-CA');
  showInfo('七日報告', '<p>載入中…</p>');
  try {
    const report = await callApi('weekly_summary', { memberId: state.active.member_id, weekStart: start });
    $('#infoBody').innerHTML = `<p>${escapeHtml(report.feedback)}</p><p>有紀錄日：<b>${report.recorded_days}</b> 天</p><p>平均蛋白質：<b>${report.average_protein_g}</b> g</p><p>平均纖維：<b>${report.average_fiber_g}</b> g</p><p>平均鈣：<b>${report.average_calcium_mg}</b> mg</p><p>平均鐵：<b>${report.average_iron_mg}</b> mg</p><p>平均蔬菜：<b>${report.average_vegetable_serving}</b> 份</p>`;
  } catch (error) { $('#infoBody').textContent = error.message; }
}

function openDailyLog() {
  showInfo('飲水／體重（選填）', '<form id="dailyLogForm"><label>飲水 ml<input name="water_ml" type="number" min="0" max="20000"></label><label>體重 kg<input name="weight_kg" type="number" min="1" max="500" step="0.1"></label><button class="primary">儲存</button></form>');
  $('#dailyLogForm').onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await callApi('save_daily_log', { memberId: state.active.member_id, log: { date: today(), water_ml: values.water_ml ? Number(values.water_ml) : null, weight_kg: values.weight_kg ? Number(values.weight_kg) : null } });
      $('#infoDialog').close();
      await loadDailySummary();
      toast('已儲存');
    } catch (error) { toast(error.message); }
  };
}

function showInfo(title, html) { $('#infoTitle').textContent = title; $('#infoBody').innerHTML = html; $('#infoDialog').showModal(); }
function renderList(items) { return items && items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">目前沒有足夠資料。</p>'; }

$('#newMemberBtn').onclick = () => openMemberDialog();
$('#editMemberBtn').onclick = () => openMemberDialog(state.profile);
$('#switchBtn').onclick = () => { $('#homeView').classList.add('hidden'); $('#membersView').classList.remove('hidden'); state.active = null; };
$('#cameraBtn').onclick = openPhotoDialog;
$('#manualBtn').onclick = openManualEntry;
$('#photos').onchange = event => { addFiles(event.target.files); event.target.value = ''; };
$('#clearPhotos').onclick = () => { state.files = []; renderPreviews(); };
$('#analyzeBtn').onclick = analyzePhotos;
$('#saveMealBtn').onclick = saveMeal;
$('#addManualFoodBtn').onclick = () => {
  state.analysis.foods = editedFoods();
  state.analysis.foods.push(emptyManualFood());
  renderFoodEditor();
};
$('#adviceBtn').onclick = showAdvice;
$('#weeklyBtn').onclick = showWeekly;
$('#logBtn').onclick = openDailyLog;
$('#historyDate').onchange = loadMeals;
document.querySelectorAll('[name=is_child]').forEach(input => input.onchange = toggleChildFields);
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('#settingsBtn').onclick = () => { $('#scriptUrl').value = getScriptUrl(); $('#settingsDialog').showModal(); };
$('#saveSettings').onclick = async () => {
  const url = $('#scriptUrl').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) return toast('請填入 Apps Script /exec 網址');
  localStorage.setItem('nutritionScriptUrl', url);
  $('#settingsDialog').close();
  await loadMembers();
  toast('設定已儲存');
};

renderAvatarOptions('adult-1');
loadMembers();
