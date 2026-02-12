# NSFWLover API Proxy

完整的 NSFWLover 图片生成 API 代理。

## 功能

- ✅ 文生图 (Text-to-Image)
- ✅ 图生图 (Image-to-Image)
- ✅ 批量生成 (最多4张)
- ✅ 8种图片比例
- ✅ React 前端界面

## 快速开始

### 后端部署

```bash
npm install
wrangler kv:namespace create MODELS_CACHE
# 将 ID 复制到 wrangler.toml
wrangler deploy
```

### 前端运行

```bash
cd frontend
npm install
npm run dev
```

## API 文档

### POST /api/generate

```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"zimage-turbo","prompt":"a cute cat","aspect_ratio":"16:9","n":2}'
```

### POST /api/img2img

```bash
curl -X POST https://your-worker.workers.dev/api/img2img \
  -H "Content-Type: application/json" \
  -d '{"model":"flux2klein","prompt":"winter scene","image":"https://...","strength":0.75}'
```

## 许可证

MIT
