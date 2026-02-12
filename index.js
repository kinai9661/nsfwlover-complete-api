export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cookie = '__Host-next-auth.csrf-token=586235cacc756c46c6206b84e3d9735ae3bdc1c67f74a9289492aa21b516abb5%7C3512b4c3a60ee93559e8459c4a3a8b81f93b8dde39d5136476f1a2bf1fec0cb7; __Secure-next-auth.callback-url=https%3A%2F%2Fwww.nsfwlover.com%2Flogin-callback%3FcallbackUrl%3Dhttps%253A%252F%252Fwww.nsfwlover.com%252Fnsfw-ai-image-generator; __Secure-next-auth.session-token=b1c3a341-df2a-4ae6-b779-adc912bf5417; ph_phc_VrIqTc5BlFS71lrxDiL1JXlxIrgL8RLcFVkTA7r3kxo_posthog=%7B%22distinct_id%22%3A%22cmlcbhd280dield0pz1tlfzvk%22%2C%22%24sesid%22%3A%5B1770920426067%2C%22019c5315-2d05-7f5e-8e21-ec704e5be09e%22%2C1770920422661%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A7B%22r%22%3A%22https%3A%2F%2Faccounts.google.com%2F%22%2C%22u%22%3A%22https%3A%2F%2Fwww.nsfwlover.com%2Flogin-callback%3FcallbackUrl%3Dhttps%253A%252F%252Fwww.nsfwlover.com%252Fnsfw-image-edit%22%7D%7D';

    if (url.pathname === '/' || url.pathname === '/ui') {
      return new Response(HTML_UI, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    if (url.pathname === '/v1/images/generations' && request.method === 'POST') {
      const body = await request.json();
      const { prompt, size = '1024x1024', n = 1 } = body;

      // 比例映射
      const ratioMap = {
        '1024x1024': '1:1',
        '1792x1024': '16:9',
        '1024x1792': '9:16'
      };
      const aspect_ratio = ratioMap[size] || '1:1';

      const nsfwBody = JSON.stringify({ prompt, aspect_ratio });
      const nsfwResponse = await fetch('https://www.nsfwlover.com/api/image/generation/zimage-turbo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
          'User-Agent': 'Mozilla/5.0 (compatible; Perplexity)'
        },
        body: nsfwBody
      });

      let nsfwData = await nsfwResponse.json();
      // 假設回應有 data.images[0] 或 data.url，調整為 b64
      // 若非同步，需輪詢；此處簡化假設同步返回 URL，轉 b64 (實際測試調整)
      const imageUrl = nsfwData.data?.images?.[0] || nsfwData.data?.url;
      if (!imageUrl) throw new Error('No image URL');

      const imgResp = await fetch(imageUrl);
      const imgBuffer = await imgResp.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      return Response.json({
        created: Date.now(),
        data: [{ b64_json: b64, revised_prompt: prompt }]
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

const HTML_UI = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>ZImage Turbo OpenAI Proxy</title><style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;}textarea{width:100%;height:100px;}button{padding:10px 20px;background:#007bff;color:white;border:none;cursor:pointer;}</style></head>
<body>
<h1>Z-Image-Turbo 圖片生成 (OpenAI 相容)</h1>
<textarea id="prompt" placeholder="輸入提示詞... (支援中英)"></textarea><br><br>
<select id="size"><option value="1024x1024">1:1 (1024x1024)</option><option value="1792x1024">16:9</option><option value="1024x1792">9:16</option></select>
<button onclick="generate()">生成圖片</button>
<div id="result"></div>
<script>
async function generate() {
  const prompt = document.getElementById('prompt').value;
  const size = document.getElementById('size').value;
  const res = await fetch('/v1/images/generations', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'zimage-turbo', prompt, size, n:1, response_format: 'b64_json'})
  });
  const data = await res.json();
  const img = document.createElement('img');
  img.src = 'data:image/png;base64,' + data.data[0].b64_json;
  img.style.maxWidth = '100%';
  document.getElementById('result').innerHTML = '';
  document.getElementById('result').appendChild(img);
}
</script>
</body>
</html>`;
