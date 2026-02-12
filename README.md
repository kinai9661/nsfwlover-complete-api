# 圖片生成 API 輸出站

OpenAI 相容的圖片生成 API 逆向工程輸出站，支援 ZImage Turbo 和 Flux2Klein 模型。

## 功能特色

- 🎨 **圖片生成** - 透過 API 生成高品質圖片
- 🤖 **多模型支援** - ZImage Turbo (快速) / Flux2Klein (高品質)
- 🔞 **成人模式** - 支援成人圖片生成（需手動啟用）
- 🔑 **API Key 支援** - 支援 Bearer Token 認證
- 🌐 **多語言介面** - 支援中文和英文切換
- 📊 **API 資訊** - 顯示完整的 API 端點資訊和參數說明
- 📝 **請求/響應** - 即時顯示請求內容和響應結果
- 📜 **請求歷史** - 記錄最近 10 筆請求歷史
- 🎯 **單頁應用** - 純前端實現，無需後端伺服器
- 📱 **響應式設計** - 支援各種螢幕尺寸

## 支援的模型

| 模型 | 端點 | 特點 |
|------|------|------|
| ZImage Turbo | `/api/image/generation/zimage-turbo` | 快速生成模型 |
| Flux2Klein | `/api/image/generation/flux2klein` | 高品質生成模型 |

## API 端點

```
https://www.nsfwlover.com/api/image/generation/zimage-turbo
https://www.nsfwlover.com/api/image/generation/flux2klein
```

## 部署到 Cloudflare Pages

### 方法一：透過 Cloudflare Dashboard 部署

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 進入 **Workers & Pages** > **Create application**
3. 選擇 **Pages** > **Upload assets**
4. 上傳專案檔案：
   - `index.html`
   - `wrangler.toml` (選用)
5. 設定專案名稱並點擊 **Deploy**

### 方法二：透過 Wrangler CLI 部署

1. 安裝 Wrangler CLI：
```bash
npm install -g wrangler
```

2. 登入 Cloudflare：
```bash
wrangler login
```

3. 部署到 Pages：
```bash
wrangler pages deploy . --project-name=image-api-dashboard
```

### 方法三：透過 Git 連接部署

1. 將程式碼推送到 GitHub/GitLab
2. 在 Cloudflare Dashboard 建立新的 Pages 專案
3. 連接您的 Git 儲存庫
4. 設定建置配置（靜態網站，無需建置命令）
5. 點擊 **Save and Deploy**

## 使用方式

1. 選擇模型（ZImage Turbo 或 Flux2Klein）
2. 選擇語言（中文或英文）
3. （可選）輸入 API Key 進行認證
4. （可選）啟用成人模式以生成成人內容
5. 輸入提示詞描述您想要的圖片
6. 設定圖片片參數（寬度、高度、步數等）
7. 點擊「生成圖片」按鈕
8. 查看生成結果和 API 響應

## 參數說明

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| prompt | string | 是 | 圖片描述提示詞 |
| width | number | 否 | 圖片寬度 (64-2048，預設 512) |
| height | number | 否 | 圖片高度 (64-2048，預設 512) |
| steps | number | 否 | 生成步數 (1-100，預設 20) |
| seed | number | 否 | 隨機種子，用於重複生成 |
| negative_prompt | string | 否 | 負面提示詞 |
| nsfw | boolean | 否 | 成人模式，啟用後可生成成人內容 (預設: false) |
| cfg_scale | number | 否 | CFG Scale，控制提示詞影響程度 (預設: 7.5) |
| num_images | number | 否 | 生成圖片數量 (預設: 1) |
| sampler_name | string | 否 | 採樣器類型 (預設: dpmpp_2m) |
| scheduler | string | 否 | 調度器類型 (預設: normal) |

### 採樣器選項

- `euler_a` - Euler Ancestral
- `euler` - Euler
- `dpmpp_2m` - DPM++ 2M (預設)
- `dpmpp_sde` - DPM++ SDE
- `ddim` - DDIM
- `uni_pc` - UniPC

### 調度器選項

- `normal` - Normal (預設)
- `karras` - Karras
- `exponential` - Exponential
- `sgm_uniform` - SGM Uniform

## API 認證

如果 API 需要認證，請在「API 設置」區域輸入您的 API Key。系統會自動將其添加到請求標頭中：

```
Authorization: Bearer YOUR_API_KEY
```

## 快捷鍵

- `Ctrl + Enter` - 快速生成圖片

## 技術棧

- 純 HTML/CSS/JavaScript
- 無需框架或建置工具
- Fetch API 進行 HTTP 請求
- 多語言支援 (i18n)

## 免責聲明

本工具僅供技術研究和學習使用。使用成人模式生成內容時，請確保：
- 您已年滿當地法定年齡
- 遵守當地法律法規
- 不用於非法用途

## 授權

MIT License
