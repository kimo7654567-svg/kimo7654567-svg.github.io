# 日日好食雲端版部署

正式架構：GitHub Pages 前端＋Google Apps Script 後端＋Gemini 2.5 Flash-Lite＋每位家庭成員獨立 Google Spreadsheet。

## 安全邊界

- `cloud/` 是公開前端，不含 Gemini Key。
- `apps-script/Code.gs` 是後端原始碼；Key 只放 Apps Script 的 Script Properties。
- 第一版沒有 PIN 或登入，知道 GitHub Pages 和 Apps Script 網址的人可以使用服務。
- `authorizeRequest()` 是預留的驗證入口；未來加入密碼不需修改其他 API 或工作表。
- 餐點照片不寫入 GitHub、Google Drive 或 Google Sheets。瀏覽器壓縮後放入單次請求，Gemini 回傳後由前端清除。
- 照片會傳送至 Google Apps Script 與 Gemini，仍受 Google 當下的 API 資料政策約束。

## 一、建立 Gemini API Key

1. 開啟 [Google AI Studio](https://aistudio.google.com/app/apikey)。
2. 建立或選擇一個 Google Cloud project。
3. 建立 Gemini API Key。
4. 不要把 Key 寫進 `cloud/api.js`、GitHub 或 Google Sheet。
5. 使用免費層且不希望產生費用時，不要為該專案啟用付費方案。

使用模型：

```text
gemini-2.5-flash-lite
```

這是穩定版 ID，不使用已停止的 preview ID。

## 二、建立家庭索引 Google Sheet

1. 在 Google Drive 建立一份空白試算表，名稱例如「日日好食家庭索引」。
2. 從網址複製 `/d/` 與 `/edit` 之間的 Sheet ID。
3. 不需要自己建立欄位；Apps Script 第一次呼叫會建立 `Members` 工作表。
4. 新增家庭成員時，Apps Script 會在相同 Google Drive 自動建立該成員的獨立 Spreadsheet。

## 三、建立 Google Apps Script

1. 開啟 [Google Apps Script](https://script.google.com/)並建立新專案。
2. 專案名稱可設為「日日好食 API」。
3. 將預設 `Code.gs` 全部替換為 [apps-script/Code.gs](apps-script/Code.gs) 的內容。
4. 開啟左側 **Project Settings／專案設定**。
5. 在 **Script Properties／指令碼屬性** 新增：

```text
GEMINI_KEY              你的 Gemini API Key
GEMINI_MODEL            gemini-2.5-flash-lite
FAMILY_INDEX_SHEET_ID   家庭索引 Sheet ID
```

6. 儲存專案。

## 四、部署 Apps Script Web App

1. 按右上角 **Deploy → New deployment**。
2. 類型選擇 **Web app**。
3. Execute as 選擇 **Me**。
4. Who has access 選擇 **Anyone**。
5. 按 Deploy，第一次會要求授權 Google Sheets、建立 Spreadsheet 與外部網路請求。
6. 完成後複製以 `/exec` 結尾的 Web app URL。

更新後端時：

1. 修改並儲存 Apps Script。
2. 開啟 **Deploy → Manage deployments**。
3. 編輯現有 deployment。
4. Version 選擇 **New version** 後重新部署。

只儲存程式碼但沒有建立新 deployment version，公開 `/exec` 仍可能執行舊版本。

## 五、部署 GitHub Pages

需要部署的公開檔案只有：

```text
cloud/
├── index.html
├── style.css
├── style-extra.css
├── app.js
├── api.js
└── avatars/
```

可選擇以下其中一種方式：

- 將 `cloud` 內容放在獨立 repository 根目錄，GitHub Pages Source 選 `main / root`。
- 將整個專案放入 repository，Pages 網址使用 `/cloud/` 路徑。

第一次打開網站後：

1. 按右上角齒輪。
2. 貼上 Apps Script `/exec` 網址。
3. 按儲存。

Apps Script 網址不是密鑰；前端會保存於該瀏覽器的 `localStorage`。Gemini Key 不會送到瀏覽器。

## 六、驗收流程

1. 建立一位成人與一位兒童。
2. 確認 Google Drive 自動出現兩份獨立的「日日好食 - 姓名」試算表。
3. 用玩具照片測試，結果必須說無法辨識，不能出現食物清單。
4. 使用同一餐俯拍和 45 度照片，確認相同食物只出現一次。
5. 保存後確認 `Meals` 只有文字與數值。
6. 確認 Google Drive 沒有餐點照片。
7. 按「今天還缺什麼？」確認建議避開過敏食物。
8. 兒童建議不得包含減肥、熱量赤字、斷食或跳餐。
9. 紀錄少於三天時，不得宣稱缺乏維生素或礦物質。

## 七、未來新增密碼

目前所有 API 都會先呼叫：

```javascript
authorizeRequest(body)
```

未來可加入：

- 家庭共用密碼
- 個人成員 PIN
- 登入後的短效 session token
- 嘗試次數限制

成員資料、飲食資料、Gemini 分析及前端主要流程不需重寫。
