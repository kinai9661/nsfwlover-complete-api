export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/') return new Response(HTML_UI, { headers: { ...cors, 'Content-Type': 'text/html;charset=UTF-8' } });
    if (url.pathname === '/health') return Response.json({ status: 'ok', version: '1.5' }, { headers: cors });
    if (url.pathname === '/v1/models') return Response.json({
      object: 'list',
      data: [{ id: 'zimage-turbo', object: 'model', owned_by: 'nsfwlover' }]
    }, { headers: cors });
    if (url.pathname === '/v1/images/generations') return handleGeneration(request, env, cors);
    if (url.pathname === '/debug') return handleDebug(request, env, cors);
    return new Response('Not Found', { status: 404, headers: cors });
  }
};

function buildCookie(env) {
  const posthog = env.POSTHOG_COOKIE || '';
  const session = env.SESSION_TOKEN ? `; __Secure-next-auth.session-token=${env.SESSION_TOKEN}` : '';
  return `ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=${posthog}${session}`;
}

async function handleDebug(request, env, cors) {
  const url = new URL(request.url);
  const promptId = url.searchParams.get('prompt_id');
  if (!promptId) return Response.json({ error: 'Missing prompt_id' }, { status: 400, headers: cors });
  const cookie = buildCookie(env);
  const pollResp = await fetch(`${env.TARGET_POLL}?prompt_id=${promptId}`, {
    headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
  });
  const raw = await pollResp.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  return Response.json({ status: pollResp.status, raw_preview: raw.slice(0, 500), parsed }, { headers: cors });
}

async function handleGeneration(request, env, cors) {
  let body;
  try { body = await request.json(); } catch (_) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
  }
  const { prompt, n = 1, size = '512x768', negative_prompt = '', steps = 30, seed = -1 } = body;
  if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400, headers: cors });

  const parts = size.split('x');
  const width = parseInt(parts[0]) || 512;
  const height = parseInt(parts[1]) || 768;
  const cookie = buildCookie(env);

  try {
    // Step 1: 創建任務
    const createResp = await fetch(env.TARGET_CREATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nsfwlover.com/',
        'Origin': 'https://www.nsfwlover.com'
      },
      body: JSON.stringify({ prompt, negative_prompt, steps, width, height, seed, n: Math.min(n, 4) })
    });

    const createRaw = await createResp.text();
    console.log('[CREATE] status:', createResp.status, 'body:', createRaw.slice(0, 300));

    if (!createResp.ok) throw new Error(`Create failed ${createResp.status}: ${createRaw.slice(0, 200)}`);

    let createData;
    try { createData = JSON.parse(createRaw); } catch (_) {
      throw new Error(`Create JSON parse error: ${createRaw.slice(0, 100)}`);
    }

    const promptId = createData?.prompt_id || createData?.task_id || createData?.id || null;
    if (!promptId) throw new Error(`No prompt_id in response: ${JSON.stringify(createData).slice(0, 200)}`);
    console.log('[CREATE] prompt_id:', promptId);

    // Step 2: 輪詢至完成
    let pollData = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResp = await fetch(`${env.TARGET_POLL}?prompt_id=${promptId}`, {
        headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
      });
      const pollRaw = await pollResp.text();
      console.log(`[POLL ${i}] status:`, pollResp.status, 'preview:', pollRaw.slice(0, 200));

      if (!pollResp.ok) { console.error('[POLL] error', pollResp.status); continue; }
      try { pollData = JSON.parse(pollRaw); } catch (_) { continue; }

      const status = pollData?.status;
      if (status === 'failed') throw new Error(pollData?.error || 'Generation failed');
      if (status === 'completed' || status === 'success') {
        // 多層 fallback 取 b64
        let b64 = pollData?.image || pollData?.data?.[0]?.image || pollData?.result?.image || pollData?.output?.[0] || null;
        if (!b64) throw new Error(`Completed but no image. Keys: ${Object.keys(pollData || {}).join(',')}`);
        if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
        return Response.json({
          created: Math.floor(Date.now() / 1000),
          data: Array.from({ length: Math.min(n, 4) }, () => ({
            b64_json: b64,
            revised_prompt: prompt
          }))
        }, { headers: cors });
      }
    }
    throw new Error('Timeout: 10min exceeded');
  } catch (err) {
    console.error('[ERROR]', err.message);
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
}

const HTML_UI = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NSFWLover AI 生圖工具</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;padding:20px;}
.container{max-width:900px;margin:auto;}
h1{text-align:center;padding:20px 0;color:#a78bfa;font-size:1.6rem;}
.panel{background:#16213e;border-radius:12px;padding:20px;margin-bottom:20px;}
label{display:block;margin-bottom:5px;color:#a78bfa;font-size:.9rem;font-weight:600;}
input,select,textarea{width:100%;padding:12px;border:1px solid #2d2d5e;border-radius:8px;background:#0f3460;color:#e0e0e0;font-size:.95rem;margin-bottom:12px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.btn{width:100%;padding:15px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:700;transition:opacity .2s;}
.btn:hover{opacity:.9;} .btn:disabled{opacity:.5;cursor:not-allowed;}
#status{padding:12px;border-radius:8px;margin:12px 0;font-weight:600;text-align:center;}
.progress{width:100%;height:8px;background:#2d2d5e;border-radius:4px;overflow:hidden;margin:10px 0;display:none;}
.progress-bar{height:100%;background:linear-gradient(90deg,#7c3aed,#00c851);transition:width .3s;}
#result{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:15px;}
.img-card{background:#0f3460;border-radius:10px;overflow:hidden;text-align:center;}
.img-card img{width:100%;display:block;}
.img-card a{display:inline-block;margin:10px;padding:8px 16px;background:#7c3aed;color:white;text-decoration:none;border-radius:6px;font-size:.85rem;}
#apiout{background:#0f3460;border-radius:8px;padding:15px;font-size:.8rem;color:#a0a0c0;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;display:none;}
@media(max-width:600px){.grid{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="container">
<h1>🖼️ NSFWLover AI 生圖工具 <span style="font-size:.8rem;color:#6b7280">v1.5 OpenAI 相容</span></h1>
<div class="panel">
  <label>正向提示詞</label>
  <textarea id="prompt" rows="3" placeholder="1girl, solo, nsfw, masterpiece, best quality, detailed">1girl, solo, nsfw, masterpiece, best quality</textarea>
  <label>負向提示詞</label>
  <input id="negative" value="blurry, lowres, ugly, deformed, watermark">
  <div class="grid">
    <div><label>寬度</label><input id="width" type="number" value="512"></div>
    <div><label>高度</label><input id="height" type="number" value="768"></div>
    <div><label>步數</label><input id="steps" type="number" value="30" min="10" max="50"></div>
    <div><label>種子 (-1 隨機)</label><input id="seed" type="number" value="-1"></div>
    <div><label>比例</label>
      <select id="aspect"><option value="1:1">1:1</option><option value="9:16" selected>9:16</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select>
    </div>
    <div><label>張數 (1-4)</label><input id="n" type="number" value="1" min="1" max="4"></div>
  </div>
  <button class="btn" id="genBtn" onclick="generate()">🚀 開始生成</button>
</div>
<div id="status" style="display:none;"></div>
<div class="progress" id="progress"><div class="progress-bar" id="pbar" style="width:0%"></div></div>
<div id="result"></div>
<details style="margin-top:15px;"><summary style="cursor:pointer;color:#6b7280;">📋 API 原始回應</summary><div id="apiout"></div></details>
</div>

<script>
async function generate() {
  const btn = document.getElementById('genBtn'); btn.disabled = true; btn.textContent = '⏳ 生成中...';
  const statusEl = document.getElementById('status'); const prog = document.getElementById('progress'); const pbar = document.getElementById('pbar');
  const resultEl = document.getElementById('result'); const apiout = document.getElementById('apiout');
  statusEl.style.display = 'block'; prog.style.display = 'block'; resultEl.innerHTML = ''; apiout.style.display = 'none';
  statusEl.style.color = '#a78bfa'; statusEl.textContent = '📤 創建生圖任務...';
  try {
    const body = {
      model: 'zimage-turbo',
      prompt: document.getElementById('prompt').value,
      negative_prompt: document.getElementById('negative').value,
      n: parseInt(document.getElementById('n').value),
      size: document.getElementById('width').value + 'x' + document.getElementById('height').value,
      steps: parseInt(document.getElementById('steps').value),
      seed: parseInt(document.getElementById('seed').value)
    };
    pbar.style.width = '20%'; statusEl.textContent = '🔄 輪詢任務進度 (最多 10 分鐘)...';
    const res = await fetch('/v1/images/generations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-nsfwlover' },
      body: JSON.stringify(body)
    });
    pbar.style.width = '90%';
    const data = await res.json();
    apiout.textContent = JSON.stringify(data, null, 2); apiout.style.display = 'block';
    if (data.error) throw new Error(data.error);
    resultEl.innerHTML = data.data.map((img, i) =>
      '<div class="img-card"><img src="data:image/png;base64,' + img.b64_json + '"><a href="data:image/png;base64,' + img.b64_json + '" download="nsfwlover_' + i + '.png">💾 下載</a></div>'
    ).join('');
    pbar.style.width = '100%'; statusEl.textContent = '✅ 生成完成！'; statusEl.style.color = '#00c851';
  } catch (e) {
    statusEl.textContent = '❌ 錯誤：' + e.message; statusEl.style.color = '#ef4444';
    apiout.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = '🚀 開始生成'; prog.style.display = 'none';
}
</script>
</body></html>`;
