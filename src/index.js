export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cookie = '__Host-next-auth.csrf-token=586235cacc756c46c6206b84e3d9735ae3bdc1c67f74a9289492aa21b516abb5%7C3512b4c3a60ee93559e8459c4a3a8b81f93b8dde39d5136476f1a2bf1fec0cb7; __Secure-next-auth.callback-url=https%3A%2F%2Fwww.nsfwlover.com%2Flogin-callback%3FcallbackUrl%3Dhttps%253A%252F%252Fwww.nsfwlover.com%252Fnsfw-ai-image-generator; __Secure-next-auth.session-token=b1c3a341-df2a-4ae6-b779-adc912bf5417; ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=%7B%22distinct_id%22%3A%22cmlcbhd280dield0pz1tlfzvk%22%2C%22%24sesid%22%3A%5B1770920426067%2C%22019c5315-2d05-7f5e-8e21-ec704e5be09e%22%2C1770920422661%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Faccounts.google.com%2F%22%2C%22u%22%3A%22https%3A%2F%2Fwww.nsfwlover.com%2Flogin-callback%3FcallbackUrl%3Dhttps%253A%252F%252Fwww.nsfwlover.com%252Fnsfw-image-edit%22%7D%7D
';

    // 處理 CORS 預檢
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // UI 介面
    if (url.pathname === '/' || url.pathname === '/ui') {
      return new Response(HTML_UI, { 
        headers: { 'Content-Type': 'text/html;charset=UTF-8' } 
      });
    }

    // OpenAI 相容端點
    if (url.pathname === '/v1/images/generations' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { prompt, size = '1024x1024', n = 1, response_format = 'b64_json' } = body;

        if (!prompt) {
          return Response.json({ error: 'prompt is required' }, { status: 400 });
        }

        // 尺寸轉比例映射
        const ratioMap = {
          '1024x1024': '1:1',
          '1792x1024': '16:9',
          '1024x1792': '9:16',
          '512x512': '1:1',
          '1024x576': '16:9'
        };
        const aspect_ratio = ratioMap[size] || '1:1';

        // 呼叫 nsfwlover API
        const nsfwBody = JSON.stringify({ 
          prompt: prompt,
          aspect_ratio: aspect_ratio 
        });

        const nsfwResponse = await fetch('https://www.nsfwlover.com/api/image/generation/zimage-turbo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://www.nsfwlover.com',
            'Referer': 'https://www.nsfwlover.com/nsfw-ai-image-generator'
          },
          body: nsfwBody
        });

        if (!nsfwResponse.ok) {
          throw new Error(`API returned ${nsfwResponse.status}`);
        }

        const nsfwData = await nsfwResponse.json();
        
        // 處理回應格式 (可能是 data.images[0], data.url, 或 data.image_url)
        let imageUrl = nsfwData.data?.images?.[0] || 
                       nsfwData.data?.url || 
                       nsfwData.data?.image_url ||
                       nsfwData.url ||
                       nsfwData.image_url;

        if (!imageUrl) {
          // 若為非同步任務，返回任務 ID
          if (nsfwData.task_id || nsfwData.data?.task_id) {
            return Response.json({
              error: 'Async generation not fully implemented',
              task_id: nsfwData.task_id || nsfwData.data.task_id
            }, { status: 202 });
          }
          throw new Error('No image URL in response');
        }

        // 下載圖片並轉 base64
        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) {
          throw new Error('Failed to fetch generated image');
        }

        const imgBuffer = await imgResp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

        // OpenAI 格式回應
        return Response.json({
          created: Math.floor(Date.now() / 1000),
          data: [{
            b64_json: response_format === 'b64_json' ? b64 : undefined,
            url: response_format === 'url' ? imageUrl : undefined,
            revised_prompt: prompt
          }]
        }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        });

      } catch (error) {
        return Response.json({
          error: {
            message: error.message,
            type: 'api_error',
            code: 'generation_failed'
          }
        }, { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 健康檢查
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'zimage-turbo-proxy' });
    }

    return new Response('Not Found', { status: 404 });
  }
};

const HTML_UI = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Z-Image Turbo OpenAI Proxy</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 800px;
      width: 100%;
      padding: 40px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 14px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #555;
      font-weight: 600;
      font-size: 14px;
    }
    textarea {
      width: 100%;
      height: 120px;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 15px;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.3s;
    }
    textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .controls {
      display: flex;
      gap: 15px;
      margin: 20px 0;
      flex-wrap: wrap;
    }
    select {
      flex: 1;
      min-width: 150px;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 15px;
      background: white;
      cursor: pointer;
      transition: border-color 0.3s;
    }
    select:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      flex: 1;
      min-width: 150px;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #result {
      margin-top: 30px;
    }
    #result img {
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      animation: fadeIn 0.5s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #667eea;
      font-size: 16px;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .error {
      background: #fee;
      color: #c33;
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
      border-left: 4px solid #c33;
    }
    .info {
      background: #f0f4ff;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #555;
      border-left: 4px solid #667eea;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎨 Z-Image Turbo 圖片生成器</h1>
    <p class="subtitle">OpenAI 相容 API 代理站 | 支援中英文提示詞</p>
    
    <div class="info">
      <strong>使用說明：</strong>輸入詳細的圖片描述，選擇尺寸比例後點擊生成。支援 OpenAI API 格式調用 <code>/v1/images/generations</code>
    </div>

    <label for="prompt">提示詞 (Prompt)</label>
    <textarea id="prompt" placeholder="例如：A beautiful sunset over the ocean with vibrant orange and pink colors, photorealistic, 4k quality"></textarea>

    <div class="controls">
      <select id="size">
        <option value="1024x1024">正方形 1:1 (1024×1024)</option>
        <option value="1792x1024">橫向 16:9 (1792×1024)</option>
        <option value="1024x1792">直向 9:16 (1024×1792)</option>
      </select>
      <button onclick="generate()" id="genBtn">🚀 生成圖片</button>
    </div>

    <div id="result"></div>
  </div>

  <script>
    async function generate() {
      const prompt = document.getElementById('prompt').value.trim();
      const size = document.getElementById('size').value;
      const resultDiv = document.getElementById('result');
      const btn = document.getElementById('genBtn');

      if (!prompt) {
        resultDiv.innerHTML = '<div class="error">❌ 請輸入提示詞</div>';
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ 生成中...';
      resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div>正在生成圖片，請稍候...</div>';

      try {
        const response = await fetch('/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'zimage-turbo',
            prompt: prompt,
            size: size,
            n: 1,
            response_format: 'b64_json'
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || '生成失敗');
        }

        if (data.data && data.data[0].b64_json) {
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + data.data[0].b64_json;
          img.alt = prompt;
          resultDiv.innerHTML = '';
          resultDiv.appendChild(img);
        } else {
          throw new Error('未收到圖片數據');
        }
      } catch (error) {
        resultDiv.innerHTML = \`<div class="error">❌ 錯誤：\${error.message}</div>\`;
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 生成圖片';
      }
    }

    // Enter 鍵提交
    document.getElementById('prompt').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        generate();
      }
    });
  </script>
</body>
</html>`;
