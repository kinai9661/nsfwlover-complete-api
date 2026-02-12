interface Env {
  API_KEY?: string;
  MODELS_CACHE: KVNamespace;
}

const ASPECT_RATIOS: Record<string, string> = {
  '1:1': '1024x1024', '16:9': '1344x768', '9:16': '768x1344',
  '4:3': '1152x896', '3:4': '896x1152', '21:9': '1536x640',
  '9:21': '640x1536', '3:2': '1216x832', '2:3': '832x1216'
};

const DEFAULT_MODELS: Record<string, any> = {
  'zimage-turbo': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/zimage-turbo',
    name: 'Z-Image Turbo', speed: 'fast', maxImages: 4, supportsImg2Img: true
  },
  'flux2klein': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/flux2klein',
    name: 'Flux 2 Klein', speed: 'medium', maxImages: 4, supportsImg2Img: true
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResponse();

    const models = await getAvailableModels(env);

    if (url.pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request, models);
    }
    if (url.pathname === '/api/img2img' && request.method === 'POST') {
      return handleImg2Img(request, models);
    }
    if (url.pathname === '/api/models') {
      return jsonResponse({ models: Object.keys(models).map(k => ({
        id: k, name: models[k].name, speed: models[k].speed,
        maxImages: models[k].maxImages, supportsImg2Img: models[k].supportsImg2Img
      })), aspect_ratios: ASPECT_RATIOS });
    }
    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok', models: Object.keys(models), version: '2.0' });
    }
    return jsonResponse({ error: 'Not found' }, 404);
  }
};

async function getAvailableModels(env: Env): Promise<Record<string, any>> {
  if (env.MODELS_CACHE) {
    const cached = await env.MODELS_CACHE.get('models', 'json');
    if (cached) return cached as Record<string, any>;
  }
  return DEFAULT_MODELS;
}

async function handleGenerate(request: Request, models: Record<string, any>): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt) return jsonResponse({ error: 'prompt required' }, 400);

    const modelId = body.model || 'zimage-turbo';
    const model = models[modelId];
    if (!model) return jsonResponse({ error: 'Model not found' }, 400);

    const payload: any = {
      model: modelId, prompt: body.prompt,
      image_size: ASPECT_RATIOS[body.aspect_ratio || '1:1'] || '1024x1024',
      output_format: 'url', num_images: body.n || 1
    };
    if (body.seed) payload.seed = body.seed;
    if (body.negative_prompt) payload.negative_prompt = body.negative_prompt;

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.nsfwlover.com' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Generation failed', status: response.status }, response.status);
    }

    const data = await response.json();
    const images = data.images || (data.url ? [{ url: data.url }] : []);

    return jsonResponse({ success: true, model: modelId, images, timestamp: Date.now() });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleImg2Img(request: Request, models: Record<string, any>): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt || !body.image) return jsonResponse({ error: 'prompt and image required' }, 400);

    const modelId = body.model || 'zimage-turbo';
    const model = models[modelId];
    if (!model) return jsonResponse({ error: 'Model not found' }, 400);

    let inputImage = body.image;
    if (inputImage.startsWith('http')) {
      try {
        const imgResp = await fetch(inputImage);
        const arrayBuffer = await imgResp.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        inputImage = `data:image/jpeg;base64,${base64}`;
      } catch (e) {
        return jsonResponse({ error: 'Failed to fetch image' }, 400);
      }
    }

    const payload = {
      model: modelId, prompt: body.prompt, init_image: inputImage,
      strength: body.strength || 0.75, output_format: 'url'
    };

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.nsfwlover.com' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Img2img failed', status: response.status }, response.status);
    }

    const data = await response.json();
    const images = data.images || [{ url: data.url || data.image_url }];

    return jsonResponse({ success: true, model: modelId, images, timestamp: Date.now() });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

function corsResponse(): Response {
  return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }});
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
