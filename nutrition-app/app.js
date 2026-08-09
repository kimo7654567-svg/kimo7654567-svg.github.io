const $ = selector => document.querySelector(selector);
const state = { members: [], active: null, profile: null, files: [], analysis: null, customAvatar: '', editRecordId: '', draftFoods: [], favorites: [] };
const avatarIds = ['adult-1', 'adult-2', 'child-1', 'child-2'];
const nutrientLabels = { calories: '熱量 kcal', protein_g: '蛋白質 g', fat_g: '脂肪 g', carbohydrate_g: '碳水 g', fiber_g: '纖維 g', sodium_mg: '鈉 mg', calcium_mg: '鈣 mg', iron_mg: '鐵 mg', zinc_mg: '鋅 mg', vitamin_a_ug: '維生素 A μg', vitamin_c_mg: '維生素 C mg', vitamin_d_ug: '維生素 D μg', omega3_mg: 'Omega-3 mg' };

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const avatarUrl = id => String(id || '').startsWith('data:image/') ? id : `avatars/${id || 'adult-1'}.svg`;
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
  $('#members').innerHTML = state.members.map(member => `<button class="member" data-id="${member.member_id}"><img src="${avatarUrl(member.avatar_id)}" alt=""><b>${escapeHtml(member.name)}</b>${member.is_child ? '<small>兒童</small>' : ''}</button>`).join('');
  document.querySelectorAll('.member').forEach(button => button.onclick = () => selectMember(button.dataset.id));
}

async function selectMember(memberId) {
  state.active = state.members.find(member => member.member_id === memberId);
  if (!localStorage.getItem(`nutritionAuth:${memberId}`)) return showLogin(state.active);
  try {
    state.profile = await callApi('get_profile', { memberId });
  } catch (error) {
    if (/登入|密碼|憑證/.test(error.message)) { localStorage.removeItem(`nutritionAuth:${memberId}`); showLogin(state.active); }
    else toast(error.message);
    return;
  }
  $('#membersView').classList.add('hidden');
  $('#homeView').classList.remove('hidden');
  $('#activeAvatar').src = avatarUrl(state.active.avatar_id);
  $('#activeName').textContent = state.active.name;
  $('#activeMode').textContent = state.active.is_child ? '兒童模式' : '';
  $('#activeMode').classList.toggle('hidden', !state.active.is_child);
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
    $('#vegetables').textContent = summary.water_ml == null ? '—' : Math.round(summary.water_ml);
    $('#feedback').textContent = summary.feedback;
  } catch (error) {
    $('#feedback').textContent = error.message;
  }
}

async function loadMeals() {
  try {
    const meals = await callApi('get_meals', { memberId: state.active.member_id, date: $('#historyDate').value || today() });
    renderMealTimeline(meals);
  } catch (error) {
    $('#mealList').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function renderMealTimeline(rows) {
  const labels = { breakfast: '早餐', brunch: '早午餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };
  const groups = Object.values(rows.reduce((result, row) => {
    const id = String(row.record_id);
    if (!result[id]) result[id] = { id, time: row.time, type: row.meal_type, foods: [], calories: 0, protein: 0 };
    result[id].foods.push(row);
    result[id].calories += Number(row.calories) || 0;
    result[id].protein += Number(row.protein_g) || 0;
    return result;
  }, {})).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  $('#mealList').innerHTML = groups.length ? groups.map(group => `<article class="meal-card"><div class="meal-head"><div><b>${labels[group.type] || escapeHtml(group.type)} ${escapeHtml(group.time || '')}</b><p>${group.foods.map(food => escapeHtml(food.food_name)).join('、')}</p><small>${Math.round(group.calories)} kcal｜蛋白質 ${Math.round(group.protein)} g</small></div><div><button data-edit-meal="${group.id}">修改</button><button data-delete-meal="${group.id}">刪除</button></div></div><details><summary>查看內容</summary>${group.foods.map(food => `<div class="food-row"><span>${escapeHtml(food.food_name)}</span><b>${Math.round(Number(food.estimated_weight_g))} g</b></div>`).join('')}</details></article>`).join('') : '<p class="muted">這一天還沒有紀錄。</p>';
  document.querySelectorAll('[data-edit-meal]').forEach(button => button.onclick = () => editMeal(groups.find(group => group.id === button.dataset.editMeal)));
  document.querySelectorAll('[data-delete-meal]').forEach(button => button.onclick = () => deleteMeal(button.dataset.deleteMeal));
}

function openMemberDialog(profile = null) {
  const form = $('#memberForm');
  form.reset();
  form.elements.namedItem('member_id').value = profile ? profile.member_id : '';
  $('#memberFormStatus').textContent = '';
  let passwordRow = $('#memberPasswordRow');
  if (!passwordRow) { $('#memberFormStatus').insertAdjacentHTML('beforebegin', '<label id="memberPasswordRow">登入密碼（至少 6 個字元）<input name="password" type="password" minlength="6" autocomplete="new-password"></label>'); passwordRow = $('#memberPasswordRow'); }
  passwordRow.classList.toggle('hidden', Boolean(profile));
  passwordRow.querySelector('input').required = !profile;
  attachPasswordToggles(form);
  state.customAvatar = profile && String(profile.avatar_id).startsWith('data:image/') ? profile.avatar_id : '';
  if (profile) {
    ['name', 'birthday', 'sex', 'height_cm', 'weight_kg', 'activity_level', 'usual_daily_steps', 'goal', 'allergy'].forEach(key => {
      if (form.elements[key]) form.elements[key].value = key === 'birthday' ? String(profile[key] ?? '').slice(0, 10) : profile[key] ?? '';
    });
    form.querySelector(`[name=is_child][value="${Boolean(profile.is_child)}"]`).checked = true;
  }
  renderAvatarOptions(profile ? profile.avatar_id : 'adult-1');
  showCustomAvatar();
  toggleChildFields();
  $('#memberDialog').showModal();
}

function renderAvatarOptions(selected) {
  $('#avatars').innerHTML = avatarIds.map(id => `<label><input type="radio" name="avatar_id" value="${id}" ${id === selected ? 'checked' : ''}><img src="${avatarUrl(id)}" alt="人像"></label>`).join('');
}

function showCustomAvatar() {
  $('#customAvatarPreview').classList.toggle('hidden', !state.customAvatar);
  if (state.customAvatar) $('#customAvatarPreview').src = state.customAvatar;
}

async function compressAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const size = 160;
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  canvas.getContext('2d').drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
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
    allergy: values.allergy || '', avatar_id: state.customAvatar || values.avatar_id,
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
      : await callApi('create_member', { profile, password: values.password });
    if (created.auth_token) localStorage.setItem(`nutritionAuth:${created.member_id}`, created.auth_token);
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
  state.editRecordId = '';
  state.draftFoods = [];
  $('#captureStep').classList.remove('hidden');
  $('#reviewStep').classList.add('hidden');
  $('#photoDialogTitle').textContent = '新增餐點';
  $('#reviewNotice').textContent = '以下皆為照片估算值。請確認並修改後再保存。';
  $('#addManualFoodBtn').classList.add('hidden');
  $('#saveMealBtn').textContent = '確認並保存這一餐';
  $('#photos').value = '';
  $('#cameraPhotos').value = '';
  renderPreviews();
  loadFavorites();
  $('#photoDialog').showModal();
}

async function loadFavorites() {
  try { state.favorites = await callApi('list_favorites', { memberId: state.active.member_id }); renderDraftFoods(); } catch (error) { toast(error.message); }
}
function renderDraftFoods() {
  let area = $('#draftFoods');
  if (!area) { $('#analyzeBtn').insertAdjacentHTML('beforebegin', '<div id="draftFoods"></div>'); area = $('#draftFoods'); }
  area.innerHTML = `${state.favorites.length ? `<div class="favorites"><b>我的最愛</b>${state.favorites.map(item => `<button type="button" data-favorite="${item.favorite_id}">☆ ${escapeHtml(item.food.name)}</button>`).join('')}</div>` : ''}${state.draftFoods.length ? `<div class="notice"><b>已加入這一餐</b><p>${state.draftFoods.map(food => escapeHtml(food.name)).join('、')}</p></div>` : ''}`;
  area.querySelectorAll('[data-favorite]').forEach(button => button.onclick = () => { const item = state.favorites.find(value => value.favorite_id === button.dataset.favorite); state.draftFoods.push(structuredClone(item.food)); renderDraftFoods(); });
}

function editMeal(group) {
  state.manualEntry = true;
  state.editRecordId = group.id;
  state.files = [];
  state.analysis = { foods: group.foods.map(row => ({
    name: row.food_name, quantity: Number(row.quantity) || 1,
    estimated_total_weight_g: Number(row.estimated_weight_g), confidence: Number(row.confidence) || 1,
    nutrients: Object.fromEntries(Object.keys(nutrientLabels).map(key => [key, Number(row[key]) || 0])),
    vegetable_serving: Number(row.vegetable_serving) || 0, fruit_serving: Number(row.fruit_serving) || 0,
    dairy_serving: Number(row.dairy_serving) || 0, note: row.note || '', observed_in_images: [],
  })) };
  $('#mealType').value = group.type;
  $('#captureStep').classList.add('hidden');
  $('#reviewStep').classList.remove('hidden');
  $('#photoDialogTitle').textContent = '修改餐點';
  $('#reviewNotice').textContent = '修改後會更新這一餐的文字與營養紀錄。';
  $('#addManualFoodBtn').classList.remove('hidden');
  $('#saveMealBtn').textContent = '儲存修改';
  renderFoodEditor();
  $('#photoDialog').showModal();
}

async function deleteMeal(recordId) {
  if (!confirm('確定刪除這一整餐嗎？此動作無法復原。')) return;
  try {
    await callApi('delete_meal', { memberId: state.active.member_id, recordId });
    await refreshHome();
    toast('餐點已刪除');
  } catch (error) { toast(error.message); }
}

function emptyManualFood() {
  return {
    name: '', quantity: 1, estimated_total_weight_g: null, confidence: 1,
    nutrients: Object.fromEntries(Object.keys(nutrientLabels).map(key => [key, 0])),
    vegetable_serving: 0, fruit_serving: 0, dairy_serving: 0,
    note: '手動紀錄', observed_in_images: [],
  };
}

function openManualEntry() {
  state.manualEntry = true;
  state.editRecordId = '';
  state.analysis = { foods: [emptyManualFood()] };
  $('#captureStep').classList.add('hidden');
  $('#reviewStep').classList.remove('hidden');
  $('#photoDialogTitle').textContent = '手動新增餐點';
  $('#reviewNotice').textContent = '只要填食物名稱；重量與熱量不知道可以留空，由 AI 估算。';
  $('#addManualFoodBtn').classList.remove('hidden');
  $('#saveMealBtn').textContent = '加入餐點草稿';
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
  if (!state.files.length && !state.draftFoods.length) return toast('請先加入照片、手動食物或最愛');
  const button = $('#analyzeBtn');
  button.disabled = true;
  button.textContent = '壓縮並分析中…';
  try {
    let photoFoods = [];
    if (state.files.length) { const images = []; for (const file of state.files) images.push(await compressImage(file)); const result = await callApi('analyze_food', { images }); if (!result.is_food_image) { toast(result.reason || '無法可靠辨識食物'); return; } photoFoods = result.foods; }
    state.analysis = { foods: [...photoFoods, ...state.draftFoods] };
    $('#saveMealBtn').textContent = '確認並保存這一餐';
    renderFoodEditor();
    $('#captureStep').classList.add('hidden');
    $('#reviewStep').classList.remove('hidden');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = '分析這一餐'; }
}

function renderFoodEditor() {
  if (state.manualEntry) {
    $('#foodEditor').innerHTML = state.analysis.foods.map((food, index) => `<div class="food-card" data-index="${index}"><div class="dialog-head"><b>食物 ${index + 1}</b>${state.analysis.foods.length > 1 ? `<button type="button" data-remove="${index}">刪除</button>` : ''}</div><label>食物名稱或份量描述<input data-key="name" maxlength="100" placeholder="例如：雞腿便當一個、無糖豆漿一杯" value="${escapeHtml(food.name)}"></label><div class="two"><label>重量 g（選填）<input type="number" min="0.1" step="0.1" data-optional="estimated_total_weight_g" value="${Number(food.estimated_total_weight_g) > 0 ? food.estimated_total_weight_g : ''}"></label><label>熱量 kcal（選填）<input type="number" min="0" step="1" data-optional-calories value="${Number(food.nutrients && food.nutrients.calories) > 0 ? food.nutrients.calories : ''}"></label></div></div>`).join('');
    document.querySelectorAll('.food-card').forEach(card => card.insertAdjacentHTML('beforeend', '<label class="favorite-check"><input type="checkbox" data-save-favorite> 加入我的最愛</label>'));
    document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { state.analysis.foods.splice(Number(button.dataset.remove), 1); renderFoodEditor(); });
    return;
  }
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
    card.querySelectorAll('[data-optional]').forEach(input => food[input.dataset.optional] = input.value ? Number(input.value) : null);
    const calories = card.querySelector('[data-optional-calories]');
    if (calories) food.nutrients.calories = calories.value ? Number(calories.value) : null;
    food.save_favorite = Boolean(card.querySelector('[data-save-favorite]:checked'));
    return food;
  });
}

async function saveMeal() {
  const button = $('#saveMealBtn');
  try {
    let foods = editedFoods();
    if (foods.some(food => !String(food.name).trim())) throw new Error('請填寫每一項食物名稱');
    button.disabled = true;
    if (state.manualEntry && !state.editRecordId) {
      button.textContent = 'AI 正在估算並加入…';
      const favoriteFlags = foods.map(food => food.save_favorite);
      const result = await callApi('analyze_manual_food', { foods: foods.map(food => ({ name: food.name, estimated_weight_g: food.estimated_total_weight_g, calories: food.nutrients.calories })) });
      foods = result.foods;
      const favorites = foods.filter((food, index) => favoriteFlags[index]);
      if (favorites.length) await callApi('save_favorites', { memberId: state.active.member_id, foods: favorites });
      state.draftFoods.push(...foods);
      state.manualEntry = false; state.analysis = null;
      $('#captureStep').classList.remove('hidden'); $('#reviewStep').classList.add('hidden'); $('#photoDialogTitle').textContent = '新增餐點';
      await loadFavorites(); renderDraftFoods();
      toast('已加入餐點草稿，最後再確認整餐');
      return;
    }
    const meal = { date: $('#historyDate').value || today(), time: new Date().toTimeString().slice(0, 5), meal_type: $('#mealType').value, foods };
    await callApi(state.editRecordId ? 'update_meal' : 'save_meal', { memberId: state.active.member_id, recordId: state.editRecordId, meal });
    state.files = [];
    state.analysis = null;
    $('#previews').innerHTML = '';
    $('#photoDialog').close();
    await refreshHome();
    toast(state.editRecordId ? '餐點已更新' : '已保存文字紀錄，照片未保存');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = '確認並保存這一餐'; }
}

function discardMealDraft() {
  state.files = [];
  state.analysis = null;
  state.editRecordId = '';
  state.draftFoods = [];
  $('#previews').innerHTML = '';
  $('#photos').value = '';
  $('#cameraPhotos').value = '';
}

function closeMealDialogOrGoBack(dialog) {
  if ($('#captureStep').classList.contains('hidden')) {
    state.manualEntry = false;
    state.analysis = null;
    state.editRecordId = '';
    $('#captureStep').classList.remove('hidden');
    $('#reviewStep').classList.add('hidden');
    $('#photoDialogTitle').textContent = '新增餐點';
    renderPreviews();
    return;
  }
  discardMealDraft();
  dialog.close();
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
  showInfo('今日飲水與步數', '<form id="dailyLogForm"><label>飲水 ml（選填）<input name="water_ml" type="number" min="0" max="20000"></label><label>今日步數（選填）<input name="steps" type="number" min="0" max="100000"></label><button class="primary">儲存</button></form>');
  $('#dailyLogForm').onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await callApi('save_daily_log', { memberId: state.active.member_id, log: { date: today(), water_ml: values.water_ml ? Number(values.water_ml) : null, steps: values.steps ? Number(values.steps) : null } });
      $('#infoDialog').close();
      await loadDailySummary();
      toast('已儲存');
    } catch (error) { toast(error.message); }
  };
}

function showInfo(title, html) { $('#infoTitle').textContent = title; $('#infoBody').innerHTML = html; $('#infoDialog').showModal(); }
function attachPasswordToggles(root = document) { root.querySelectorAll('input[type="password"]:not([data-eye-ready])').forEach(input => { input.dataset.eyeReady = 'true'; const button = document.createElement('button'); button.type = 'button'; button.className = 'password-eye'; button.textContent = '👁'; input.insertAdjacentElement('afterend', button); button.onclick = () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.textContent = show ? '🙈' : '👁'; }; }); }
function showLogin(member) {
  showInfo(member.needs_password ? '設定登入密碼' : `登入 ${member.name}`, `<form id="loginForm"><p class="muted">${member.needs_password ? '這是舊人物資料，請設定至少 6 個字元的密碼。' : '此瀏覽器登入一次後會記住。'}</p><label>密碼<input name="password" type="password" minlength="6" required autocomplete="current-password"></label><button class="primary">${member.needs_password ? '設定並登入' : '登入'}</button></form>`);
  attachPasswordToggles($('#loginForm'));
  $('#loginForm').onsubmit = async event => { event.preventDefault(); const password = new FormData(event.currentTarget).get('password'); try { const result = await callApi('login', { memberId: member.member_id, password }); localStorage.setItem(`nutritionAuth:${member.member_id}`, result.auth_token); member.needs_password = false; $('#infoDialog').close(); await selectMember(member.member_id); } catch (error) { toast(error.message); } };
}
function showAccountSettings() {
  if (!state.active) return showInfo('帳號管理', '<p>請先選擇一位家庭成員。</p>');
  showInfo('帳號管理', `<p>目前人物：<b>${escapeHtml(state.active.name)}</b></p><p class="muted">刪除後，專屬 Google Sheet 會移到雲端硬碟垃圾桶。</p><form id="deleteAccountForm"><label>輸入密碼確認刪除<input name="password" type="password" minlength="6" required></label><button class="danger">刪除我的人物帳號</button></form>`);
  attachPasswordToggles($('#deleteAccountForm'));
  $('#deleteAccountForm').onsubmit = async event => { event.preventDefault(); if (!confirm(`確定刪除 ${state.active.name} 的全部資料嗎？`)) return; const password = new FormData(event.currentTarget).get('password'); try { const id = state.active.member_id; await callApi('delete_account', { memberId: id, password }); localStorage.removeItem(`nutritionAuth:${id}`); state.active = null; $('#infoDialog').close(); $('#homeView').classList.add('hidden'); $('#membersView').classList.remove('hidden'); await loadMembers(); toast('人物帳號已刪除'); } catch (error) { toast(error.message); } };
}
function renderList(items) { return items && items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">目前沒有足夠資料。</p>'; }

$('#newMemberBtn').onclick = () => openMemberDialog();
$('#editMemberBtn').onclick = () => openMemberDialog(state.profile);
$('#switchBtn').onclick = () => { $('#homeView').classList.add('hidden'); $('#membersView').classList.remove('hidden'); state.active = null; };
$('#cameraBtn').onclick = openPhotoDialog;
$('#manualBtn').onclick = openManualEntry;
$('#manualBtn').textContent = '手動輸入';
$('#cameraPhotos').onchange = event => { addFiles(event.target.files); event.target.value = ''; };
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
$('#avatarPhoto').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { state.customAvatar = await compressAvatar(file); showCustomAvatar(); }
  catch (error) { toast('無法處理這張圖片'); }
  event.target.value = '';
};
$('#avatars').onchange = () => { state.customAvatar = ''; showCustomAvatar(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { const dialog = button.closest('dialog'); if (dialog.id === 'photoDialog') closeMealDialogOrGoBack(dialog); else dialog.close(); });

renderAvatarOptions('adult-1');
document.querySelector('header').insertAdjacentHTML('beforeend', '<button id="settingsBtn" class="icon" aria-label="帳號管理">⚙</button>');
$('#settingsBtn').onclick = showAccountSettings;
const summaryThird = $('#vegetables').closest('article'); summaryThird.querySelector('small').textContent = '今日飲水'; summaryThird.querySelector('span').textContent = 'ml';
$('#logBtn').textContent = '飲水／步數';
const home = $('#homeView'); const panels = home.querySelectorAll('.panel'); const summary = home.querySelector('.summary'); home.insertBefore(panels[0], summary); home.insertBefore(panels[1], summary);
loadMembers();
