/*
  Netlify Function: generate-banner
  - POST { prompt: string }
  - Returns: { imageBase64 } (base64 without prefix)
  Requires env: GOOGLE_API_KEY (Gemini API)
*/

const fetch = require('node-fetch');

exports.handler = async function(event) {
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
    const { prompt } = body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing prompt' }) };
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing GOOGLE_API_KEY env var' }) };
    }

    const modelCandidates = [
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.5-flash'
    ];

    const baseText = `Create a tasteful, photorealistic memorial banner background in 16:9.
Environment: ${prompt}.
Style: soft light, natural colors, respectful mood, cinematic composition. No text, no people, no faces, no logos.`;

    const payloadVariants = [
      { contents: [{ role: 'user', parts: [{ text: baseText }] }], generationConfig: { response_mime_type: 'image/png' } },
      { contents: [{ role: 'user', parts: [{ text: baseText }] }], generationConfig: { response_mime_type: 'image/jpeg' } },
      { contents: [{ role: 'user', parts: [{ text: baseText }] }] }
    ];

    let lastError = null;
    for (const model of modelCandidates) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      for (const variant of payloadVariants) {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
          body: JSON.stringify(variant),
        });
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (!resp.ok) {
          lastError = { model, status: resp.status, endpoint, data };
          continue;
        }
        // Extract image
        let outBase64 = '';
        try {
          const parts = data.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) { outBase64 = p.inlineData.data; break; }
            if (p.inline_data?.data) { outBase64 = p.inline_data.data; break; }
          }
        } catch (e) {
          lastError = { model, status: resp.status, endpoint, data, parseError: String(e) };
        }
        if (outBase64) {
          return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: outBase64, modelUsed: model }) };
        }
        lastError = { model, status: resp.status, endpoint, data };
      }
    }

    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'Gemini API error', details: lastError || 'Unknown' }) };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server error', details: String(e) }) };
  }
}
