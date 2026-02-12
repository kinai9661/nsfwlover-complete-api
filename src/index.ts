interface Env {
  API_KEY?: string;
  MODELS_CACHE?: KVNamespace;
}

const ASPECT_RATIOS: Record<string, string> = {
  '1:1': '1024x1024', '16:9': '1344x768', '9:16': '768x1344',
  '4:3': '1152x896', '3:4': '896x1152', '21:9': '1536x640',
  '3:2': '1216x832', '2:3': '832x1216'
};

const DEFAULT_MODELS: Record<string, any> = {
  'zimage-turbo': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/zimage-turbo',
    name: 'Z-Image Turbo', speed: 'fast', maxImages: 4
  },
  'flux2klein': {
    endpoint: 'https://www.nsfwlover.com/api/image/generation/flux2klein',
    name: 'Flux 2 Klein', speed: 'medium', maxImages: 4
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log('[Request]', request.method, path);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      if (path === '/' || path === '') {
        return jsonResponse({
          name: 'NSFWLover API Proxy',
          version: '2.0',
          status: 'ok',
          endpoints: ['/', '/health', '/api/models', '/api/generate', '/api/img2img']
        });
      }

      if (path === '/health') {
        return jsonResponse({ status: 'ok', version: '2.0' });
      }

      if (path === '/api/models') {
        return jsonResponse({
          success: true,
          models: Object.keys(DEFAULT_MODELS).map(k => ({
            id: k, name: DEFAULT_MODELS[k].name, speed: DEFAULT_MODELS[k].speed
          }))
        });
      }

      if (path === '/api/generate' && request.method === 'POST') {
        return await handleGenerate(request);
      }

      if (path === '/api/img2img' && request.method === 'POST') {
        return await handleImg2Img(request);
      }

      return jsonResponse({ error: 'Not found', path }, 404);
    } catch (error: any) {
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

async function handleGenerate(request: Request): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt) return jsonResponse({ error: 'Missing prompt' }, 400);

    const modelId = body.model || 'zimage-turbo';
    const model = DEFAULT_MODELS[modelId];
    if (!model) return jsonResponse({ error: 'Invalid model' }, 400);

    const payload: any = {
      model: modelId,
      prompt: body.prompt,
      image_size: ASPECT_RATIOS[body.aspect_ratio || '1:1'] || '1024x1024',
      output_format: 'url',
      num_images: body.n || 1
    };
    if (body.negative_prompt) payload.negative_prompt = body.negative_prompt;
    if (body.seed) payload.seed = parseInt(body.seed);

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: 'API failed', status: response.status }, response.status);
    }

    const data = await response.json();
    const images = data.images || (data.url ? [{ url: data.url }] : []);

    return jsonResponse({ success: true, model: modelId, images, count: images.length });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleImg2Img(request: Request): Promise<Response> {
  try {
    const body = await request.json() as any;
    if (!body.prompt || !body.image) return jsonResponse({ error: 'Missing required fields' }, 400);

    const modelId = body.model || 'zimage-turbo';
    const model = DEFAULT_MODELS[modelId];

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
      output_format: 'url'
    };

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return jsonResponse({ error: 'API failed' }, response.status);
    }

    const data = await response.json();
    const images = data.images || [{ url: data.url }];

    return jsonResponse({ success: true, model: modelId, images });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
