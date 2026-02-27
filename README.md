# NSFWLover UI 生圖工具 v1.5 (OpenAI 相容)

免費 NSFW AI 圖像生成代理，基於 Z-Image-Turbo，部署於 Cloudflare Workers。

## 部署步驟
```bash
# 1. 安裝 wrangler
npm i -g wrangler && wrangler login

# 2. 設定 Secrets
wrangler secret put POSTHOG_COOKIE   # 貼 ph_phc_VrIqTc5B... 全值
wrangler secret put SESSION_TOKEN    # 貼 __Secure-next-auth.session-token 值（若有）

# 3. 部署
wrangler deploy
```

## API 端點
| 端點 | 方法 | 說明 |
|------|------|------|
| / | GET | UI 介面 |
| /v1/images/generations | POST | OpenAI DALL-E 相容 |
| /v1/models | GET | 列出模型 |
| /health | GET | 健康檢查 |
| /debug?prompt_id=xxx | GET | 除錯輪詢 |

## curl 範例
```bash
curl -X POST https://your-worker.workers.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-任意" \
  -d '{"model":"zimage-turbo","prompt":"1girl, nsfw, masterpiece","n":1,"size":"512x768"}'
```

## 除錯
- `wrangler tail` 查看 console.log
- /debug?prompt_id=xxx 手動輪詢測試
- 403 = Cookie 失效，重新抓取更新 Secrets
- 10021 = toml 日期設未來，改 2026-01-31 ✅

## GitHub
kinai9661/nsfwlover-ui-gen
