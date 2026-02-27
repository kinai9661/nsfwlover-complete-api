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
    if (url.pathname === '/health') return Response.json({ status: 'ok', version: '1.7' }, { headers: cors });
    if (url.pathname === '/v1/models') return Response.json({
      object: 'list',
      data: [{ id: 'zimage-turbo', object: 'model', owned_by: 'nsfwlover' }]
    }, { headers: cors });
    if (url.pathname === '/v1/images/generations') return handleGeneration(request, env, cors);
    if (url.pathname === '/debug') return handleDebug(request, env, cors);
    return new Response('Not Found', { status: 404, headers: cors });
  }
};

function buildCookie(env, sessionOverride, posthogOverride) {
  const session = sessionOverride || env.SESSION_TOKEN || '';
  const posthog = posthogOverride || env.POSTHOG_COOKIE || '';
  let parts = [];
  if (session) parts.push('__Secure-next-auth.session-token=' + session);
  if (posthog) parts.push('ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=' + posthog);
  return parts.join('; ');
}

async function handleDebug(request, env, cors) {
  const url = new URL(request.url);
  const promptId = url.searchParams.get('prompt_id');
  if (!promptId) return Response.json({ error: 'Missing prompt_id' }, { status: 400, headers: cors });
  const cookie = buildCookie(env, '', '');
  const pollResp = await fetch(env.TARGET_POLL + '?prompt_id=' + promptId, {
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

  const prompt = body.prompt || '';
  const n = Math.min(parseInt(body.n) || 1, 4);
  const size = body.size || '512x768';
  const negative_prompt = body.negative_prompt || '';
  const steps = parseInt(body.steps) || 30;
  const seed = parseInt(body.seed) || -1;
  const sessionOverride = body._session_token || '';
  const posthogOverride = body._posthog_cookie || '';

  if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400, headers: cors });

  const parts = size.split('x');
  const width = parseInt(parts[0]) || 512;
  const height = parseInt(parts[1]) || 768;
  const cookie = buildCookie(env, sessionOverride, posthogOverride);

  console.log('[v1.7] cookie session present:', !!(sessionOverride || env.SESSION_TOKEN));

  try {
    const createResp = await fetch(env.TARGET_CREATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nsfwlover.com/nsfw-ai-image-generator',
        'Origin': 'https://www.nsfwlover.com',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify({ prompt, negative_prompt, steps, width, height, seed, n })
    });

    const createRaw = await createResp.text();
    console.log('[CREATE] status:', createResp.status, createRaw.slice(0, 200));
    if (!createResp.ok) throw new Error('Create failed ' + createResp.status + ': ' + createRaw.slice(0, 200));

    let createData;
    try { createData = JSON.parse(createRaw); } catch (_) {
      throw new Error('Parse error: ' + createRaw.slice(0, 100));
    }

    const promptId = createData.prompt_id || createData.task_id || createData.id || null;
    if (!promptId) throw new Error('No prompt_id: ' + JSON.stringify(createData).slice(0, 200));
    console.log('[CREATE] prompt_id:', promptId);

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResp = await fetch(env.TARGET_POLL + '?prompt_id=' + promptId, {
        headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
      });
      const pollRaw = await pollResp.text();
      console.log('[POLL ' + i + '] status:', pollResp.status, pollRaw.slice(0, 100));
      if (!pollResp.ok) continue;

      let pollData;
      try { pollData = JSON.parse(pollRaw); } catch (_) { continue; }

      const status = pollData.status;
      if (status === 'failed') throw new Error(pollData.error || 'Generation failed');
      if (status === 'completed' || status === 'success') {
        let b64 = pollData.image || (pollData.data && pollData.data[0] && pollData.data[0].image) || (pollData.result && pollData.result.image) || null;
        if (!b64) throw new Error('No image found. Keys: ' + Object.keys(pollData).join(','));
        if (b64.indexOf('data:image') === 0) b64 = b64.split(',')[1];
        const dataArr = [];
        for (let j = 0; j < n; j++) dataArr.push({ b64_json: b64, revised_prompt: prompt });
        return Response.json({ created: Math.floor(Date.now() / 1000), data: dataArr }, { headers: cors });
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
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NSFWLover AI v1.7</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1a1a2e;color:#e0e0e0;padding:20px;}
.wrap{max-width:960px;margin:auto;}
h1{text-align:center;color:#a78bfa;padding:16px 0;font-size:1.5rem;}
.tabs{display:flex;gap:6px;margin-bottom:0;}
.tab-btn{padding:10px 18px;background:#0f3460;color:#94a3b8;border:none;border-radius:8px 8px 0 0;cursor:pointer;font-size:.88rem;font-weight:600;}
.tab-btn.on{background:#16213e;color:#a78bfa;border-bottom:2px solid #a78bfa;}
.tab-pane{background:#16213e;border-radius:0 12px 12px 12px;padding:20px;display:none;}
.tab-pane.on{display:block;}
label{display:block;color:#a78bfa;font-size:.82rem;font-weight:600;margin-bottom:4px;}
input,select,textarea{width:100%;padding:10px;border:1px solid #2d2d5e;border-radius:7px;background:#0f3460;color:#e0e0e0;font-size:.9rem;margin-bottom:12px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.btn-main{width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;}
.btn-main:hover{opacity:.88;}
.btn-main:disabled{opacity:.45;cursor:not-allowed;}
.btn-s{padding:7px 12px;font-size:.8rem;border:none;border-radius:6px;cursor:pointer;font-weight:600;}
.btn-g{background:#059669;color:#fff;}
.btn-r{background:#dc2626;color:#fff;}
.btn-d{background:#374151;color:#d1d5db;}
.row{display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;}
.row input{margin-bottom:0;flex:1;}
.info{background:#0f3460;border:1px solid #2d2d5e;border-radius:7px;padding:12px;font-size:.8rem;color:#94a3b8;line-height:1.7;margin-bottom:12px;}
.info b{color:#a78bfa;}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
.dot-g{background:#10b981;} .dot-y{background:#f59e0b;} .dot-r{background:#ef4444;}
#ckStatus{padding:8px 12px;background:#0f3460;border-radius:6px;font-size:.82rem;margin-bottom:12px;}
#ckPreview{background:#0f3460;border:1px solid #2d2d5e;border-radius:6px;padding:10px;font-size:.72rem;color:#94a3b8;word-break:break-all;min-height:36px;}
#statusMsg{padding:12px;border-radius:7px;font-weight:600;text-align:center;display:none;margin:10px 0;}
.prog{width:100%;height:5px;background:#2d2d5e;border-radius:3px;overflow:hidden;display:none;margin:8px 0;}
.prog-bar{height:100%;background:linear-gradient(90deg,#7c3aed,#10b981);transition:width .4s;}
#imgs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;}
.icard{background:#0f3460;border-radius:9px;overflow:hidden;text-align:center;}
.icard img{width:100%;display:block;}
.icard a{display:inline-block;margin:8px;padding:5px 12px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:5px;font-size:.78rem;}
#rawOut{background:#0f3460;border-radius:7px;padding:12px;font-size:.74rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all;max-height:160px;overflow-y:auto;}
@media(max-width:580px){.g2,.g3{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="wrap">
<h1>NSFWLover AI v1.7</h1>

<div class="tabs">
  <button class="tab-btn on" id="t-gen" onclick="showTab('gen')">🎨 生圖</button>
  <button class="tab-btn" id="t-ck" onclick="showTab('ck')">🍪 Cookie</button>
  <button class="tab-btn" id="t-api" onclick="showTab('api')">🔌 API</button>
</div>

<!-- 生圖 -->
<div class="tab-pane on" id="p-gen">
  <label>正向提示詞</label>
  <textarea id="prompt" rows="3">1girl, solo, nsfw, masterpiece, best quality</textarea>
  <label>負向提示詞</label>
  <input id="negative" value="blurry, lowres, ugly, deformed, watermark">
  <div class="g3">
    <div><label>寬</label><input id="width" type="number" value="512"></div>
    <div><label>高</label><input id="height" type="number" value="768"></div>
    <div><label>步數</label><input id="steps" type="number" value="30" min="10" max="50"></div>
    <div><label>種子</label><input id="seed" type="number" value="-1"></div>
    <div><label>比例</label>
      <select id="aspect" onchange="setAspect(this.value)">
        <option value="9:16">9:16</option>
        <option value="1:1">1:1</option>
        <option value="16:9">16:9</option>
        <option value="4:3">4:3</option>
      </select>
    </div>
    <div><label>張數</label><input id="n" type="number" value="1" min="1" max="4"></div>
  </div>
  <div id="ckStatus"><span class="dot dot-y"></span>Cookie：使用後端 Secrets</div>
  <button class="btn-main" id="genBtn" onclick="doGen()">🚀 開始生成</button>
</div>

<!-- Cookie -->
<div class="tab-pane" id="p-ck">
  <div class="info">
    <b>取得 Cookie 步驟：</b><br>
    1. 登入 nsfwlover.com → F12 → Network<br>
    2. 觸發生圖 → 找 <b>/api/image/generation/zimage-turbo</b><br>
    3. Headers → 複製 Cookie 欄中各值
  </div>
  <label>Session Token（<b>__Secure-next-auth.session-token</b> 的值）</label>
  <div class="row">
    <input type="password" id="ckSession" placeholder="0.eFZ1su... 完整 token" oninput="onCkChange()">
    <button class="btn-s btn-g" onclick="togglePw('ckSession')">👁</button>
    <button class="btn-s btn-r" onclick="clearCk('ckSession')">✕</button>
  </div>
  <label>PostHog Cookie（<b>ph_phc_VrIqTc5B...</b> 的值）</label>
  <div class="row">
    <input type="password" id="ckPosthog" placeholder="%7B%22distinct_id%22..." oninput="onCkChange()">
    <button class="btn-s btn-g" onclick="togglePw('ckPosthog')">👁</button>
    <button class="btn-s btn-r" onclick="clearCk('ckPosthog')">✕</button>
  </div>
  <div class="g2" style="margin-bottom:12px;">
    <button class="btn-s btn-g btn-main" onclick="saveCk()">💾 儲存</button>
    <button class="btn-s btn-d btn-main" onclick="clearAllCk()">🗑 清除</button>
  </div>
  <label>Cookie 預覽</label>
  <div id="ckPreview">（空 = 使用後端 Secrets）</div>
  <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
    <button class="btn-s btn-g" onclick="testConn()">🧪 測試連線</button>
    <span id="testOut" style="font-size:.83rem;"></span>
  </div>
</div>

<!-- API -->
<div class="tab-pane" id="p-api">
  <div class="info">
    <b>POST /v1/images/generations</b><br>
    Content-Type: application/json<br>
    Authorization: Bearer sk-任意<br><br>
    <b>Body 參數：</b><br>
    model（必）: "zimage-turbo"<br>
    prompt（必）: "1girl, nsfw"<br>
    n: 1-4 | size: "512x768" | steps: 30 | seed: -1<br>
    negative_prompt: "blurry"<br>
    _session_token: "可選，覆蓋後端 Secret"
  </div>
  <div class="info">
    <b>回應：</b> {"created":..., "data":[{"b64_json":"iVBOR..."}]}<br><br>
    <b>GET /v1/models</b> — 模型列表<br>
    <b>GET /health</b> — 健康檢查 v1.7<br>
    <b>GET /debug?prompt_id=xxx</b> — 輪詢測試
  </div>
</div>

<!-- 結果 -->
<div id="statusMsg"></div>
<div class="prog" id="prog"><div class="prog-bar" id="pbar" style="width:0"></div></div>
<div id="imgs"></div>
<details style="margin-top:14px;">
  <summary style="cursor:pointer;color:#6b7280;font-size:.82rem;">📋 API 原始回應</summary>
  <div id="rawOut" style="margin-top:6px;"></div>
</details>
</div>

<script>
var SK = 'nsfwlover_ck';

function showTab(name) {
  ['gen','ck','api'].forEach(function(t) {
    document.getElementById('t-'+t).classList.remove('on');
    document.getElementById('p-'+t).classList.remove('on');
  });
  document.getElementById('t-'+name).classList.add('on');
  document.getElementById('p-'+name).classList.add('on');
}

function setAspect(v) {
  var m = {'9:16':[512,768],'1:1':[512,512],'16:9':[768,512],'4:3':[640,480]};
  var wh = m[v] || [512,768];
  document.getElementById('width').value = wh[0];
  document.getElementById('height').value = wh[1];
}

function togglePw(id) {
  var el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function clearCk(id) {
  document.getElementById(id).value = '';
  onCkChange();
}

function onCkChange() {
  var s = document.getElementById('ckSession').value.trim();
  var p = document.getElementById('ckPosthog').value.trim();
  var prev = '';
  if (s) prev += '__Secure-next-auth.session-token=' + s.slice(0,18) + '...; ';
  if (p) prev += 'ph_phc_...=' + p.slice(0,18) + '...';
  document.getElementById('ckPreview').textContent = prev || '（空 = 使用後端 Secrets）';
  var st = document.getElementById('ckStatus');
  if (s) {
    st.innerHTML = '<span class="dot dot-g"></span>Cookie：UI 已覆蓋（session 已設）';
  } else {
    st.innerHTML = '<span class="dot dot-y"></span>Cookie：使用後端 Secrets';
  }
}

function saveCk() {
  var s = document.getElementById('ckSession').value.trim();
  var p = document.getElementById('ckPosthog').value.trim();
  localStorage.setItem(SK, JSON.stringify({s:s, p:p}));
  onCkChange();
  alert('✅ Cookie 已儲存！');
}

function clearAllCk() {
  localStorage.removeItem(SK);
  document.getElementById('ckSession').value = '';
  document.getElementById('ckPosthog').value = '';
  onCkChange();
}

function loadCk() {
  try {
    var d = JSON.parse(localStorage.getItem(SK) || '{}');
    if (d.s) document.getElementById('ckSession').value = d.s;
    if (d.p) document.getElementById('ckPosthog').value = d.p;
    onCkChange();
  } catch(e) {}
}

function testConn() {
  var el = document.getElementById('testOut');
  el.textContent = '⏳ 測試中...';
  el.style.color = '#f59e0b';
  fetch('/health').then(function(r){return r.json();}).then(function(d){
    el.textContent = '✅ Worker OK v' + d.version;
    el.style.color = '#10b981';
  }).catch(function(e){
    el.textContent = '❌ ' + e.message;
    el.style.color = '#ef4444';
  });
}

function setStatus(msg, color, show) {
  var el = document.getElementById('statusMsg');
  el.textContent = msg; el.style.color = color;
  el.style.display = show ? 'block' : 'none';
}

function setPbar(pct) {
  document.getElementById('pbar').style.width = pct + '%';
  var p = document.getElementById('prog');
  p.style.display = pct > 0 && pct < 100 ? 'block' : 'none';
}

function doGen() {
  var btn = document.getElementById('genBtn');
  btn.disabled = true; btn.textContent = '⏳ 生成中...';
  document.getElementById('imgs').innerHTML = '';
  document.getElementById('rawOut').textContent = '';
  setStatus('📤 發送請求...', '#a78bfa', true);
  setPbar(10);

  var ckSession = document.getElementById('ckSession').value.trim();
  var ckPosthog = document.getElementById('ckPosthog').value.trim();

  var body = {
    model: 'zimage-turbo',
    prompt: document.getElementById('prompt').value,
    negative_prompt: document.getElementById('negative').value,
    n: parseInt(document.getElementById('n').value) || 1,
    size: document.getElementById('width').value + 'x' + document.getElementById('height').value,
    steps: parseInt(document.getElementById('steps').value) || 30,
    seed: parseInt(document.getElementById('seed').value) || -1
  };
  if (ckSession) body._session_token = ckSession;
  if (ckPosthog) body._posthog_cookie = ckPosthog;

  setStatus('🔄 輪詢中（最多 10 分鐘）...', '#a78bfa', true);
  setPbar(20);

  fetch('/v1/images/generations', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer sk-test'},
    body: JSON.stringify(body)
  })
  .then(function(r){ return r.json(); })
  .then(function(data) {
    document.getElementById('rawOut').textContent = JSON.stringify(data, null, 2);
    if (data.error) throw new Error(data.error);
    setPbar(100);
    var html = '';
    for (var i = 0; i < data.data.length; i++) {
      var b64 = data.data[i].b64_json;
      html += '<div class="icard"><img src="data:image/png;base64,' + b64 + '" loading="lazy">'
           + '<a href="data:image/png;base64,' + b64 + '" download="nsfwlover_' + i + '.png">💾 下載</a></div>';
    }
    document.getElementById('imgs').innerHTML = html;
    setStatus('✅ 生成完成！共 ' + data.data.length + ' 張', '#10b981', true);
  })
  .catch(function(e) {
    setStatus('❌ 錯誤：' + e.message, '#ef4444', true);
    document.getElementById('rawOut').textContent = e.stack || e.message;
    setPbar(0);
  })
  .finally(function() {
    btn.disabled = false; btn.textContent = '🚀 開始生成';
    document.getElementById('prog').style.display = 'none';
  });
}

// 初始化
loadCk();
setAspect('9:16');
</script>
</body>
</html>`;
