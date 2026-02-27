# NSFWLover AI v2.0

## Deploy
```bash
wrangler secret put POSTHOG_COOKIE   # 貼 ph_phc_VrIqTc5B... 的值
wrangler deploy
```

## Secrets
- POSTHOG_COOKIE: ph_phc_VrIqTc5B... 的 URL-encoded 值（從 F12 Network 取）
- （不需要 SESSION_TOKEN）

## 請求格式（已確認）
- Header: cf-turnstile-token（由前端 invisible widget 自動取得）
- Cookie: ph_phc_VrIqTc5B...=（固定，存入 Secret）
