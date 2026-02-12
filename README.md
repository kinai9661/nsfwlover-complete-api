# 🎨 NSFWLover AI 图片生成器 v2.0

完整的 AI 图片生成平台，支持文生图、图生图、批量生成。

## 🚀 快速开始

### 1. 部署后端
```bash
npm install
wrangler kv:namespace create MODELS_CACHE
# 更新 wrangler.toml 中的 KV ID
wrangler deploy
```

### 2. 运行前端
```bash
cd frontend
npm install
npm run dev
```

访问: http://localhost:3000

## ✨ 功能
- 文生图/图生图
- 8种比例，2个模型
- 历史记录，提示词模板
- 响应式UI

详细文档请参考完整 README。
