# English Adventure 維護說明

這是家庭使用的兒童英語／日語學習網頁。後續修改前，AI 或維護者應先完整閱讀本文件，再檢查實際程式碼；不需要使用者重新敘述下列背景與既定需求。

## 專案位置

- 本機主要工作目錄：`C:\ai\english-teach`
- GitHub repository：<https://github.com/kimo7654567-svg/kimo7654567-svg.github.io>
- GitHub 原始碼目錄：`english-adventure/`
- GitHub Pages：<https://kimo7654567-svg.github.io/english-adventure/>
- Google Apps Script 專案：<https://script.google.com/home/projects/1fmf2y-lgewDVMsWlh0KuAS7ewuS4eD26av1LeOJr-c5317UrRMjgZyLL/edit>

## 檔案用途

- `index.html`：網頁結構。
- `style.css`：所有頁面樣式與兒童版操作介面。
- `app.js`：學習資料、測驗、故事、SRS、Google Sheets 同步及畫面邏輯。
- `api.js`：瀏覽器呼叫 Google Apps Script 的共用函式。
- `英語冒險.api`：Google Apps Script 後端完整原始碼。它不是 GitHub Pages 會執行的檔案，必須手動貼到 Apps Script 並重新部署。
- `stroke-data.js`：46 個平假名的逐筆路徑與編號位置，改編自 [KanjiVG](https://kanjivg.tagaini.net/)（Ulrich Apel，CC BY-SA 3.0）。字形與編號共用同一個 SVG 座標系統，不會因解析度或裝置字型而偏移。

## 架構與部署

前端是無建置步驟的靜態 HTML/CSS/JavaScript，部署在 GitHub Pages。前端透過 POST 呼叫 Google Apps Script；Apps Script 負責 Google Sheets、Gemini 文字／圖片／TTS 呼叫。

修改後的發布流程：

1. 修改並驗證 `C:\ai\english-teach` 內的檔案。
2. 將 `index.html`、`style.css`、`app.js`、`api.js` 同步到 repository 的 `english-adventure/`。
3. 執行 `node --check app.js` 與 `node --check api.js`，再 commit、push `main`。
4. 如果 `英語冒險.api` 有變更，將完整內容貼到 Google Apps Script。
5. Apps Script 使用「部署 → 管理部署作業 → 編輯 → 建立新版本」重新部署。
6. 若 `/exec` 網址沒有改變，前端不用更新；若網址改變，更新網頁設定或 `DEFAULT_SCRIPT_URL`。

## 已定案的安全規則

- 前端與 Apps Script 不使用公開的假密碼或 `secret`。
- 前端 API 使用 POST，不把內容放在 GET 網址參數。
- 公開 Apps Script **不得提供刪除 Google Sheets 資料的路由**。
- 網頁刪除單字只刪除本機資料，並寫入本機 `hiddenWords`，避免雲端同步後重新出現。
- Google Sheet 原始資料只能由使用者在 Google Sheets 後台手動刪除。
- 後端只接受明確列出的操作，並驗證使用者名稱、語言、文字長度、stage 與時間值。
- 使用者名稱最多 30 字，不能包含 `\ / ? * [ ] :`。
- 所有使用者輸入、匯入 JSON 與 AI 回覆在插入 `innerHTML` 前都必須做 HTML escaping；新增畫面時不可直接信任外部文字。
- 此 API 沒有真正的身分驗證。任何取得 Apps Script URL 的人理論上仍可讀取、增加或更新資料及消耗 Gemini 額度；目前家庭版接受此取捨，但絕不能重新加入刪除能力。

## Google Sheets 同步規則

- 新增單字：先保存在本機，再嘗試新增至雲端。
- 更新複習進度：更新本機並呼叫雲端更新。
- 刪除單字：只影響本機及 `hiddenWords`，不呼叫雲端刪除。
- 手動同步：採合併方式，只加入本機缺少且未隱藏的雲端單字，不直接覆蓋本機既有資料。
- 目前用戶名稱同時作為 Google Sheet 分頁名稱。

## 兒童英語教學規則

### L0（程式中的 `L0.5`）

- 對象為 8–10 歲初學兒童。
- 每篇 4–6 句，每句 3–8 個英文單字，總長約 20–45 字。
- 每篇選取 3–4 個單字庫複習單字。
- 只能使用簡單現在式。
- 可使用 `am/is/are`、`have/has`、`like/likes`、`can + 動詞原形`。
- 禁止過去式、現在進行式、完成式、未來式及被動語態。
- 避免 `yesterday`、`last week`、`once upon a time` 等過去情境。
- 使用短句、重複句型，一句只表達一件事。
- 額外 Key Vocabulary 最多 1 個。

### L1

- 每篇 8–12 句，每句約 7–12 個英文單字，總長 80–120 字。
- 每篇選取 5–8 個單字庫複習單字。
- 只能使用簡單現在式；同樣禁止過去式、現在進行式、完成式、未來式及被動語態。
- 可以使用 `and`、`but`、`because`、`so`、`when`、簡單對話、地點、時間與原因，建立完整情節。
- 額外 Key Vocabulary 最多 2 個。

故事結果必須在正文開始前顯示「本篇複習單字」區塊，列出本次選中的複習單字、中文與發音按鈕，讓孩子先確認並複習，再開始閱讀故事。

### 故事複習單字挑選

前端先從本機單字庫選字，只把選中的少量單字送給 AI，不傳整份 Google Sheet 單字庫。優先順序考量：

1. 已逾期的單字。
2. 答錯次數較多的單字。
3. 熟練度較低的單字。
4. 最近故事使用過的單字降低優先級。
5. 加入小幅隨機值，避免每次都是完全相同的一組。

故事成功生成後才更新 `lastStoryUsed` 和 `storyUseCount`。難度、時態、必用單字、句數與字數由 prompt 要求 AI 遵守；瀏覽器不再因小幅偏差拒絕顯示已生成的故事。

## 測驗與複習規則

- 測驗入口名稱為「拼字測驗」，沒有尚未實作的「綜合測驗」。
- SRS 答對後的間隔依序為 1、3、7、30 天，之後標為熟練。
- 答錯時回到新字階段，隔天再複習。
- 複習卡不能點整張卡片直接翻面。
- 「聽發音」與「看解答」必須保持明顯距離，避免兒童誤觸。
- 未翻面前只有「看解答」；翻面後才顯示「忘了／記得」。不要恢復「跳過（記得）」。

## 日文功能規則

- 日文導覽包含獨立「句型」頁：先教 `です／ます` 基礎句型，再練習 `は、が、を、に、で`，並提供兒童生活禮貌用語；現階段不教完整尊敬語或謙讓語。
- 句型與助詞題庫固定在前端，作答統計只保存在各使用者的本機狀態，不新增或改動 Google Sheet 欄位。
- 日文故事 L0 選 3–4 個複習單字，L1 選 5–8 個；所有級別的 prompt 都要求必用單字及設定字數。
- 日文 L0 故事為 4–6 句、50–80 字，只能使用平假名。
- 日文 L1/N5 為 100–150 字；L2/N4、L3/N3 為 150–200 字。
- L1 以上的漢字注音格式固定為 `漢字[かんじ]`。畫面轉為 ruby 注音，朗讀時只讀括號中的假名，避免漢字與讀音重複朗讀。
- 日文單字發音優先使用 `reading`，缺少讀音時才朗讀 `word`；瀏覽器语音优先选择 `ja-JP` voice。
- 日文拼字測驗以 `reading` 的平假名作答，不要求初學兒童直接默寫漢字；雲端進度仍以原本 `word` 識別。
- 五十音 `を` 和 `ん` 使用固定教材，不向 AI 要求不存在的常見開頭名詞，也不自動加入單字庫。
- AI 產生的五十音單字必須為平假名、以指定假名開頭，並回傳正確詞性；顯示前必須 HTML escaping。
- 五十音書寫畫布依 `stroke-data.js` 顯示淡色逐筆字形，並在每一筆起點旁標示 `1、2、3…`。字形與編號使用同一個 SVG 座標系統，畫布維持可直接描寫，不加入動畫、箭頭或自動判分。
- 使用者提供的第三方筆順 PDF 只用來核對筆順事實與位置，不得把 PDF、裁圖或原始美術上傳到公開 GitHub；其官方規約禁止未經許可的加工與網路再發布。

## 修改原則

- 修改前先確認 `C:\ai\english-teach`、GitHub repository 和已部署 Apps Script 哪一份是最新版本。
- 不直接覆蓋較新的遠端內容；先比較差異。
- 保留家庭版簡單架構，不為未提出的需求加入框架、登入系統或建置工具。
- 不要把 Gemini API Key、OAuth token、Google 密碼或其他憑證寫入此資料夾或 GitHub。
- 若改變資料格式，必須保留舊版 `localStorage` 與 Google Sheet 資料的相容性。
- 涉及 Google Sheet 刪除、公開 API 權限、學習階段或故事難度的改動，必須先向使用者確認，不能自行放寬。

## 修改後最低驗證清單

- `node --check app.js`
- `node --check api.js`
- 用 JavaScript parser 檢查 `英語冒險.api` 語法。
- CSS `{` 與 `}` 數量一致。
- 搜尋確認沒有 `secret`、`sheets_delete`、`deleteRow` 或前端 GET API 回歸。
- 測試建立／切換使用者、英文及日文新增單字、雲端合併同步。
- 測試本機刪除後重新同步不會復活，但 Google Sheet 原始列仍存在。
- 測試拼字測驗及 1/3/7/30 天 SRS。
- 測試 L0、L1 故事只用簡單現在式，且必用單字數量正確。
- 在手機尺寸確認「聽發音」和「看解答」不易誤觸。

## 目前版本備註

- 前端正式版本位於 GitHub repository 的 `english-adventure/`；本機修改完成後必須比較、驗證、commit 並 push。
- `英語冒險.api` 不放入公開 GitHub，Apps Script 有變更時必須另行手動部署。

## 暫緩的未來建議

- 使用者已決定目前不實作「訪客本機模式」。下次使用者詢問專案改善建議時，提醒可加入訪客模式：朋友仍可將單字與進度保存在自己的瀏覽器，但不讀寫家庭 Google Sheet。任何實作都必須保留現有使用者、`localStorage` key、兒童既有單字及 Google Sheet 資料，不能自動清空或轉換既有帳號。

## AI 接手摘要（更新：2026-08-09）

下一個 AI 開始修改前，先閱讀本 README 全文，再檢查工作目錄與 GitHub 遠端狀態。以下是目前已完成且不得意外倒退的功能：

- 英語 L0／L1 故事只使用簡單現在式。L0 為 4–6 句、每句 3–8 個字、全文 20–45 字；L1 為 8–12 句、每句 7–12 個字、全文 80–120 字。
- L0 故事使用 3–4 個複習單字；L1 使用 5–8 個。產生故事前與故事上方都會列出必用複習單字，時態、句數與字數由 prompt 約束 AI，前端不阻擋顯示結果。
- 複習頁已把發音按鈕與「看解答」按鈕拉開，避免兒童誤觸；測驗已改為拼字測驗。
- 日文單字發音優先讀 `reading`；日文拼字測驗以平假名讀音作答，不要求初學者默寫漢字。
- 五十音書寫使用 `stroke-data.js` 的 46 個平假名、104 筆 SVG 路徑與編號。字形和數字共用 `viewBox="0 0 109 109"`，不得改回裝置字型加固定百分比座標，否則不同字型會再次偏移。
- 筆順資料改編自 KanjiVG（Ulrich Apel，CC BY-SA 3.0），README 與 `stroke-data.js` 內的署名及授權連結必須保留。使用者提供的 `hiragana_nazorigaki2015.pdf` 只可核對，不可上傳、裁圖或重新發布。
- 日文導覽已有「文／句型」頁，包含 6 個 `です／ます` 基礎句型、`は／が／を／に／で` 五個助詞、10 道句型／助詞題，以及 7 個生活禮貌用語。完整尊敬語、謙讓語暫不加入。
- 日文句型答題統計保存在各使用者的 `state.jaGrammar`（`answered`、`correct`），載入舊資料時會自動補預設值；不新增 Google Sheet 欄位，也不會改動既有單字資料。
- 使用者兒子已有大量本機與 Google Sheet 單字。任何資料結構修改都必須向後相容，不得清除 `localStorage`、更名既有 storage key、覆寫使用者清單或清洗 Google Sheet。
- 訪客模式尚未實作。使用者下次詢問改善建議時要提醒，但未獲再次確認前不要動工。

### API 與 Script Properties

- 英語冒險的 Apps Script 程式是 `英語冒險.api`，雲端修改需由使用者手動貼入 Apps Script 並重新部署；單純前端修改不需要部署 API。
- 英語 API 使用 `GEMINI_KEY`；`SHEET_ID` 在程式內有既有備用值。`FAMILY_INDEX_SHEET_ID` 與 `GEMINI_MODEL` 是同一個 GitHub repository 內「營養 App」的設定，留在 Script Properties 不會影響英語冒險，但屬性名稱大小寫必須完全正確。
- 不可把 Gemini key、Google Sheet ID 的新副本或其他密鑰提交到公開 GitHub。不可加入能刪除 Google Sheet 列或工作表的 API。

### GitHub 共用 repository 注意事項

- `kimo7654567-svg.github.io` 同時包含 `english-adventure/` 與 `nutrition-app/`。修改期間遠端常有營養 App 的新提交。
- 推送被拒絕時先執行 `git fetch origin`，用 `git diff --name-status` 確認遠端檔案範圍；若只修改 `nutrition-app/`，再把英語冒險提交 rebase 到 `origin/main`。不得 force push，也不得覆蓋營養 App 的變更。
- 正式來源與手動備份都要同步：先修改 `C:\ai\english-teach`，再同步至 repository 的 `english-adventure/`，完成語法、資料與畫面檢查後才 commit／push。
