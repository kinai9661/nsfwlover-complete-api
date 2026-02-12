# 🎨 NSFWLover AI 图片生成器 v2.0

完整的 AI 图片生成平台，支持文生图、图生图、批量生成，配备现代化 UI 界面。

## ✨ 新版特性

### 增强版 UI 界面
- 🎨 **现代化设计** - 渐变背景、流畅动画、精美卡片
- 📜 **历史记录** - 自动保存生成历史，可快速重新生成
- 📝 **提示词模板** - 6 个预设模板，快速开始创作
- ⚙️ **高级选项** - 随机种子、负向提示词等精细控制
- 📱 **响应式设计** - 完美支持手机、平板、桌面设备

### 核心功能
- ✅ **文生图** - 从文字描述生成图片
- ✅ **图生图** - 基于原图进行修改
- ✅ **批量生成** - 一次生成最多 4 张
- ✅ **8 种比例** - 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 3:2, 2:3
- ✅ **2 个模型** - Z-Image Turbo (极快), Flux2Klein (高质量)

## 🚀 快速开始

### 1. 部署后端

```bash
# 安装依赖
npm install

# 创建 KV 命名空间
wrangler kv:namespace create MODELS_CACHE
wrangler kv:namespace create MODELS_CACHE --preview

# 将输出的 ID 复制到 wrangler.toml

# 部署到 Cloudflare
wrangler deploy
```

### 2. 运行前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

### 3. 构建生产版本

```bash
cd frontend
npm run build
```

## 📸 功能预览

### 文生图模式
1. 选择模型（Z-Image Turbo 或 Flux2Klein）
2. 输入提示词或选择模板
3. 选择图片比例
4. 设置生成数量（1-4张）
5. 点击生成按钮

### 图生图模式
1. 上传原图
2. 输入修改指令
3. 调整变化强度（0.5-1.0）
4. 点击开始转换

### 历史记录
- 自动保存最近 20 次生成记录
- 点击历史记录快速恢复设置
- 支持清空历史记录

## 📡 API 文档

### POST /api/generate (文生图)

```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "zimage-turbo",
    "prompt": "a beautiful sunset over mountains",
    "negative_prompt": "blurry, low quality",
    "aspect_ratio": "16:9",
    "n": 2,
    "seed": 12345
  }'
```

**响应:**
```json
{
  "success": true,
  "model": "zimage-turbo",
  "images": [
    { "url": "https://..." },
    { "url": "https://..." }
  ],
  "timestamp": 1707734400000
}
```

### POST /api/img2img (图生图)

```bash
curl -X POST https://your-worker.workers.dev/api/img2img \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux2klein",
    "prompt": "change to winter scene with snow",
    "image": "https://example.com/image.jpg",
    "strength": 0.75,
    "negative_prompt": "blurry"
  }'
```

### GET /api/models (模型列表)

```bash
curl https://your-worker.workers.dev/api/models
```

### GET /health (健康检查)

```bash
curl https://your-worker.workers.dev/health
```

## 🎯 提示词模板

### 1. 人物肖像
```
portrait of a person, detailed face, professional lighting, high quality
```

### 2. 风景
```
beautiful landscape, mountains, sunset, vibrant colors, 8k
```

### 3. 动漫风格
```
anime style illustration, colorful, detailed, high quality
```

### 4. 写实风格
```
photorealistic, ultra detailed, professional photography, 8k
```

### 5. 科幻场景
```
cyberpunk city, neon lights, futuristic, detailed, cinematic
```

### 6. 梦幻场景
```
dreamy atmosphere, soft lighting, magical, fantasy world
```

## 🎨 UI 功能详解

### 模式切换
- **文生图** - 📝 从零创作，输入描述即可生成
- **图生图** - 🖼️ 上传图片，基于原图修改

### 模型选择
- **Z-Image Turbo** - ⚡ 极快（2-5秒），适合快速预览
- **Flux 2 Klein** - 🚀 中速（5-10秒），质量更高

### 比例选择
每个比例都有适用场景提示：
- **1:1** 正方形 - 社交媒体
- **16:9** 横向宽屏 - YouTube
- **9:16** 竖向全屏 - Stories
- **4:3** 传统横向 - 演示文稿
- **3:4** 传统竖向 - 海报
- **21:9** 超宽屏 - 电影
- **3:2** 经典照片 - 摄影
- **2:3** 肖像 - 人像

### 高级选项
- **随机种子** - 控制生成的随机性，相同种子+提示词=相似结果
- **负向提示词** - 指定不想要的元素，提高生成质量

## 💡 使用技巧

### 提示词编写
1. **具体描述** - 详细描述主题、风格、光线、颜色
2. **质量词** - 添加 "high quality", "detailed", "8k" 等
3. **风格词** - 指定艺术风格，如 "anime", "realistic", "oil painting"
4. **负向词** - 排除 "blurry", "low quality", "distorted" 等

### 图生图技巧
- **低强度 (0.5-0.6)** - 轻微修改，保留原图大部分细节
- **中强度 (0.7-0.8)** - 适度修改，平衡原图和创意
- **高强度 (0.9-1.0)** - 大幅修改，创造性更强

### 批量生成
- 同时生成多张可以对比效果
- 建议先生成 2 张预览，满意后再生成 4 张

## 🔧 高级配置

### 环境变量
```bash
# 设置 API Key（可选）
wrangler secret put API_KEY
```

### 自定义域名
在 `wrangler.toml` 添加：
```toml
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### Vite 代理配置
`frontend/vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'https://your-worker.workers.dev',
    changeOrigin: true
  }
}
```

## 📁 项目结构

```
nsfwlover-enhanced-ui/
├── src/
│   └── index.ts              # Cloudflare Worker
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImageGenerator.tsx    # 主组件
│   │   │   └── ImageGenerator.css    # 样式
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── wrangler.toml
├── package.json
└── README.md
```

## 🐛 故障排除

### KV 命名空间错误
```
Error: MODELS_CACHE is not defined
```
**解决:** 运行 `wrangler kv:namespace create MODELS_CACHE` 并更新 ID

### CORS 错误
确保 Worker 已正确设置 CORS headers（已内置）

### 图片上传失败
检查图片大小（最大 10MB）和格式（JPG/PNG/WEBP）

## 📝 更新日志

### v2.0.0 (2026-02-12)
- ✨ 全新增强版 UI 界面
- 📜 历史记录功能
- 📝 提示词模板
- ⚙️ 高级选项（种子、负向提示词）
- 🎨 现代化设计（渐变、动画、卡片）
- 📱 完整响应式支持

### v1.0.0
- ✅ 基础文生图功能
- ✅ 图生图功能
- ✅ 批量生成
- ✅ 多种比例

## 📄 许可证

MIT License

## 🙏 致谢

- API: NSFWLover
- 框架: React, Vite, Cloudflare Workers
- 设计灵感: Modern UI/UX Best Practices
