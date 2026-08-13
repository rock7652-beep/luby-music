# 線上報名 MVP 設置步驟

獨立於現有 `index.html`（Supabase 版本）的低成本報名 MVP。
**沒有改動主系統**。包含三個檔案：

| 檔案 | 角色 |
|---|---|
| [register.html](register.html) | 獨立報名表單（前端） |
| [api/register.js](api/register.js) | Vercel serverless 代理 |
| [apps-script.gs](apps-script.gs) | Google Apps Script（後端：寫 Sheet + 寄信） |

資料流：
```
register.html  ──POST /api/register──▶  Vercel function  ──POST──▶  Apps Script Web App
                                                                    │
                                                                    ├─▶  Google Sheet (registrations)
                                                                    └─▶  Gmail → lubymusic1009@gmail.com
```

---

## 1. 建立 Google Sheet

1. 開新 Google Sheet → 命名 `Lubymusic 線上報名`。
2. 新增分頁 `registrations`（小寫）。
3. 從網址抓 Sheet ID：
   ```
   https://docs.google.com/spreadsheets/d/【這串就是 SHEET_ID】/edit
   ```

## 2. 部署 Apps Script

1. 開 [script.google.com](https://script.google.com) → 新增專案 → 命名 `Lubymusic 線上報名 API`。
2. 把 [apps-script.gs](apps-script.gs) 整段貼進 `Code.gs`。
3. 編輯檔案頂端常數：
   - `SHEET_ID` ← 步驟 1 取得的 ID
   - `SHARED_TOKEN` ← 自訂一組密鑰（隨意亂打，例如 `lbm-2026-x9K2pQ`），等下要同步給 Vercel
   - `BANK_ACCOUNT` ← 永豐帳號完整字串（顯示在通知信用，非必填，但留白通知信會顯示 placeholder）
4. 先按一次 ▶ 執行 `testRun`，跳出授權視窗 → 同意所有權限（Sheet + Gmail）。
5. 確認 Sheet 多了一筆 `測試學員` 資料、Gmail 收到 `[新報名]` 信。
6. 右上「部署 → 新增部署」：
   - 類型：**網頁應用程式**
   - 執行身分：**我**
   - 存取權限：**任何人**
   - 點「部署」→ 複製「網頁應用程式網址」（…/exec）。

> 之後改 Apps Script 程式碼，要再去「**管理部署 → 編輯（鉛筆）→ 版本選新版本 → 部署**」才會生效，不是按存檔就好。

## 3. Vercel 環境變數

到 Vercel 專案 → Settings → Environment Variables，新增：

| Name | Value |
|---|---|
| `APPS_SCRIPT_URL` | 步驟 2 複製的 …/exec 網址 |
| `APPS_SCRIPT_TOKEN` | 與 Apps Script 內 `SHARED_TOKEN` 同一字串 |

三個環境（Production / Preview / Development）都打勾，存檔後 Redeploy 一次。

## 4. 替換 register.html 內的銀行帳號顯示

`register.html` 內：
```html
<span id="bankAcct">XXX-XXX-XXXXXXX</span>
```
已寫死永豐 807 / 19301800056627，戶名「陸比音樂工作室」。如要修改請改此行。

## 5. 驗證

1. `https://你的 vercel 網域/register.html` 開啟。
2. 填一筆「舊生續報」測試資料 → 末四碼 `0000` → 送出。
3. 應該：
   - 跳成功頁，顯示 LINE @gay6872z 按鈕。
   - Google Sheet 多一列。
   - Gmail 收到通知信。
4. 換「新生報名 → 幫我推薦」流程再走一次。

---

## 早鳥折扣規則（在前端 `calcPrice` 內）

- **偶數月（2/4/6/8/10/12）1~20 號 → 95 折**
- 其他日子 → 原價
- 套用於 `classData[].price` (3600 / 4400 / 8100)
- 例：3600 → 3420（折 180）；4400 → 4180（折 220）

> 這條規則同時送到 Apps Script 寫入 Sheet 的 `basePrice` / `finalPrice` / `discount` / `isEarlyBird` 欄位，門市可從 Sheet 直接核帳。

---

## 6. 維運手冊（重新部署 Apps Script）

### 6.1 黃金守則

**永遠走「管理部署 → 編輯 → 版本=新版本」，不要走「新增部署」。**

| 路徑 | 結果 |
|---|---|
| ✅ 部署 → **管理部署** → 鉛筆編輯既有 deployment → 版本選「**新版本**」→ 部署 | `/exec` URL **不變**，Vercel env 不用動 |
| ❌ 部署 → 新增部署 | 拿到**全新** `/exec` URL，必須更新 Vercel `APPS_SCRIPT_URL` 才會生效 |

走錯路徑造成的典型症狀：前端跳「送出失敗：Apps Script 異常（HTTP 200 但 ok:false、無 error）。原始 body：`{"status":"ok"}`」——這代表 Vercel 還指著舊 deployment，新版改動沒打到。

### 6.2 標準流程

1. 在本地修 [apps-script.gs](apps-script.gs) → 確認 `SHEET_ID` / `SHEET_NAME` / `SHARED_TOKEN` 三個常數正確
2. macOS 把檔案內容塞剪貼簿：
   ```bash
   osascript -e 'set the clipboard to (read POSIX file "'"$PWD"'/apps-script.gs" as «class utf8»)'
   ```
3. Apps Script editor → 開 `程式碼.gs`（`Code.gs`）→ `Cmd+A` → `Cmd+V` → `Cmd+S`
4. 確認左側檔名旁邊**沒有橘色未存檔圓點**、標題列出現「已儲存到雲端硬碟」
5. 右上「**部署 → 管理部署**」→ 找 type 為「**網頁應用程式**」那筆 → 鉛筆編輯
6. **版本：新版本**；執行身分：**我**；存取權限：**任何人** → 部署
7. 完成後對話框顯示「已成功更新部署作業」+ 新版本號（例如「2 版」）

### 6.3 驗證部署生效（不必動 Vercel 就能測）

```bash
# GET 健康檢查 — 應該回新版 doGet 的 shape
curl -sS "$EXEC_URL"
# 預期：{"ok":true,"service":"lubymusic-register","time":"..."}
# 如果回 HTML 或 redirect，代表存取權限沒設「任何人」
```

### 6.4 透過 Vercel 端對端測試

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{
    "courseType":"group","name":"[TEST]Smoke","phone":"0900000000",
    "submittedAt":"'"$(date -u +%FT%TZ)"'",
    "studentType":"new","pickMode":"manual",
    "classId":"smoke","className":"煙霧測試","classLevel":"入門",
    "classDay":"週一","classTime":"19:00","classTeacher":"smoke",
    "classStartDate":"5/1","classEndDate":"6/30",
    "basePrice":3600,"finalPrice":3420,"discount":180,"isEarlyBird":true,
    "transferLast4":"1111","hasGuitar":"yes","note":"smoke test"
  }' \
  https://www.lubymusic.com/api/register
# 預期：{"ok":true,"id":"xxxxxxxx"}（8 碼 UUID）
# 看到 {"ok":false,...} → 看 error 訊息 debug
```

完成後到 Apps Script 跑 `cleanupTestRows` 清掉這筆 `[TEST]Smoke`（先 `DRY_RUN=true` 看清單，OK 再改 `false`）。

### 6.5 萬一 `/exec` URL 真的換了（不小心走「新增部署」）

CLI 操作（從 repo 根目錄執行）：

```bash
# 1. 移除舊 env
vercel env rm APPS_SCRIPT_URL production --yes

# 2. 加入新 env（把 NEW_URL 換成新的 /exec）
printf "NEW_URL_HERE" | vercel env add APPS_SCRIPT_URL production

# 3. Redeploy production（環境變數變更必須 redeploy 才生效）
vercel deploy --prod --yes

# 4. 驗證（同 6.4）
```

或在 Vercel 網頁端 Settings → Environment Variables 改 `APPS_SCRIPT_URL`，然後 Deployments 頁 redeploy 最新一筆。

### 6.6 常見錯誤對照表

| 前端看到的錯誤訊息 | 真正原因 | 修法 |
|---|---|---|
| `送出失敗：尚未設定 APPS_SCRIPT_URL 環境變數` | Vercel env 沒設或為空 | 補 env 後 redeploy |
| `送出失敗：Apps Script 失敗 HTTP 401/403` | Apps Script 部署「存取權限」不是「任何人」 | 編輯 deployment → 改成任何人 → 新版本部署 |
| `送出失敗：Apps Script 異常（…body：{"status":"ok"}）` | Vercel `APPS_SCRIPT_URL` 指到舊／別支 deployment | 走 6.5 更新 env |
| `送出失敗：Apps Script 失敗：unauthorized` | `APPS_SCRIPT_TOKEN`（Vercel）跟 `SHARED_TOKEN`（apps-script.gs）對不上 | 兩邊改成同一字串、apps-script 重新部署、Vercel redeploy |
| `送出失敗：Apps Script 回應非 JSON：<html>…` | Web App 沒授權 / 部署版本壞掉 | 重新跑一次 `testRun` 授權 → 重部署 |
| `送出逾時（超過 20 秒）…` | Apps Script 執行 >20s（少見，通常是 Gmail 配額或 Sheet 卡住） | 看 Apps Script「執行記錄」找原因 |

### 6.7 三個 HTML 檔必須同步

[index.html](index.html)、[register.html](register.html)、[register-v4.html](register-v4.html) 內容**完全相同**（同一份報名 SPA），改前端時三個都要一起改，不然不同入口會看到不同行為。可以用 `diff -q` 確認一致：

```bash
diff -q index.html register.html && diff -q index.html register-v4.html
# 沒有任何輸出 = 三檔一致
```

---

## 待補（請補完後我再串）

- [ ] Google Sheet ID
- [ ] Apps Script Web App 網址
- [ ] `SHARED_TOKEN` 字串（共用密鑰）
- [ ] 永豐銀行實際帳號 + 戶名
- [ ] （選）若要 register.html 直接吃主系統 classData，改用 `fetch('/api/classes')` 替換 inline 陣列

## 不會動到的

- `index.html`（Supabase 主系統）
- Supabase 連線 / RPC / classes / registrations
- 既有 LINE 接單流程

這次純粹 **新增獨立 MVP**，舊系統照常運作。
