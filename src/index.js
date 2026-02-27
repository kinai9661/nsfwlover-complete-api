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
    if (url.pathname === '/health') return Response.json({ status: 'ok', version: '2.1' }, { headers: cors });
    if (url.pathname === '/v1/models') return Response.json({
      object: 'list', data: [{ id: 'zimage-turbo', object: 'model', owned_by: 'nsfwlover' }]
    }, { headers: cors });

    // 新：回傳收到的 body，確認前端有傳 token
    if (url.pathname === '/echo') {
      let body = {};
      try { body = await request.json(); } catch(_) {}
      return Response.json({
        received: {
          has_turnstile: !!body._turnstile_token,
          turnstile_preview: body._turnstile_token ? body._turnstile_token.slice(0,30)+'...' : null,
          has_posthog: !!body._posthog_cookie,
          posthog_preview: body._posthog_cookie ? body._posthog_cookie.slice(0,30)+'...' : null,
          prompt: body.prompt || null
        }
      }, { headers: cors });
    }

    if (url.pathname === '/v1/images/generations') return handleGeneration(request, env, cors);
    if (url.pathname === '/debug') return handleDebug(request, env, cors);
    return new Response('Not Found', { status: 404, headers: cors });
  }
};

function buildCookie(env, posthogOverride) {
  const posthog = posthogOverride || env.POSTHOG_COOKIE || '';
  if (posthog) return 'ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=' + posthog;
  return '';
}

async function handleDebug(request, env, cors) {
  const url = new URL(request.url);
  const promptId = url.searchParams.get('prompt_id');
  if (!promptId) return Response.json({ error: 'Missing prompt_id' }, { status: 400, headers: cors });
  const cookie = buildCookie(env, '');
  const pollResp = await fetch(env.TARGET_POLL + '?prompt_id=' + promptId, {
    headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
  });
  const raw = await pollResp.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  return Response.json({ http_status: pollResp.status, raw_preview: raw.slice(0, 500), parsed }, { headers: cors });
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
  const posthogOverride = body._posthog_cookie || '';
  const turnstileToken = body._turnstile_token || '';

  if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400, headers: cors });

  const sizeParts = size.split('x');
  const width = parseInt(sizeParts[0]) || 512;
  const height = parseInt(sizeParts[1]) || 768;
  const cookie = buildCookie(env, posthogOverride);

  // Log 完整狀態
  console.log('[v2.1] prompt:', prompt.slice(0, 50));
  console.log('[v2.1] turnstile token:', turnstileToken ? turnstileToken.slice(0,40)+'...' : 'MISSING');
  console.log('[v2.1] posthog cookie:', cookie ? 'present ('+cookie.length+' chars)' : 'MISSING');

  try {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Referer': 'https://www.nsfwlover.com/nsfw-ai-image-generator',
      'Origin': 'https://www.nsfwlover.com',
      'Accept': '*/*',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'priority': 'u=1, i'
    };

    if (turnstileToken) {
      reqHeaders['cf-turnstile-token'] = turnstileToken;
      console.log('[v2.1] cf-turnstile-token set:', turnstileToken.slice(0,40)+'...');
    } else {
      console.log('[v2.1] WARNING: no turnstile token!');
    }

    // Log 最終 headers（除 cookie 外）
    const headerLog = {};
    Object.keys(reqHeaders).forEach(function(k) {
      if (k.toLowerCase() !== 'cookie') headerLog[k] = reqHeaders[k];
    });
    console.log('[v2.1] sending headers:', JSON.stringify(headerLog));

    const createResp = await fetch(env.TARGET_CREATE, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({ prompt, negative_prompt, steps, width, height, seed, n })
    });

    const createRaw = await createResp.text();
    console.log('[CREATE] status:', createResp.status, createRaw.slice(0, 400));
    if (!createResp.ok) throw new Error('Create failed ' + createResp.status + ': ' + createRaw.slice(0, 400));

    let createData;
    try { createData = JSON.parse(createRaw); } catch (_) {
      throw new Error('JSON parse error: ' + createRaw.slice(0, 200));
    }

    const promptId = createData.prompt_id || createData.task_id || createData.id || null;
    if (!promptId) throw new Error('No prompt_id in: ' + JSON.stringify(createData).slice(0, 300));
    console.log('[CREATE] prompt_id:', promptId);

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResp = await fetch(env.TARGET_POLL + '?prompt_id=' + promptId, {
        headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' }
      });
      const pollRaw = await pollResp.text();
      console.log('[POLL ' + i + '] status:', pollResp.status, pollRaw.slice(0, 120));
      if (!pollResp.ok) continue;

      let pollData;
      try { pollData = JSON.parse(pollRaw); } catch (_) { continue; }

      const status = pollData.status;
      if (status === 'failed') throw new Error(pollData.error || 'Generation failed');
      if (status === 'completed' || status === 'success') {
        let b64 = pollData.image
          || (pollData.data && pollData.data[0] && pollData.data[0].image)
          || (pollData.result && pollData.result.image)
          || null;
        if (!b64) throw new Error('No image. Keys: ' + Object.keys(pollData).join(', '));
        if (b64.indexOf('data:image') === 0) b64 = b64.split(',')[1];
        const dataArr = [];
        for (let j = 0; j < n; j++) dataArr.push({ b64_json: b64, revised_prompt: prompt });
        return Response.json({ created: Math.floor(Date.now() / 1000), data: dataArr }, { headers: cors });
      }
    }
    throw new Error('Timeout: generation exceeded 10 minutes');
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
<title>NSFWLover AI v2.1</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1a1a2e;color:#e0e0e0;padding:20px;}
.wrap{max-width:960px;margin:auto;}
h1{text-align:center;color:#a78bfa;padding:16px 0;font-size:1.5rem;}
.tabs{display:flex;gap:6px;}
.tab-btn{padding:10px 18px;background:#0f3460;color:#94a3b8;border:none;border-radius:8px 8px 0 0;cursor:pointer;font-size:.88rem;font-weight:600;}
.tab-btn.on{background:#16213e;color:#a78bfa;border-bottom:2px solid #a78bfa;}
.tab-pane{background:#16213e;border-radius:0 12px 12px 12px;padding:20px;display:none;}
.tab-pane.on{display:block;}
label{display:block;color:#a78bfa;font-size:.82rem;font-weight:600;margin-bottom:4px;}
input,select,textarea{width:100%;padding:10px;border:1px solid #2d2d5e;border-radius:7px;background:#0f3460;color:#e0e0e0;font-size:.9rem;margin-bottom:12px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.btn-main{width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;}
.btn-main:hover{opacity:.88;} .btn-main:disabled{opacity:.45;cursor:not-allowed;}
.btn-s{padding:7px 12px;font-size:.8rem;border:none;border-radius:6px;cursor:pointer;font-weight:600;}
.btn-g{background:#059669;color:#fff;} .btn-r{background:#dc2626;color:#fff;} .btn-d{background:#374151;color:#d1d5db;}
.row{display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;}
.row input{margin-bottom:0;flex:1;}
.info{background:#0f3460;border:1px solid #2d2d5e;border-radius:7px;padding:12px;font-size:.8rem;color:#94a3b8;line-height:1.7;margin-bottom:12px;}
.info b{color:#a78bfa;}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
.dot-g{background:#10b981;} .dot-y{background:#f59e0b;} .dot-r{background:#ef4444;}
.bar{padding:8px 12px;background:#0f3460;border-radius:6px;font-size:.82rem;margin-bottom:10px;}
#statusMsg{padding:12px;border-radius:7px;font-weight:600;text-align:center;display:none;margin:10px 0;}
.prog{width:100%;height:5px;background:#2d2d5e;border-radius:3px;overflow:hidden;display:none;margin:8px 0;}
.prog-bar{height:100%;background:linear-gradient(90deg,#7c3aed,#10b981);transition:width .4s;}
#imgs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;}
.icard{background:#0f3460;border-radius:9px;overflow:hidden;text-align:center;}
.icard img{width:100%;display:block;}
.icard a{display:inline-block;margin:8px;padding:5px 12px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:5px;font-size:.78rem;}
#rawOut{background:#0f3460;border-radius:7px;padding:12px;font-size:.74rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;}
@media(max-width:580px){.g2,.g3{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="wrap">
<h1>NSFWLover AI v2.1 <span style="font-size:.7rem;color:#6b7280">診斷版</span></h1>

<div class="tabs">
  <button class="tab-btn on" id="t-gen" onclick="showTab('gen')">🎨 生圖</button>
  <button class="tab-btn" id="t-ck" onclick="showTab('ck')">🍪 Cookie</button>
  <button class="tab-btn" id="t-dbg" onclick="showTab('dbg')">🔍 診斷</button>
</div>

<!-- 生圖 -->
<div class="tab-pane on" id="p-gen">
  <div class="bar" id="tsBar"><span class="dot dot-y"></span>Turnstile：載入中...</div>
  <div class="bar" id="ckBar"><span class="dot dot-y"></span>PostHog Cookie：使用後端 Secrets</div>
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
        <option value="9:16">9:16</option><option value="1:1">1:1</option>
        <option value="16:9">16:9</option><option value="4:3">4:3</option>
      </select>
    </div>
    <div><label>張數</label><input id="n" type="number" value="1" min="1" max="4"></div>
  </div>
  <button class="btn-main" id="genBtn" onclick="doGen()">🚀 開始生成</button>
</div>

<!-- Cookie -->
<div class="tab-pane" id="p-ck">
  <div class="info">
    <b>只需 PostHog Cookie 值：</b><br>
    F12 → Network → POST zimage-turbo → Headers<br>
    複製 cookie 行中 <b>ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=</b> 後的值
  </div>
  <label>PostHog Cookie 值</label>
  <div class="row">
    <input type="password" id="ckPosthog" placeholder="%7B%22distinct_id%22%3A..." oninput="onCkChange()">
    <button class="btn-s btn-g" onclick="togglePw('ckPosthog')">👁</button>
    <button class="btn-s btn-r" onclick="clearInput('ckPosthog')">✕</button>
  </div>
  <div class="g2">
    <button class="btn-s btn-g btn-main" onclick="saveCk()">💾 儲存</button>
    <button class="btn-s btn-d btn-main" onclick="clearAllCk()">🗑 清除</button>
  </div>
</div>

<!-- 診斷 -->
<div class="tab-pane" id="p-dbg">
  <div class="info">
    <b>Step 1：確認 Turnstile Token 是否取得</b><br>
    看生圖頁 tsBar 是否 🟢。若否，等待或點重置。
  </div>
  <button class="btn-s btn-g" onclick="resetTS()">🔄 重置 Turnstile</button>
  <div id="tsTokenDisplay" style="margin:10px 0;background:#0f3460;border-radius:6px;padding:10px;font-size:.74rem;color:#94a3b8;word-break:break-all;min-height:36px;">
    Token: 等待中...
  </div>

  <div class="info" style="margin-top:10px;">
    <b>Step 2：確認 token 是否傳到後端</b><br>
    點下方按鈕，/echo 回傳收到的資料
  </div>
  <button class="btn-s btn-g" onclick="doEcho()">🧪 /echo 測試</button>
  <div id="echoOut" style="margin:10px 0;background:#0f3460;border-radius:6px;padding:10px;font-size:.74rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all;min-height:36px;"></div>

  <div class="info" style="margin-top:10px;">
    <b>Step 3：手動貼 Turnstile Token（從 nsfwlover.com 直接複製）</b><br>
    在真實網站 F12 → Network → POST zimage-turbo → Headers<br>
    複製 <b>cf-turnstile-token</b> 的完整值貼到下方，繞過 widget 直接測試
  </div>
  <label>手動 cf-turnstile-token（測試用）</label>
  <div class="row">
    <input type="text" id="manualTS" placeholder="0.mySGxyyo-...完整 token">
    <button class="btn-s btn-r" onclick="clearInput('manualTS')">✕</button>
  </div>
  <div class="info">
    <b>注意：</b>此 token 僅能使用一次，貼入後立即生圖測試，確認後端邏輯正確。
  </div>
</div>

<!-- 結果 -->
<div id="statusMsg"></div>
<div class="prog" id="prog"><div class="prog-bar" id="pbar" style="width:0"></div></div>
<div id="imgs"></div>
<details style="margin-top:14px;" open>
  <summary style="cursor:pointer;color:#a78bfa;font-size:.85rem;font-weight:600;">📋 API 回應（除錯）</summary>
  <div id="rawOut" style="margin-top:6px;"></div>
</details>
</div>

<!-- Invisible Turnstile -->
<div style="position:fixed;bottom:10px;right:10px;opacity:0;pointer-events:none;">
  <div id="ts-widget"
    class="cf-turnstile"
    data-sitekey="0x4AAAAAAADnPIDROrmt1Wwj"
    data-callback="onTurnstileSuccess"
    data-error-callback="onTurnstileError"
    data-expired-callback="onTurnstileExpired"
    data-theme="dark"
    data-size="invisible">
  </div>
</div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTSLoad" async defer><\/script>

<script>
var SK = 'nsfwlover_v2';
var tsToken = '';

function onTSLoad() {
  console.log('[TS] JS loaded');
  setTsBar('執行中...', 'y');
  if (window.turnstile) window.turnstile.execute('#ts-widget');
}

function onTurnstileSuccess(token) {
  tsToken = token;
  var short = token.slice(0,24)+'...';
  setTsBar('Token 就緒 (' + short + ')', 'g');
  document.getElementById('tsTokenDisplay').textContent = 'Token: ' + token.slice(0,60)+'...';
  console.log('[TS] OK:', short);
}

function onTurnstileError(code) {
  tsToken = '';
  setTsBar('失敗 code='+code, 'r');
  document.getElementById('tsTokenDisplay').textContent = 'Error code: '+code;
  console.error('[TS] Error:', code);
}

function onTurnstileExpired() {
  tsToken = '';
  setTsBar('已過期，重新取得...', 'y');
  if (window.turnstile) { window.turnstile.reset('#ts-widget'); window.turnstile.execute('#ts-widget'); }
}

function setTsBar(msg, c) {
  document.getElementById('tsBar').innerHTML = '<span class="dot dot-'+c+'"></span>Turnstile：'+msg;
}

function resetTS() {
  tsToken = '';
  setTsBar('重置中...','y');
  document.getElementById('tsTokenDisplay').textContent = '重置中...';
  if (window.turnstile) { window.turnstile.reset('#ts-widget'); window.turnstile.execute('#ts-widget'); }
}

function doEcho() {
  var el = document.getElementById('echoOut');
  el.textContent = '測試中...';
  var manual = document.getElementById('manualTS').value.trim();
  var ckPosthog = document.getElementById('ckPosthog').value.trim();
  var body = { prompt: 'test', _turnstile_token: manual || tsToken, _posthog_cookie: ckPosthog };
  fetch('/echo', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(function(r){return r.json();}).then(function(d){
    el.textContent = JSON.stringify(d, null, 2);
  }).catch(function(e){ el.textContent = 'Error: '+e.message; });
}

function showTab(name) {
  ['gen','ck','dbg'].forEach(function(t) {
    document.getElementById('t-'+t).classList.remove('on');
    document.getElementById('p-'+t).classList.remove('on');
  });
  document.getElementById('t-'+name).classList.add('on');
  document.getElementById('p-'+name).classList.add('on');
}

function setAspect(v) {
  var m = {'9:16':[512,768],'1:1':[512,512],'16:9':[768,512],'4:3':[640,480]};
  var wh = m[v]||[512,768];
  document.getElementById('width').value=wh[0]; document.getElementById('height').value=wh[1];
}

function togglePw(id){ var el=document.getElementById(id); el.type=el.type==='password'?'text':'password'; }
function clearInput(id){ document.getElementById(id).value=''; onCkChange(); }

function onCkChange() {
  var p = document.getElementById('ckPosthog').value.trim();
  document.getElementById('ckBar').innerHTML = p
    ? '<span class="dot dot-g"></span>PostHog Cookie：UI 已設定'
    : '<span class="dot dot-y"></span>PostHog Cookie：使用後端 Secrets';
}

function saveCk() {
  var p=document.getElementById('ckPosthog').value.trim();
  localStorage.setItem(SK,JSON.stringify({p:p}));
  onCkChange(); alert('已儲存！');
}

function clearAllCk() {
  localStorage.removeItem(SK);
  document.getElementById('ckPosthog').value='';
  onCkChange();
}

function loadCk() {
  try{
    var d=JSON.parse(localStorage.getItem(SK)||'{}');
    if(d.p) document.getElementById('ckPosthog').value=d.p;
    onCkChange();
  }catch(e){}
}

function setStatus(msg,color,show){
  var el=document.getElementById('statusMsg');
  el.textContent=msg; el.style.color=color; el.style.display=show?'block':'none';
}

function doGen() {
  var btn=document.getElementById('genBtn');
  var manual=document.getElementById('manualTS').value.trim();
  var activeToken = manual || tsToken;

  if (!activeToken) {
    alert('Turnstile token 尚未就緒！請等待 🟢 或切診斷頁貼手動 token。');
    return;
  }

  btn.disabled=true; btn.textContent='⏳ 生成中...';
  document.getElementById('imgs').innerHTML='';
  document.getElementById('rawOut').textContent='';
  document.getElementById('prog').style.display='block';
  document.getElementById('pbar').style.width='15%';
  setStatus('🛡 Token: '+activeToken.slice(0,20)+'... 發送中', '#a78bfa', true);

  var ckPosthog=document.getElementById('ckPosthog').value.trim();
  var body={
    model:'zimage-turbo',
    prompt:document.getElementById('prompt').value,
    negative_prompt:document.getElementById('negative').value,
    n:parseInt(document.getElementById('n').value)||1,
    size:document.getElementById('width').value+'x'+document.getElementById('height').value,
    steps:parseInt(document.getElementById('steps').value)||30,
    seed:parseInt(document.getElementById('seed').value)||-1,
    _turnstile_token: activeToken
  };
  if(ckPosthog) body._posthog_cookie=ckPosthog;

  document.getElementById('pbar').style.width='25%';
  setStatus('🔄 輪詢中（最多 10 分鐘）...','#a78bfa',true);

  fetch('/v1/images/generations',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer sk-test'},
    body:JSON.stringify(body)
  })
  .then(function(r){return r.json();})
  .then(function(data){
    document.getElementById('rawOut').textContent=JSON.stringify(data,null,2);
    if(data.error) throw new Error(data.error);
    document.getElementById('pbar').style.width='100%';
    var html='';
    for(var i=0;i<data.data.length;i++){
      var b64=data.data[i].b64_json;
      html+='<div class="icard"><img src="data:image/png;base64,'+b64+'" loading="lazy">'
        +'<a href="data:image/png;base64,'+b64+'" download="nsfwlover_'+i+'.png">💾 下載</a></div>';
    }
    document.getElementById('imgs').innerHTML=html;
    setStatus('✅ 完成！共 '+data.data.length+' 張','#10b981',true);
    tsToken=''; document.getElementById('manualTS').value='';
    setTsBar('已使用，重新取得...','y');
    if(window.turnstile){window.turnstile.reset('#ts-widget');window.turnstile.execute('#ts-widget');}
  })
  .catch(function(e){
    setStatus('❌ 錯誤：'+e.message,'#ef4444',true);
    document.getElementById('rawOut').textContent=e.stack||e.message;
    document.getElementById('pbar').style.width='0';
  })
  .finally(function(){
    btn.disabled=false; btn.textContent='🚀 開始生成';
    document.getElementById('prog').style.display='none';
  });
}

loadCk();
setAspect('9:16');
</script>
</body></html>`;
