/** 日日好食 Cloud API — Google Apps Script */

const API_VERSION = '1.0.0';
const MEMBER_HEADERS = ['member_id', 'name', 'is_child', 'avatar_id', 'spreadsheet_id', 'created_at'];
const PROFILE_HEADERS = ['member_id', 'name', 'birthday', 'sex', 'height_cm', 'weight_kg', 'activity_level', 'goal', 'is_child', 'allergy', 'avatar_id', 'created_at', 'updated_at'];
const MEAL_HEADERS = ['record_id', 'food_item_id', 'date', 'time', 'meal_type', 'food_name', 'quantity', 'estimated_weight_g', 'calories', 'protein_g', 'fat_g', 'carbohydrate_g', 'fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'zinc_mg', 'vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_ug', 'omega3_mg', 'vegetable_serving', 'fruit_serving', 'dairy_serving', 'confidence', 'note', 'created_at'];
const DAILY_LOG_HEADERS = ['date', 'water_ml', 'weight_kg', 'updated_at'];
const DAILY_SUMMARY_HEADERS = ['date', 'calories', 'protein_g', 'fat_g', 'carbohydrate_g', 'fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'zinc_mg', 'vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_ug', 'omega3_mg', 'vegetable_serving', 'fruit_serving', 'dairy_serving', 'water_ml', 'feedback', 'updated_at'];
const WEEKLY_SUMMARY_HEADERS = ['week_start', 'week_end', 'recorded_days', 'average_calories', 'average_protein_g', 'average_fiber_g', 'average_sodium_mg', 'average_calcium_mg', 'average_iron_mg', 'average_zinc_mg', 'average_vitamin_a_ug', 'average_vitamin_c_mg', 'average_vitamin_d_ug', 'average_omega3_mg', 'average_vegetable_serving', 'average_fruit_serving', 'average_dairy_serving', 'weight_change_kg', 'feedback', 'updated_at'];
const NUTRIENT_KEYS = ['calories', 'protein_g', 'fat_g', 'carbohydrate_g', 'fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'zinc_mg', 'vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_ug', 'omega3_mg'];

function doGet() {
  return jsonResponse({ ok: true, version: API_VERSION });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authorizeRequest(body); // Future password/authentication hook.
    const result = routeRequest(body);
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse({ ok: false, error: safeErrorMessage(error) });
  }
}

function authorizeRequest(_body) {
  // Version 1 intentionally has no PIN. Add session/password validation here later.
  return true;
}

function routeRequest(body) {
  switch (body.action) {
    case 'health': return { version: API_VERSION, geminiConfigured: Boolean(getConfig().geminiKey) };
    case 'list_members': return listMembers();
    case 'create_member': return createMember(body.profile);
    case 'get_profile': return getProfile(body.memberId);
    case 'update_profile': return updateProfile(body.memberId, body.profile);
    case 'analyze_food': return analyzeFood(body.images);
    case 'save_meal': return saveMeal(body.memberId, body.meal);
    case 'get_meals': return getMeals(body.memberId, body.date);
    case 'daily_summary': return getDailySummary(body.memberId, body.date);
    case 'weekly_summary': return getWeeklySummary(body.memberId, body.weekStart);
    case 'nutrition_advice': return getNutritionAdvice(body.memberId, body.date);
    case 'save_daily_log': return saveDailyLog(body.memberId, body.log);
    default: throw new Error('不支援的操作');
  }
}

function getConfig() {
  const properties = PropertiesService.getScriptProperties();
  return {
    geminiKey: properties.getProperty('GEMINI_KEY') || '',
    geminiModel: properties.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash-lite',
    familyIndexSheetId: properties.getProperty('FAMILY_INDEX_SHEET_ID') || '',
  };
}

function listMembers() {
  return rowsAsObjects(getFamilyIndexSheet()).map(row => ({
    member_id: String(row.member_id), name: String(row.name),
    is_child: toBoolean(row.is_child), avatar_id: String(row.avatar_id),
  }));
}

function createMember(profile) {
  validateProfile(profile);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const memberId = Utilities.getUuid();
    const now = new Date().toISOString();
    const memberBook = SpreadsheetApp.create('日日好食 - ' + profile.name);
    initializeMemberBook(memberBook);
    const storedProfile = normalizeProfile(memberId, profile, now, now);
    appendObject(memberBook.getSheetByName('Profile'), PROFILE_HEADERS, storedProfile);
    appendObject(getFamilyIndexSheet(), MEMBER_HEADERS, {
      member_id: memberId, name: profile.name, is_child: profile.is_child,
      avatar_id: profile.avatar_id, spreadsheet_id: memberBook.getId(), created_at: now,
    });
    return storedProfile;
  } finally {
    lock.releaseLock();
  }
}

function getProfile(memberId) {
  const context = getMemberContext(memberId);
  const rows = rowsAsObjects(context.book.getSheetByName('Profile'));
  if (!rows.length) throw new Error('找不到個人資料');
  return normalizeStoredProfile(rows[0]);
}

function updateProfile(memberId, profile) {
  validateProfile(profile);
  const context = getMemberContext(memberId);
  const oldProfile = getProfile(memberId);
  const updated = normalizeProfile(memberId, profile, oldProfile.created_at, new Date().toISOString());
  replaceObject(context.book.getSheetByName('Profile'), PROFILE_HEADERS, 2, updated);
  const indexSheet = getFamilyIndexSheet();
  const indexRows = rowsAsObjects(indexSheet);
  const index = indexRows.findIndex(row => String(row.member_id) === memberId);
  if (index < 0) throw new Error('找不到家庭成員');
  const indexRow = indexRows[index];
  indexRow.name = profile.name;
  indexRow.is_child = profile.is_child;
  indexRow.avatar_id = profile.avatar_id;
  replaceObject(indexSheet, MEMBER_HEADERS, index + 2, indexRow);
  return updated;
}

function analyzeFood(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 6) {
    throw new Error('每餐請提供 1 至 6 張照片');
  }
  const parts = [{ text: foodAnalysisPrompt(images.length) }];
  images.forEach((image, index) => {
    if (!image || !/^image\/(jpeg|png|webp)$/.test(image.mimeType || '')) throw new Error('照片格式不支援');
    if (!image.data || image.data.length > 1600000) throw new Error('單張照片壓縮後仍然過大');
    parts.push({ text: '照片 ' + (index + 1) });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  });
  return enforceFoodAnalysis(callGeminiJson(parts, foodAnalysisSchema()), images.length);
}

function saveMeal(memberId, meal) {
  if (!meal || !Array.isArray(meal.foods) || !meal.foods.length) throw new Error('沒有可保存的食物');
  requireDate(meal.date, '日期');
  const context = getMemberContext(memberId);
  const sheet = context.book.getSheetByName('Meals');
  const recordId = Utilities.getUuid();
  const now = new Date().toISOString();
  const rows = meal.foods.map(food => {
    validateFood(food);
    const row = {
      record_id: recordId, food_item_id: Utilities.getUuid(), date: meal.date,
      time: String(meal.time || ''), meal_type: requireText(meal.meal_type, '餐別', 20),
      food_name: requireText(food.name, '食物名稱', 100), quantity: numberInRange(food.quantity || 1, 1, 100, '數量'),
      estimated_weight_g: numberInRange(food.estimated_total_weight_g, 0.1, 5000, '重量'),
      confidence: numberInRange(food.confidence, 0, 1, '信心值'), note: String(food.note || '').slice(0, 500),
      vegetable_serving: numberOrZero(food.vegetable_serving), fruit_serving: numberOrZero(food.fruit_serving),
      dairy_serving: numberOrZero(food.dairy_serving), created_at: now,
    };
    NUTRIENT_KEYS.forEach(key => row[key] = numberOrZero(food.nutrients && food.nutrients[key]));
    return row;
  });
  appendObjects(sheet, MEAL_HEADERS, rows);
  return { record_id: recordId, saved_items: rows.length };
}

function getMeals(memberId, date) {
  requireDate(date, '日期');
  const sheet = getMemberContext(memberId).book.getSheetByName('Meals');
  return rowsAsObjects(sheet).filter(row => String(row.date) === date);
}

function saveDailyLog(memberId, log) {
  if (!log) throw new Error('缺少紀錄');
  requireDate(log.date, '日期');
  if (log.water_ml == null && log.weight_kg == null) throw new Error('請至少填寫飲水或體重');
  const row = {
    date: log.date,
    water_ml: log.water_ml == null ? '' : numberInRange(log.water_ml, 0, 20000, '飲水'),
    weight_kg: log.weight_kg == null ? '' : numberInRange(log.weight_kg, 1, 500, '體重'),
    updated_at: new Date().toISOString(),
  };
  const sheet = getMemberContext(memberId).book.getSheetByName('DailyLog');
  upsertByKeys(sheet, DAILY_LOG_HEADERS, row, ['date']);
  return row;
}

function getDailySummary(memberId, date) {
  requireDate(date, '日期');
  const context = getMemberContext(memberId);
  const meals = rowsAsObjects(context.book.getSheetByName('Meals')).filter(row => String(row.date) === date);
  const totals = summarizeMealRows(meals);
  const log = rowsAsObjects(context.book.getSheetByName('DailyLog')).find(row => String(row.date) === date);
  const profile = getProfile(memberId);
  const result = Object.assign({ date: date, meal_items: meals.length, water_ml: log && log.water_ml !== '' ? Number(log.water_ml) : null }, totals);
  result.feedback = localDailyFeedback(result, profile.is_child);
  result.updated_at = new Date().toISOString();
  upsertByKeys(context.book.getSheetByName('DailySummary'), DAILY_SUMMARY_HEADERS, result, ['date']);
  return result;
}

function getWeeklySummary(memberId, weekStart) {
  requireDate(weekStart, '週起始日');
  const context = getMemberContext(memberId);
  const start = parseDate(weekStart);
  const end = new Date(start.getTime() + 6 * 86400000);
  const endText = formatDate(end);
  const rows = rowsAsObjects(context.book.getSheetByName('Meals')).filter(row => String(row.date) >= weekStart && String(row.date) <= endText);
  const grouped = {};
  rows.forEach(row => {
    const key = String(row.date);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });
  const days = Object.keys(grouped);
  const average = emptyTotals();
  days.forEach(day => addTotals(average, summarizeMealRows(grouped[day])));
  divideTotals(average, Math.max(days.length, 1));
  const logs = rowsAsObjects(context.book.getSheetByName('DailyLog')).filter(row => String(row.date) >= weekStart && String(row.date) <= endText && row.weight_kg !== '');
  logs.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const weightChange = logs.length >= 2 ? round1(Number(logs[logs.length - 1].weight_kg) - Number(logs[0].weight_kg)) : null;
  const result = {
    week_start: weekStart, week_end: endText, recorded_days: days.length,
    weight_change_kg: weightChange, feedback: days.length < 3 ? '目前紀錄天數較少，先持續記錄，不做營養缺乏判斷。' : '依有紀錄日的七日區間平均整理。',
    updated_at: new Date().toISOString(),
  };
  Object.keys(average).forEach(key => result['average_' + key] = average[key]);
  upsertByKeys(context.book.getSheetByName('WeeklySummary'), WEEKLY_SUMMARY_HEADERS, result, ['week_start']);
  return result;
}

function getNutritionAdvice(memberId, date) {
  requireDate(date, '日期');
  const profile = getProfile(memberId);
  const startDate = new Date(parseDate(date).getTime() - 6 * 86400000);
  const weekly = getWeeklySummary(memberId, formatDate(startDate));
  const daily = getDailySummary(memberId, date);
  const prompt = nutritionAdvicePrompt(profile, daily, weekly);
  const advice = callGeminiJson([{ text: prompt }], adviceSchema());
  enforceAdviceSafety(advice, profile);
  return advice;
}

function enforceFoodAnalysis(result, imageCount) {
  if (!result || !result.is_food_image) {
    return { is_food_image: false, image_confidence: numberOrZero(result && result.image_confidence), reason: String((result && result.reason) || '無法可靠辨識圖片中的食物'), foods: [] };
  }
  const foods = (result.foods || []).filter(food => Number(food.confidence) >= 0.45);
  foods.forEach(food => {
    food.observed_in_images = (food.observed_in_images || []).filter(index => Number.isInteger(index) && index >= 1 && index <= imageCount);
  });
  if (Number(result.image_confidence) < 0.5 || !foods.length) {
    return { is_food_image: false, image_confidence: numberOrZero(result.image_confidence), reason: '無法可靠辨識圖片中的食物，請重新拍攝較清楚的照片', foods: [] };
  }
  result.foods = foods;
  return result;
}

function enforceAdviceSafety(advice, profile) {
  const text = JSON.stringify(advice);
  const diagnosticPhrases = ['你缺乏', '缺乏維生素', '缺鈣', '缺鐵', '營養不良', '脫水'];
  if (diagnosticPhrases.some(phrase => text.includes(phrase))) throw new Error('AI 建議包含不適當的健康判斷，請稍後重試');
  if (toBoolean(profile.is_child)) {
    const childForbidden = ['減肥', '熱量赤字', '斷食', '跳餐'];
    if (childForbidden.some(phrase => text.includes(phrase))) throw new Error('AI 產生了不適合兒童的建議，已阻止顯示');
  }
  const allergies = String(profile.allergy || '').split(/[、,，;；/]/).map(value => value.trim()).filter(value => value.length >= 2);
  const mealText = JSON.stringify([advice.home_cooking || [], advice.eating_out || []]);
  if (allergies.some(allergy => mealText.includes(allergy))) throw new Error('AI 建議可能包含已記錄的過敏食物，已阻止顯示');
}

function callGeminiJson(parts, schema) {
  const cfg = getConfig();
  if (!cfg.geminiKey) throw new Error('Gemini API Key 尚未設定');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.geminiModel) + ':generateContent?key=' + encodeURIComponent(cfg.geminiKey);
  const payload = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema },
  };
  const delays = [1000, 3000];
  let response;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (response.getResponseCode() !== 429 && response.getResponseCode() !== 503) break;
    if (attempt < delays.length) Utilities.sleep(delays[attempt]);
  }
  const code = response.getResponseCode();
  const raw = response.getContentText();
  if (code < 200 || code >= 300) {
    if (code === 429) throw new Error('Gemini 免費額度暫時用完，請稍後再試');
    throw new Error('Gemini 分析失敗（HTTP ' + code + '）');
  }
  const result = JSON.parse(raw);
  const text = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini 沒有回傳可用結果');
  return JSON.parse(text);
}

function getFamilyIndexSheet() {
  const id = getConfig().familyIndexSheetId;
  if (!id) throw new Error('FAMILY_INDEX_SHEET_ID 尚未設定');
  const book = SpreadsheetApp.openById(id);
  return ensureSheet(book, 'Members', MEMBER_HEADERS);
}

function getMemberContext(memberId) {
  requireText(memberId, '成員 ID', 100);
  const member = rowsAsObjects(getFamilyIndexSheet()).find(row => String(row.member_id) === String(memberId));
  if (!member) throw new Error('找不到家庭成員');
  return { member: member, book: SpreadsheetApp.openById(String(member.spreadsheet_id)) };
}

function initializeMemberBook(book) {
  const first = book.getSheets()[0];
  first.setName('Profile');
  setHeaders(first, PROFILE_HEADERS);
  ensureSheet(book, 'Meals', MEAL_HEADERS);
  ensureSheet(book, 'DailyLog', DAILY_LOG_HEADERS);
  ensureSheet(book, 'DailySummary', DAILY_SUMMARY_HEADERS);
  ensureSheet(book, 'WeeklySummary', WEEKLY_SUMMARY_HEADERS);
}

function ensureSheet(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  const current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String) : [];
  if (!current.length) setHeaders(sheet, headers);
  else if (JSON.stringify(current) !== JSON.stringify(headers)) throw new Error(name + ' 工作表欄位與程式版本不符');
  return sheet;
}

function setHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function rowsAsObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(value => value !== '')).map(row => {
    const object = {};
    headers.forEach((header, index) => object[header] = row[index]);
    return object;
  });
}

function appendObject(sheet, headers, object) { appendObjects(sheet, headers, [object]); }
function appendObjects(sheet, headers, objects) {
  if (!objects.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, objects.length, headers.length).setValues(objects.map(object => headers.map(header => object[header] == null ? '' : object[header])));
}
function replaceObject(sheet, headers, rowNumber, object) {
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(header => object[header] == null ? '' : object[header])]);
}
function upsertByKeys(sheet, headers, object, keys) {
  const rows = rowsAsObjects(sheet);
  const index = rows.findIndex(row => keys.every(key => String(row[key]) === String(object[key])));
  if (index >= 0) replaceObject(sheet, headers, index + 2, object); else appendObject(sheet, headers, object);
}

function summarizeMealRows(rows) {
  const totals = emptyTotals();
  rows.forEach(row => {
    NUTRIENT_KEYS.forEach(key => totals[key] += numberOrZero(row[key]));
    ['vegetable_serving', 'fruit_serving', 'dairy_serving'].forEach(key => totals[key] += numberOrZero(row[key]));
  });
  Object.keys(totals).forEach(key => totals[key] = round1(totals[key]));
  return totals;
}
function emptyTotals() {
  const result = { vegetable_serving: 0, fruit_serving: 0, dairy_serving: 0 };
  NUTRIENT_KEYS.forEach(key => result[key] = 0);
  return result;
}
function addTotals(target, source) { Object.keys(target).forEach(key => target[key] += numberOrZero(source[key])); }
function divideTotals(target, divisor) { Object.keys(target).forEach(key => target[key] = round1(target[key] / divisor)); }

function localDailyFeedback(summary, isChild) {
  const notes = [];
  if (summary.vegetable_serving < 2) notes.push('今天紀錄中的蔬菜較少');
  if (summary.protein_g < (isChild ? 30 : 50)) notes.push('蛋白質食物仍可增加');
  if (summary.dairy_serving < 1) notes.push('今天尚未記錄乳品或其他含鈣食物');
  if (!notes.length) notes.push('今天紀錄的主要食物類別大致均衡');
  if (isChild) notes.push('兒童營養以七日平均與食物多樣性一起觀察');
  return notes.join('；') + '。';
}

function foodAnalysisPrompt(imageCount) {
  return `以下 ${imageCount} 張照片是同一餐、同一批食物的不同角度。跨照片比對相同食物，同一食物只能計算一次；照片只能補充面積、高度、遮擋與標示。若兩塊相同食物，quantity 可為 2，但 estimated_total_weight_g 必須是合計重量。若不是食物、照片太模糊或無法可靠辨識，is_food_image=false、foods=[]，不得把玩具或物品猜成食物。以繁體中文命名。營養值是該項食物合計估算值。照片無法證實的油、鹽、品牌與微量營養素須保守估算並寫入 note。`;
}

function nutritionAdvicePrompt(profile, daily, weekly) {
  const childRules = profile.is_child ? '這是兒童。禁止使用減肥、熱量赤字、斷食、跳餐等概念；以七日平均、多樣性與均衡為主。' : '這是成人。';
  return `${childRules} 根據已確認的飲食彙總產生繁體中文建議。只能說「紀錄中的來源較少」，不可診斷缺乏維生素、疾病或脫水。若 recorded_days 少於 3，必須先說資料不足。過敏：${profile.allergy || '未記錄'}。今日：${JSON.stringify(daily)}。七日區間：${JSON.stringify(weekly)}。列出目前做得好的地方、紀錄中較少的營養或食物類別，以及自己做與外食各 2 個具體晚餐方案。所有方案避開過敏食物。`;
}

function foodAnalysisSchema() {
  const number = { type: 'number', minimum: 0 };
  const nutrients = {};
  NUTRIENT_KEYS.forEach(key => nutrients[key] = number);
  return { type: 'object', properties: {
    is_food_image: { type: 'boolean' }, image_confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: ['string', 'null'] }, foods: { type: 'array', maxItems: 30, items: { type: 'object', properties: {
      name: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, estimated_total_weight_g: { type: 'number', minimum: 0 },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, note: { type: ['string', 'null'] },
      observed_in_images: { type: 'array', items: { type: 'integer', minimum: 1 } }, nutrients: { type: 'object', properties: nutrients, required: NUTRIENT_KEYS },
      vegetable_serving: number, fruit_serving: number, dairy_serving: number,
    }, required: ['name', 'quantity', 'estimated_total_weight_g', 'confidence', 'note', 'observed_in_images', 'nutrients', 'vegetable_serving', 'fruit_serving', 'dairy_serving'] } },
  }, required: ['is_food_image', 'image_confidence', 'reason', 'foods'] };
}

function adviceSchema() {
  return { type: 'object', properties: {
    data_quality: { type: 'string' }, strengths: { type: 'array', items: { type: 'string' } },
    lower_recorded_sources: { type: 'array', items: { type: 'string' } },
    home_cooking: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    eating_out: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    caution: { type: 'string' },
  }, required: ['data_quality', 'strengths', 'lower_recorded_sources', 'home_cooking', 'eating_out', 'caution'] };
}

function validateProfile(profile) {
  if (!profile) throw new Error('缺少個人資料');
  requireText(profile.name, '名稱', 50); requireDate(profile.birthday, '生日');
  requireText(profile.sex, '性別', 20); requireText(profile.activity_level, '活動量', 20);
  requireText(profile.avatar_id, '人像', 50);
  numberInRange(profile.height_cm, 30, 250, '身高'); numberInRange(profile.weight_kg, 1, 500, '體重');
  if (!toBoolean(profile.is_child) && !profile.goal) throw new Error('成人需要選擇目標');
  if (String(profile.allergy || '').length > 500) throw new Error('過敏資料過長');
}
function validateFood(food) {
  requireText(food.name, '食物名稱', 100);
  numberInRange(food.estimated_total_weight_g, 0.1, 5000, '重量');
  if (!food.nutrients) throw new Error('缺少營養估算');
  NUTRIENT_KEYS.forEach(key => numberInRange(food.nutrients[key], 0, 100000, key));
}
function normalizeProfile(memberId, profile, createdAt, updatedAt) {
  return {
    member_id: memberId, name: String(profile.name).trim(), birthday: profile.birthday,
    sex: profile.sex, height_cm: Number(profile.height_cm), weight_kg: Number(profile.weight_kg),
    activity_level: profile.activity_level, goal: toBoolean(profile.is_child) ? '' : profile.goal,
    is_child: toBoolean(profile.is_child), allergy: String(profile.allergy || '').trim(),
    avatar_id: profile.avatar_id, created_at: createdAt, updated_at: updatedAt,
  };
}
function normalizeStoredProfile(profile) { profile.is_child = toBoolean(profile.is_child); return profile; }
function requireText(value, name, maxLength) { const text = String(value || '').trim(); if (!text || text.length > maxLength) throw new Error(name + '格式不正確'); return text; }
function requireDate(value, name) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) || isNaN(parseDate(value).getTime())) throw new Error(name + '格式不正確'); return value; }
function parseDate(text) { const parts = String(text).split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function formatDate(date) { return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd'); }
function numberInRange(value, min, max, name) { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(name + '超出合理範圍'); return number; }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
function round1(value) { return Math.round((Number(value) + Number.EPSILON) * 10) / 10; }
function toBoolean(value) { return value === true || String(value).toUpperCase() === 'TRUE'; }
function safeErrorMessage(error) { const message = error && error.message ? String(error.message) : '系統發生錯誤'; return message.replace(/AIza[\w-]+/g, '[REDACTED]').slice(0, 300); }
function jsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
