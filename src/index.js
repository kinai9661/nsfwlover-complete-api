export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // UI 頁面
    if (url.pathname === '/') {
      return new Response(HTML_UI, {
        headers: { ...cors, 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    // OpenAI /v1/models
    if (url.pathname === '/v1/models') {
      return Response.json({
        object: 'list',
        data: [
          {
            id: 'zimage-turbo',
            object: 'model',
            owned_by: 'nsfwlover',
            availability: 'available'
          }
        ]
      }, { headers: cors });
    }

    // OpenAI /v1/images/generations (相容核心)
    if (url.pathname === '/v1/images/generations') {
      return handleGeneration(request, env, cors);
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};

const HTML_UI = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>🖼️ NSFWLover UI 生圖工具 (OpenAI 相容)</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:20px;background:#f5f5f5;max-width:900px;margin:auto;}
    form{display:grid;gap:15px;}
    input,select,textarea{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;font-size:16px;}
    button{background:#007bff;color:white;border:none;padding:15px;border-radius:8px;font-size:16px;cursor:pointer;transition:background .2s;}
    button:hover{background:#0056b3;} button:disabled{background:#ccc;cursor:not-allowed;}
    #status{padding:15px;border-radius:8px;margin:15px 0;font-weight:bold;}
    #result img{max-width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
    #progress{width:100%;height:20px;background:#e0e0e0;border-radius:10px;overflow:hidden;margin:10px 0;}
    #progress-bar{height:100%;background:linear-gradient(90deg,#007bff,#00c851);transition:width .3s;}
    @media(max-width:768px){body{padding:10px;}}
  </style>
</head>
<body>
  <h1>🖼️ NSFWLover AI 圖像生成器</h1>
  <p>OpenAI 相容 API：POST /v1/images/generations (Bearer sk-任意)</p>
  <form id="genForm">
    <textarea id="prompt" rows="3" placeholder="輸入提示詞，例如：1girl, solo, nsfw, masterpiece">1girl, solo, nsfw, masterpiece, best quality</textarea>
    <input id="negative" placeholder="負提示 (選填)">blurry, lowres, ugly, deformed
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <input id="steps" type="number" min="10" max="50" value="30" placeholder="步數">
      <input id="seed" type="number" placeholder="種子 (-1 隨機)">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <input id="width" type="number" value="512" placeholder="寬度">
      <input id="height" type="number" value="768" placeholder="高度">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <select id="aspect"><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option></select>
      <input id="n" type="number" min="1" max="4" value="1" placeholder="圖數">
    </div>
    <button type="submit">🚀 生成圖像 (OpenAI 模式)</button>
  </form>
  <div id="status" style="color:#007bff;">就緒 - 輸入提示詞開始生成</div>
  <div id="progress" style="display:none;"><div id="progress-bar"></div></div>
  <div id="result"></div>
  <script>
    document.getElementById('genForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '生成中...';
      const statusEl = document.getElementById('status'); const progressEl = document.getElementById('progress'); const resultEl = document.getElementById('result');
      statusEl.textContent = '📤 發送 OpenAI 請求...'; statusEl.style.color = '#007bff'; progressEl.style.display = 'block'; resultEl.innerHTML = '';
      
      try {
        const body = {
          model: 'zimage-turbo',
          prompt: document.getElementById('prompt').value,
          negative_prompt: document.getElementById('negative').value,
          n: parseInt(document.getElementById('n').value),
          size: \`\${document.getElementById('width').value}x\${document.getElementById('height').value}\`,
          steps: parseInt(document.getElementById('steps').value),
          seed: parseInt(document.getElementById('seed').value) || -1
        };
        const res = await fetch('/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-test' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        const b64 = data.data[0].b64_json;
        const img = new Image(); img.src = 'data:image/png;base64,' + b64;
        img.onload = () => {
          resultEl.innerHTML = img.outerHTML + '<br><a href="' + img.src + '" download="nsfwlover.png" style="display:inline-block;margin:10px;padding:10px;background:#28a745;color:white;text-decoration:none;border-radius:5px;">💾 下載 PNG</a>';
          statusEl.textContent = '✅ OpenAI 相容生成完成!'; statusEl.style.color = 'green';
        };
        document.getElementById('progress-bar').style.width = '100%';
      } catch (e) {
        statusEl.textContent = '❌ 錯誤: ' + e.message; statusEl.style.color = 'red';
      }
      btn.disabled = false; btn.textContent = '🚀 生成圖像 (OpenAI 模式)'; progressEl.style.display = 'none';
    });
  </script>
</body>
</html>`;

async function handleGeneration(request, env, cors) {
  const body = await request.json();
  const { prompt, n = 1, size = '512x768', negative_prompt = '', steps = 30, seed = -1 } = body;
  if (!prompt) return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

  const [width, height] = size.split('x').map(Number);
  const cookie = `ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=${env.POSTHOG_COOKIE || ''}${env.SESSION_TOKEN ? '; __Secure-next-auth.session-token=' + env.SESSION_TOKEN : ''}`;

  try {
    // 創建任務
    const createResp = await fetch(env.TARGET_CREATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (compatible; OpenAI-Proxy/1.3)'
      },
      body: JSON.stringify({
        prompt,
        negative_prompt,
        steps,
        width,
        height,
        seed,
        n: Math.min(n, 4)
      })
    });

    if (!createResp.ok) {
      const err = await createResp.text();
      throw new Error(`Create API: ${createResp.status} - ${err}`);
    }
    const createData = await createResp.json();
    const promptId = createData.prompt_id || createData.task_id || `gen-${Date.now()}`;

    // 輪詢至完成 (OpenAI sync-like)
    let pollData;
    const maxAttempts = 120; // 10min
    for (let i = 0; i < maxAttempts; i++) {
      const pollResp = await fetch(`${env.TARGET_POLL}?prompt_id=${promptId}`, {
        headers: { 'Cookie': cookie }
      });
      if (!pollResp.ok) throw new Error(`Poll ${i}: ${pollResp.status}`);
      pollData = await pollResp.json();

      if (pollData.status === 'completed') {
        const b64 = pollData.image?.startsWith('data:image') ? pollData.image.split(',')[1] : pollData.image;
        if (!b64) throw new Error('No image in response');
        return Response.json({
          created: Date.now(),
          data: Array(n).fill().map((_, idx) => ({
            b64_json: b64,  // 重複 n 次或多 b64
            revised_prompt: prompt,
            seed: seed === -1 ? Math.floor(Math.random() * 2**32) : seed
          }))
        }, { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (pollData.status === 'failed') throw new Error(pollData.error || 'Generation failed');
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Generation timeout (10min)');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}
