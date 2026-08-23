# 文章後台正式站設定

文章資料庫與 `article-images` 圖片空間已建立於 Supabase 專案 `luby-music`。

Vercel 專案需要以下環境變數：

- `SUPABASE_SECRET_KEY`：必要，勾選 **Preview** 與 **Production**，並於更新後重新部署。
- `SUPABASE_URL`：選填；程式已有目前專案網址作為 fallback。
- `SUPABASE_PUBLISHABLE_KEY`：選填；程式已有可公開的 publishable key 作為 fallback。

`SUPABASE_SECRET_KEY` 不可提交 Git、放進瀏覽器程式或貼在聊天中。正式站環境變數設定完成後，文章後台才能新增、編輯與發布內容。

驗收網址：

- `/admin/articles/`：使用既有 `/admin/` 密碼及 Session。
- `/articles/`：已發布文章列表。
- `/articles/{slug}/`：文章 SEO 頁面。
- `/sitemap.xml`：發布後自動包含文章網址。
