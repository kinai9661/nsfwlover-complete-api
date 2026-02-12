interface Env {
  MODELS_CACHE: KVNamespace;
}

const ASPECT_RATIOS: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1344x768',
  '9:16': '768x1344',
  '4:3': '1152x896',
  '3:4': '896x1152',
  '21:9': '1536x640',
  '3:2': '1216x832',
  '2:3': '832x1216'
};

const MODELS: Record<string, any> = {
  'zimage-turbo': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/zimage-turbo',
    maxImages: 4
  },
  'flux2klein': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/flux2klein',
    maxImages: 4
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ status: 'ok', version: '2.0' }, corsHeaders);
    }

    if (url.pathname === '/api/models') {
      return jsonResponse({
        success: true,
        models: Object.keys(MODELS).map(id => ({
          id,
          name: id === 'zimage-turbo' ? 'Z-Image Turbo' : 'Flux 2 Klein',
          maxImages: MODELS[id].maxImages
        }))
      }, corsHeaders);
    }

    if (url.pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request, env, corsHeaders);
    }

    if (url.pathname === '/api/img2img' && request.method === 'POST') {
      return handleImg2Img(request, env, corsHeaders);
    }

    return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
  }
};

async function handleGenerate(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt) {
      return jsonResponse({ error: 'Missing prompt' }, corsHeaders, 400);
    }

    const modelId = body.model || 'zimage-turbo';
    const model = MODELS[modelId];
    if (!model) {
      return jsonResponse({ error: 'Invalid model' }, corsHeaders, 400);
    }

    const numImages = Math.min(body.n || 1, model.maxImages);
    const payload = {
      model: modelId,
      prompt: body.prompt,
      image_size: ASPECT_RATIOS[body.aspect_ratio || '1:1'] || '1024x1024',
      output_format: 'url',
      num_images: numImages,
      negative_prompt: body.negative_prompt || ''
    };

    if (body.seed) payload.seed = parseInt(body.seed);

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: `API failed: ${response.status}` }, corsHeaders, response.status);
    }

    const data = await response.json();
    let images = [];
    if (data.images && Array.isArray(data.images)) images = data.images;
    else if (data.url) images = [{ url: data.url }];
    else if (data.image_url) images = [{ url: data.image_url }];

    return jsonResponse({
      success: true,
      model: modelId,
      images,
      count: images.length,
      timestamp: Date.now()
    }, corsHeaders);
  } catch (error: any) {
    return jsonResponse({ error: error.message }, corsHeaders, 500);
  }
}

async function handleImg2Img(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt || !body.image) {
      return jsonResponse({ error: 'Missing prompt or image' }, corsHeaders, 400);
    }

    const modelId = body.model || 'zimage-turbo';
    const model = MODELS[modelId];
    if (!model) {
      return jsonResponse({ error: 'Invalid model' }, corsHeaders, 400);
    }

    let inputImage = body.image;
    if (inputImage.startsWith('http')) {
      const imgResp = await fetch(inputImage);
      const arrayBuffer = await imgResp.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      inputImage = `data:image/jpeg;base64,${base64}`;
    }

    const payload = {
      model: modelId,
      prompt: body.prompt,
      init_image: inputImage,
      strength: body.strength || 0.75,
      output_format: 'url',
      negative_prompt: body.negative_prompt || ''
    };

    if (body.seed) payload.seed = parseInt(body.seed);

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: `API failed: ${response.status}` }, corsHeaders, response.status);
    }

    const data = await response.json();
    let images = [];
    if (data.images && Array.isArray(data.images)) images = data.images;
    else if (data.url) images = [{ url: data.url }];
    else if (data.image_url) images = [{ url: data.image_url }];

    return jsonResponse({
      success: true,
      model: modelId,
      images,
      timestamp: Date.now()
    }, corsHeaders);
  } catch (error: any) {
    return jsonResponse({ error: error.message }, corsHeaders, 500);
  }
}

function jsonResponse(data: any, headers: any = {}, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
