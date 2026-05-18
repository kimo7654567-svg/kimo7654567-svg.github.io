# 語言冒險 Language Adventure 🌟

> 為兒童設計的 AI 驅動英日語學習 App，支援 iPad 和桌面瀏覽器。

**Live Demo:** `https://kimo7654567-svg.github.io/english-adventure/`

---

## 功能總覽

### 🇺🇸 英語學習
| 功能 | 說明 |
|------|------|
| **單字庫** | 新增單字，AI 自動查詢詞性、中文、例句 |
| **填空測驗** | 聽發音，填入單字中間被遮掉的字母（降低難度但保有效果） |
| **克漏字測驗** | AI 從例句出題，4 選 1，不限於挖單字本身 |
| **閃卡複習** | 今日到期單字以翻牌方式複習，自評「記得／忘了」 |
| **AI 故事** | 6 個難度（L0.5–L5）× 多種主題，含中文翻譯和逐句朗讀 |
| **間隔重複** | 答對後自動延長複習週期（2ⁿ 天），首頁顯示今日待複習數量 |

### 🇯🇵 日語學習
| 功能 | 說明 |
|------|------|
| **50音練習** | 逐一練習平假名，大畫布描摹，AI 生成對應單字 |
| **50音總覽** | 格狀顯示全部46個假名完成狀態，點格直接跳到該假名 |
| **50音測驗** | 聽單字發音，4 選 1 選出開頭假名 |
| **日文單字庫** | 練完50音自動建立基礎單字庫 |
| **日文故事** | N5–N3 難度，含中文翻譯和日語朗讀 |

### 共用功能
- 🌟 **XP 升等系統** — 英語和日語經驗值分開計算
- 📊 **錯題本** — 按語言分開記錄錯誤單字
- ⬇️ **匯出 / 匯入** — 一個 JSON 同時包含英文單字、日文單字、50音進度
- ⚙️ **設定頁** — 調整每日複習數量、API 網址、密碼
- 🎨 **AI 故事插圖** — 使用 Gemini 生成配合故事的插圖
- 🎉 **彩紙動畫 + 音效** — 答對時有視覺和聲音回饋

---

## 難度系統

### 英語
| 等級 | 對應 | 字數 |
|------|------|------|
| L0.5 Graphic Reader | Age 8–10 | 50–80 字，每句加 Emoji |
| L1 Starter | A1 | 100–150 字 |
| L2 Elementary | A2 | 200–300 字 |
| L3 Intermediate | B1 | 400–600 字 |
| L4 Upper-Int | B2 | 800–1200 字 |
| L5 Advanced | C1 | 1500+ 字 |

### 日語
| 等級 | 對應 |
|------|------|
| L0.5 | 超入門，純平假名 |
| L1 | N5 |
| L2 | N4 |
| L3 | N3 |

---

## 故事主題

**英語 L0.5 專屬：** ⚔️ Hero Quest · 🔐 Escape Room · 🗺️ Adventure · 🦁 Animal Story · 👻 Horror Story · 🧸 Poppy Playtime · 🌦️ Nature & Weather

**英語一般：** 🧚 Fairy Tale · 🗺️ Adventure · 🔍 Mystery · 🦁 Animal Story · ⚽ Sports · 🌦️ Nature & Weather · ✈️ Travel · 🏠 Daily Life · 🏥 Medical · 💼 Workplace

**日語：** 🧚 Fairy Tale · 🗺️ Adventure · 🦁 Animal Story · 🔍 Mystery · 🏠 Daily Life · ✈️ Travel

---

## 技術架構

```
english-adventure/
├── index.html      # HTML 結構（導覽、所有頁面骨架）
├── style.css       # 所有樣式
├── app.js          # 主要邏輯（狀態、UI、測驗、故事、50音）
└── api.js          # API 呼叫（Google Apps Script）
```

### 前端
- 純 HTML / CSS / JavaScript，無框架依賴
- 資料存於 `localStorage`（匯出 JSON 可跨裝置備份）
- Web Speech API 提供 TTS 朗讀（英語 `en-US`，日語 `ja-JP`）
- Canvas API 實作50音書寫練習

### 後端（Google Apps Script）
- 部署為 Web App，透過 GET 請求呼叫
- API Key 和密碼存於 **Script Properties**（不寫在程式碼中）
- 支援的請求類型：

| type | 說明 |
|------|------|
| `lookup` | 英文單字查詢（詞性、中文、例句） |
| `cloze` | 從例句生成克漏字選擇題 |
| `story` | 生成英語故事（含中文翻譯） |
| `ja_lookup` | 日文單字查詢 |
| `ja_hiragana_word` | 為平假名生成對應單字 |
| `ja_cloze` | 日文克漏字 |
| `ja_story` | 生成日語故事 |
| `image` | 生成故事插圖（Gemini image model） |

### AI 模型
- 文字生成：`gemini-2.5-flash`
- 圖片生成：`gemini-2.5-flash-image`（免費版每日限額）

---

## 部署方式

### 1. Fork 或上傳到 GitHub Pages

將 `english-adventure/` 資料夾上傳到 GitHub repository，開啟 GitHub Pages 即可。

### 2. 設定 Google Apps Script

1. 前往 [script.google.com](https://script.google.com)
2. 建立新專案，貼上 `Code.gs` 內容
3. **專案設定 → 指令碼屬性** 新增：
   - `GEMINI_KEY` = 你的 [Gemini API Key](https://aistudio.google.com)
   - `SECRET` = 自訂密碼（預設 `5566`）
4. 部署為 Web App（任何人可存取）
5. 複製部署網址

### 3. 設定 App

開啟 App → **⚙️ 設定** → 填入 Script 網址和密碼

---

## 間隔重複演算法

```
答對 → nextReview = 現在 + 2^streak 天
答錯 → streak = 0, nextReview = 現在 + 10 分鐘
複習「忘了」→ streak = 0, nextReview = 明天
複習「記得」→ streak + 1, nextReview = 現在 + 2^streak 天
```

---

## 截圖

> *(可在此加入 App 截圖)*

---

## License

私人教育用途，不對外公開發布。
