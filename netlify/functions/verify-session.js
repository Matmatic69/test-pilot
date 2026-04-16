/*
  Netlify Function: verify-session (Stripe)
  - GET  / POST with { session_id }
  - Returns: { paid: boolean, session_id, amount_total, currency, customer, shipping, docId }
  - Requires env: STRIPE_SECRET_KEY
*/

const Stripe = require('stripe');

exports.handler = async function(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    let sessionId;
    if (event.httpMethod === 'GET') {
      const qp = event.queryStringParameters || {};
      sessionId = qp.session_id || qp.sessionId;
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      sessionId = body.session_id;
    } else {
      return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (!sessionId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing session_id' }) };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY env var' }) };
    }
    const stripe = Stripe(secretKey);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details', 'payment_intent', 'payment_intent.shipping']
    });

    const paid = session.payment_status === 'paid';
    const amount_total = session.amount_total || (session.payment_intent && session.payment_intent.amount_received) || null;
    const currency = session.currency || (session.payment_intent && session.payment_intent.currency) || null;
    const customer = session.customer_details || null;
    const shipping = (session.shipping_details || (session.payment_intent && session.payment_intent.shipping)) || null;
    const docId = (session.metadata && session.metadata.docId) || session.client_reference_id || null;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid, session_id: sessionId, amount_total, currency, customer, shipping, docId })
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server error', details: String(e) }) };
  }
};
