/*
  Netlify Function: enhance-image
  - POST { mode: 'colorize' | 'enhance', imageBase64: string }
  - Returns: { imageBase64 } (base64 without prefix)
  Requires env: GOOGLE_API_KEY (Gemini API)
*/

const fetch = require('node-fetch');

exports.handler = async function(event) {
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  try {
    const { mode, imageBase64 } = body;
    if (!imageBase64) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing imageBase64' }) };
    }
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing GOOGLE_API_KEY env var' }) };
    }

    const prompt =
      mode === 'colorize'
        ? [
            'Colorize the ENTIRE image from black-and-white to realistic, natural tones (not only the subject).',
            'The photo may be a full scene (landscape, objects, architecture), not a portrait.',
            'Apply plausible hues to sky, foliage, water, stone, metal, wood, clothing, skin, and background elements.',
            'Avoid leaving any region desaturated; avoid color spill and cartoonish saturation.',
            'Preserve grain, texture and fine details; keep contrast and dynamic range balanced.',
            'Do not crop or add elements; only colorize and gently enhance the existing photo.'
          ].join(' ')
        : [
            'Improve photo quality while keeping a natural look.',
            'Reduce noise and blur; enhance sharpness and local contrast; preserve textures.',
            'Maintain realistic tones for faces, objects and background; avoid over-sharpening or halos.'
          ].join(' ');

    // Preferred models that can return images (try in order)
    const modelCandidates = [
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ];

    const cleanBase64 = String(imageBase64).replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const mime = String(imageBase64).includes('png') ? 'image/png' : 'image/jpeg';

    // Base contents shared by all attempts
    const baseContents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: cleanBase64 } },
        ],
      },
    ];

    // Try multiple payload variants
    const payloadVariants = [
      { generationConfig: { temperature: 0.4, response_mime_type: 'image/png' } },
      { generationConfig: { temperature: 0.4, response_mime_type: 'image/jpeg' } },
      { generationConfig: { temperature: 0.2 } },
      { } // no generationConfig
    ];

    let lastError = null;
    const attempts = [];
    for (const model of modelCandidates) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      for (const variant of payloadVariants) {
        const payload = { contents: baseContents, ...variant };
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
          body: JSON.stringify(payload),
        });
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (!resp.ok) {
          const attempt = { model, status: resp.status, endpoint, payload: variant, data };
          attempts.push(attempt);
          lastError = attempt;
          continue; // try next payload or model
        }
        let outBase64 = '';
        try {
          const parts = data.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) { outBase64 = p.inlineData.data; break; }
            if (p.inline_data?.data) { outBase64 = p.inline_data.data; break; }
          }
        } catch (e) {
          const attempt = { model, status: resp.status, endpoint, payload: variant, data, parseError: String(e) };
          attempts.push(attempt);
          lastError = attempt;
        }
        if (outBase64) {
          return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: outBase64, modelUsed: model }) };
        } else {
          const attempt = { model, status: resp.status, endpoint, payload: variant, data };
          attempts.push(attempt);
          lastError = attempt;
        }
      }
    }

    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'Gemini API error', details: lastError || 'Unknown', attempts }) };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server error', details: String(e) }) };
  }
}
