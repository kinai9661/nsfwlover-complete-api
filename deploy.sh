#!/bin/bash
echo "🚀 部署 Worker..."
npm install && wrangler deploy
echo "✅ 完成！记得修改 HTML 中的 API_BASE"
