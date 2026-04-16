/*
  Netlify Function: email-qr
  - POST { docId, finalUrl, qrPngBase64, customer, shipping }
  - Sends an email with the QR PNG attached to ADMIN_EMAIL using SendGrid API
  - Requires env:
      SENDGRID_API_KEY
      ADMIN_EMAIL
      FROM_EMAIL
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

  const { docId, finalUrl, qrPngBase64, customer, shipping } = body || {};
  if (!docId || !finalUrl || !qrPngBase64) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing docId, finalUrl or qrPngBase64' }) };
  }

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const FROM_EMAIL = process.env.FROM_EMAIL || ADMIN_EMAIL;
  if (!SENDGRID_API_KEY || !ADMIN_EMAIL || !FROM_EMAIL) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing SENDGRID_API_KEY / ADMIN_EMAIL / FROM_EMAIL env vars' }) };
  }

  const subject = `Nouveau QR généré · doc ${docId}`;
  const plain = `Un nouveau QR a été généré.\n\nLien mémorial: ${finalUrl}\nDoc ID: ${docId}\nClient: ${customer?.email || 'inconnu'}\nNom: ${customer?.name || shipping?.name || 'inconnu'}\nAdresse: ${shipping?.address?.line1 || ''} ${shipping?.address?.postal_code || ''} ${shipping?.address?.city || ''} ${shipping?.address?.country || ''}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
      <h2>Nouvel achat confirmé – QR généré</h2>
      <p><strong>Lien mémorial:</strong> <a href="${finalUrl}">${finalUrl}</a></p>
      <p><strong>Doc ID:</strong> ${docId}</p>
      <p><strong>Client:</strong> ${customer?.email || 'inconnu'} — ${customer?.name || shipping?.name || ''}</p>
      <p><strong>Adresse:</strong> ${shipping?.address?.line1 || ''} ${shipping?.address?.postal_code || ''} ${shipping?.address?.city || ''} ${shipping?.address?.country || ''}</p>
      <p>Le QR en haute définition est joint à cet email (PNG).</p>
    </div>
  `;

  const sgPayload = {
    personalizations: [
      {
        to: [{ email: ADMIN_EMAIL }],
        subject,
      }
    ],
    from: { email: FROM_EMAIL, name: 'Souvenir QR' },
    content: [
      { type: 'text/plain', value: plain },
      { type: 'text/html', value: html },
    ],
    attachments: [
      {
        content: qrPngBase64,
        type: 'image/png',
        filename: `QR-Souvenir-${docId}.png`,
        disposition: 'attachment'
      }
    ]
  };

  try {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sgPayload)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=> '');
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'SendGrid error', details: txt }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server error', details: String(e) }) };
  }
};
