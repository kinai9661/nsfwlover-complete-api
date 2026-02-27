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
    if (url.pathname === '/health') return Response.json({ status: 'ok', version: '1.6' }, { headers: cors });
    if (url.pathname === '/v1/models') return Response.json({
      object: 'list',
      data: [{ id: 'zimage-turbo', object: 'model', owned_by: 'nsfwlover' }]
    }, { headers: cors });
    if (url.pathname === '/v1/images/generations') return handleGeneration(request, env, cors);
    if (url.pathname === '/debug') return handleDebug(request, env, cors);
    return new Response('Not Found', { status: 404, headers: cors });
  }
};

function buildCookie(env, overrides = {}) {
  const session = overrides.session || env.SESSION_TOKEN || '';
  const posthog = overrides.posthog || env.POSTHOG_COOKIE || '';
  let cookie = '';
  if (session) cookie += `__Secure-next-auth.session-token=${session}; `;
  if (posthog) cookie += `ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=${posthog}`;
  return cookie.trim().replace(/;$/, '');
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
  const {
    prompt, n = 1, size = '512x768',
    negative_prompt = '', steps = 30, seed = -1,
    // cookie overrides from UI
    _session_token = '', _posthog_cookie = ''
  } = body;

  if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400, headers: cors });

  const [width, height] = size.split('x').map(Number);
  const cookie = buildCookie(env, {
    session: _session_token || undefined,
    posthog: _posthog_cookie || undefined
  });

  console.log('[COOKIE] using session:', _session_token ? 'UI override' : 'env secret');

  try {
    const createResp = await fetch(env.TARGET_CREATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nsfwlover.com/nsfw-ai-image-generator',
        'Origin': 'https://www.nsfwlover.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
      },
      body: JSON.stringify({ prompt, negative_prompt, steps, width, height, seed, n: Math.min(n, 4) })
    });

    const createRaw = await createResp.text();
    console.log('[CREATE] status:', createResp.status, 'body:', createRaw.slice(0, 300));
    if (!createResp.ok) throw new Error(`Create failed ${createResp.status}: ${createRaw.slice(0, 200)}`);

    let createData;
    try { createData = JSON.parse(createRaw); } catch (_) {
      throw new Error(`JSON parse error: ${createRaw.slice(0, 100)}`);
    }

    const promptId = createData?.prompt_id || createData?.task_id || createData?.id || null;
    if (!promptId) throw new Error(`No prompt_id: ${JSON.stringify(createData).slice(0, 200)}`);
    console.log('[CREATE] prompt_id:', promptId);

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResp = await fetch(`${env.TARGET_POLL}?prompt_id=${promptId}`, {
        headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
      });
      const pollRaw = await pollResp.text();
      console.log(`[POLL ${i}] status:`, pollResp.status, 'preview:', pollRaw.slice(0, 150));
      if (!pollResp.ok) continue;

      let pollData;
      try { pollData = JSON.parse(pollRaw); } catch (_) { continue; }

      const status = pollData?.status;
      if (status === 'failed') throw new Error(pollData?.error || 'Generation failed');
      if (status === 'completed' || status === 'success') {
        let b64 = pollData?.image || pollData?.data?.[0]?.image || pollData?.result?.image || pollData?.output?.[0] || null;
        if (!b64) throw new Error(`No image. Keys: ${Object.keys(pollData || {}).join(',')}`);
        if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
        return Response.json({
          created: Math.floor(Date.now() / 1000),
          data: Array.from({ length: Math.min(n, 4) }, () => ({ b64_json: b64, revised_prompt: prompt }))
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
<title>NSFWLover AI 生圖工具 v1.6</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;padding:20px;}
.container{max-width:960px;margin:auto;}
h1{text-align:center;padding:20px 0;color:#a78bfa;font-size:1.6rem;}
.tabs{display:flex;gap:8px;margin-bottom:15px;}
.tab{padding:10px 20px;border-radius:8px 8px 0 0;cursor:pointer;background:#0f3460;color:#a0a0c0;font-weight:600;border:none;font-size:.9rem;}
.tab.active{background:#16213e;color:#a78bfa;border-bottom:2px solid #a78bfa;}
.panel{background:#16213e;border-radius:0 12px 12px 12px;padding:20px;margin-bottom:20px;display:none;}
.panel.active{display:block;}
label{display:block;margin-bottom:5px;color:#a78bfa;font-size:.85rem;font-weight:600;}
input,select,textarea{width:100%;padding:11px;border:1px solid #2d2d5e;border-radius:8px;background:#0f3460;color:#e0e0e0;font-size:.9rem;margin-bottom:12px;}
input:focus,textarea:focus{outline:none;border-color:#7c3aed;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:700;transition:opacity .2s;}
.btn:hover{opacity:.88;} .btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-sm{padding:8px 14px;font-size:.82rem;border-radius:6px;border:none;cursor:pointer;font-weight:600;}
.btn-green{background:#059669;color:white;}
.btn-red{background:#dc2626;color:white;}
.btn-gray{background:#374151;color:#d1d5db;}
#status{padding:12px;border-radius:8px;margin:12px 0;font-weight:600;text-align:center;display:none;}
.progress{width:100%;height:6px;background:#2d2d5e;border-radius:3px;overflow:hidden;margin:10px 0;display:none;}
.progress-bar{height:100%;background:linear-gradient(90deg,#7c3aed,#00c851);transition:width .5s;}
#result{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:15px;margin-top:15px;}
.img-card{background:#0f3460;border-radius:10px;overflow:hidden;text-align:center;}
.img-card img{width:100%;display:block;}
.img-card a{display:inline-block;margin:8px;padding:6px 14px;background:#7c3aed;color:white;text-decoration:none;border-radius:5px;font-size:.8rem;}
.cookie-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;}
.cookie-row input{margin-bottom:0;flex:1;}
.status-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;}
.dot-green{background:#10b981;} .dot-red{background:#ef4444;} .dot-yellow{background:#f59e0b;}
#apiout{background:#0f3460;border-radius:8px;padding:12px;font-size:.78rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow-y:auto;}
.info-box{background:#0f3460;border:1px solid #2d2d5e;border-radius:8px;padding:12px;margin-bottom:12px;font-size:.82rem;color:#94a3b8;line-height:1.6;}
.info-box b{color:#a78bfa;}
@media(max-width:600px){.grid2,.grid3{grid-template-columns:1fr;}.tabs{flex-wrap:wrap;}}
</style>
</head>
<body>
<div class="container">
<h1>🖼️ NSFWLover AI 生圖工具 <span style="font-size:.75rem;color:#6b7280">v1.6 · OpenAI 相容</span></h1>

<div class="tabs">
  <button class="tab active" onclick="switchTab('gen')">🎨 生圖</button>
  <button class="tab" onclick="switchTab('cookie')">🍪 Cookie 設置</button>
  <button class="tab" onclick="switchTab('api')">🔌 API 文檔</button>
</div>

<!-- 生圖面板 -->
<div class="panel active" id="tab-gen">
  <label>正向提示詞</label>
  <textarea id="prompt" rows="3" placeholder="1girl, solo, nsfw, masterpiece, best quality, detailed">1girl, solo, nsfw, masterpiece, best quality</textarea>
  <label>負向提示詞</label>
  <input id="negative" value="blurry, lowres, ugly, deformed, watermark">
  <div class="grid3">
    <div><label>寬度</label><input id="width" type="number" value="512"></div>
    <div><label>高度</label><input id="height" type="number" value="768"></div>
    <div><label>步數 (10-50)</label><input id="steps" type="number" value="30" min="10" max="50"></div>
    <div><label>種子 (-1=隨機)</label><input id="seed" type="number" value="-1"></div>
    <div><label>比例</label>
      <select id="aspect" onchange="applyAspect(this.value)">
        <option value="9:16">9:16 (直)</option>
        <option value="1:1">1:1 (正方)</option>
        <option value="16:9">16:9 (橫)</option>
        <option value="4:3">4:3</option>
        <option value="3:2">3:2</option>
      </select>
    </div>
    <div><label>張數 (1-4)</label><input id="n" type="number" value="1" min="1" max="4"></div>
  </div>
  <div id="cookie-status" style="padding:8px 12px;background:#0f3460;border-radius:6px;margin-bottom:12px;font-size:.82rem;">
    <span class="status-dot dot-yellow"></span>Cookie 狀態：檢查中...
  </div>
  <button class="btn" id="genBtn" onclick="generate()">🚀 開始生成</button>
</div>

<!-- Cookie 面板 -->
<div class="panel" id="tab-cookie">
  <div class="info-box">
    <b>📌 如何取得 Cookie：</b><br>
    1. 登入 <a href="https://www.nsfwlover.com" target="_blank" style="color:#a78bfa;">nsfwlover.com</a><br>
    2. 按 F12 → Network → 觸發生圖<br>
    3. 找 <b>/api/image/generation/zimage-turbo</b> 請求<br>
    4. Headers → 複製 <b>Cookie</b> 欄各值貼下方
  </div>

  <label>Session Token (<b>__Secure-next-auth.session-token</b> 的值)</label>
  <div class="cookie-row">
    <input type="password" id="sessionToken" placeholder="0.eFZ1suTw... 完整 token">
    <button class="btn-sm btn-green" onclick="toggleVis('sessionToken')">👁 顯示</button>
    <button class="btn-sm btn-red" onclick="clearField('sessionToken')">✕</button>
  </div>

  <label>PostHog Cookie (<b>ph_phc_VrIqTc5B...</b> 的值，URL encoded)</label>
  <div class="cookie-row">
    <input type="password" id="posthogCookie" placeholder="%7B%22distinct_id%22%3A%22...%22%7D">
    <button class="btn-sm btn-green" onclick="toggleVis('posthogCookie')">👁 顯示</button>
    <button class="btn-sm btn-red" onclick="clearField('posthogCookie')">✕</button>
  </div>

  <div class="grid2" style="margin-bottom:12px;">
    <button class="btn-sm btn-green btn" onclick="saveCookies()" style="width:100%">💾 儲存到 LocalStorage</button>
    <button class="btn-sm btn-gray btn" onclick="clearCookies()" style="width:100%">🗑️ 清除所有</button>
  </div>

  <label>Cookie 預覽（傳送給 API）</label>
  <div id="cookiePreview" style="background:#0f3460;border-radius:6px;padding:10px;font-size:.75rem;color:#94a3b8;word-break:break-all;min-height:40px;border:1px solid #2d2d5e;">
    (空白 = 使用後端 Secrets)
  </div>
  <div style="margin-top:12px;">
    <button class="btn-sm btn-green" onclick="testCookies()">🧪 測試 Cookie 有效性</button>
    <span id="testResult" style="margin-left:10px;font-size:.85rem;"></span>
  </div>
</div>

<!-- API 文檔面板 -->
<div class="panel" id="tab-api">
  <div class="info-box">
    <b>POST /v1/images/generations</b><br>
    Authorization: Bearer sk-任意值<br><br>
    <b>Request Body (JSON):</b><br>
    model: "zimage-turbo"<br>
    prompt: "1girl, nsfw, masterpiece"<br>
    n: 1 (1-4)<br>
    size: "512x768"<br>
    steps: 30<br>
    seed: -1<br>
    negative_prompt: "blurry"<br>
    _session_token: "可選，覆蓋後端 Secret"<br>
    _posthog_cookie: "可選，覆蓋後端 Secret"
  </div>
  <div class="info-box">
    <b>GET /v1/models</b> — 列出可用模型<br>
    <b>GET /health</b> — 健康檢查<br>
    <b>GET /debug?prompt_id=xxx</b> — 輪詢除錯
  </div>
  <div class="info-box">
    <b>Response:</b><br>
    {"created": 1234567890, "data": [{"b64_json": "iVBOR...", "revised_prompt": "..."}]}
  </div>
  <label>curl 範例</label>
  <div id="curlExample" style="background:#0f3460;border-radius:6px;padding:12px;font-size:.75rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all;"></div>
</div>

<!-- 共用結果區 -->
<div id="status"></div>
<div class="progress" id="progress"><div class="progress-bar" id="pbar" style="width:0%"></div></div>
<div id="result"></div>
<details style="margin-top:15px;"><summary style="cursor:pointer;color:#6b7280;font-size:.85rem;">📋 API 原始回應 (除錯)</summary><div id="apiout" style="margin-top:8px;"></div></details>
</div>

<script>
const STORAGE_KEY = 'nsfwlover_cookies';

// 初始化
window.onload = () => {
  loadCookies(); updateCookiePreview(); updateCookieStatus(); buildCurlExample();
  applyAspect('9:16');
};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
  if (name === 'api') buildCurlExample();
}

function applyAspect(v) {
  const map = {'1:1':[512,512],'9:16':[512,768],'16:9':[768,512],'4:3':[640,480],'3:2':[768,512]};
  const [w,h] = map[v] || [512,768];
  document.getElementById('width').value = w;
  document.getElementById('height').value = h;
}

function toggleVis(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}
function clearField(id) { document.getElementById(id).value = ''; updateCookiePreview(); }

function saveCookies() {
  const data = { session: document.getElementById('sessionToken').value, posthog: document.getElementById('posthogCookie').value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  updateCookiePreview(); updateCookieStatus();
  alert('✅ Cookie 已儲存到 LocalStorage！');
}

function loadCookies() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (data.session) document.getElementById('sessionToken').value = data.session;
    if (data.posthog) document.getElementById('posthogCookie').value = data.posthog;
  } catch(_) {}
}

function clearCookies() {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById('sessionToken').value = '';
  document.getElementById('posthogCookie').value = '';
  updateCookiePreview(); updateCookieStatus();
}

function getCookieValues() {
  return {
    session: document.getElementById('sessionToken').value.trim(),
    posthog: document.getElementById('posthogCookie').value.trim()
  };
}

function updateCookiePreview() {
  const { session, posthog } = getCookieValues();
  let preview = '';
  if (session) preview += '__Secure-next-auth.session-token=' + session.slice(0,20) + '...; ';
  if (posthog) preview += 'ph_phc_...=' + posthog.slice(0,20) + '...';
  document.getElementById('cookiePreview').textContent = preview || '(空白 = 使用後端 Secrets)';
}

function updateCookieStatus() {
  const { session } = getCookieValues();
  const el = document.getElementById('cookie-status');
  if (session) {
    el.innerHTML = '<span class="status-dot dot-green"></span>Cookie 已設置（UI 覆蓋）';
  } else {
    el.innerHTML = '<span class="status-dot dot-yellow"></span>使用後端 Wrangler Secrets';
  }
}

async function testCookies() {
  const result = document.getElementById('testResult');
  result.textContent = '⏳ 測試中...'; result.style.color = '#f59e0b';
  try {
    const res = await fetch('/health'); const data = await res.json();
    result.textContent = '✅ Worker 正常 v' + data.version; result.style.color = '#10b981';
  } catch(e) {
    result.textContent = '❌ 連線失敗: ' + e.message; result.style.color = '#ef4444';
  }
}

function buildCurlExample() {
  const { session } = getCookieValues();
  const override = session ? ',\n  "_session_token": "' + session.slice(0,15) + '..."' : '';
  document.getElementById('curlExample').textContent =
    'curl -X POST ' + location.origin + '/v1/images/generations \\\n' +
    '  -H "Content-Type: application/json" \\\n' +
    '  -H "Authorization: Bearer sk-test" \\\n' +
    '  -d \'{\n  "model": "zimage-turbo",\n  "prompt": "1girl, nsfw, masterpiece",\n  "n": 1,\n  "size": "512x768"' + override + '\n}\'';
}

async function generate() {
  const btn = document.getElementById('genBtn'); btn.disabled = true; btn.textContent = '⏳ 生成中...';
  const statusEl = document.getElementById('status'); const prog = document.getElementById('progress'); const pbar = document.getElementById('pbar');
  const resultEl = document.getElementById('result'); const apiout = document.getElementById('apiout');
  statusEl.style.display = 'block'; prog.style.display = 'block'; resultEl.innerHTML = '';
  statusEl.style.color = '#a78bfa'; statusEl.textContent = '📤 創建生圖任務...';

  const { session, posthog } = getCookieValues();

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
    if (session) body._session_token = session;
    if (posthog) body._posthog_cookie = posthog;

    pbar.style.width = '10%'; statusEl.textContent = '🔄 輪詢任務進度（最多 10 分鐘）...';
    const res = await fetch('/v1/images/generations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-nsfwlover' },
      body: JSON.stringify(body)
    });
    pbar.style.width = '90%';
    const data = await res.json();
    apiout.textContent = JSON.stringify(data, null, 2);
    if (data.error) throw new Error(data.error);

    resultEl.innerHTML = data.data.map((img, i) =>
      '<div class="img-card"><img src="data:image/png;base64,' + img.b64_json + '" loading="lazy"><a href="data:image/png;base64,' + img.b64_json + '" download="nsfwlover_' + i + '.png">💾 下載 PNG</a></div>'
    ).join('');
    pbar.style.width = '100%'; statusEl.textContent = '✅ 生成完成！' + data.data.length + ' 張'; statusEl.style.color = '#10b981';
  } catch (e) {
    statusEl.textContent = '❌ 錯誤：' + e.message; statusEl.style.color = '#ef4444';
    apiout.textContent = e.stack;
  }
  btn.disabled = false; btn.textContent = '🚀 開始生成'; prog.style.display = 'none';
}

document.getElementById('sessionToken').addEventListener('input', () => { updateCookiePreview(); updateCookieStatus(); });
document.getElementById('posthogCookie').addEventListener('input', updateCookiePreview);
</script>
</body></html>`;
