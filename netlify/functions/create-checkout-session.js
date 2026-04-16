/*
  Netlify Function: create-checkout-session (Stripe)
  - POST { docId: string, origin?: string }
  - Returns: { url } to redirect to Stripe Checkout
  - Requires env: STRIPE_SECRET_KEY
*/

const Stripe = require('stripe');

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

  try {
    const body = JSON.parse(event.body || '{}');
    const { docId, origin } = body || {};
    if (!docId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing docId' }) };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY env var' }) };
    }
    const stripe = Stripe(secretKey);

    const siteOrigin = origin || (process.env.DEPLOY_PRIME_URL || process.env.URL || 'http://localhost:8888');

    // Configure your amount and product details here
    const AMOUNT_CENTS = 5999; // 59,99 €
    const CURRENCY = 'eur';
    const PRODUCT_NAME = 'Souvenir Éternel - QR Mémorial';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Apple Pay est automatiquement disponible sur Stripe Checkout
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            unit_amount: AMOUNT_CENTS,
            product_data: { name: PRODUCT_NAME },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      shipping_address_collection: {
        allowed_countries: ['FR','BE','CH','CA','US','GB','DE','ES','IT','LU','NL'],
      },
      phone_number_collection: { enabled: true },
      success_url: `${siteOrigin}/create?success=1&session_id={CHECKOUT_SESSION_ID}&docId=${encodeURIComponent(docId)}`,
      cancel_url: `${siteOrigin}/create?canceled=1&docId=${encodeURIComponent(docId)}`,
      client_reference_id: docId,
      metadata: { docId },
      payment_intent_data: {
        metadata: { docId }
      },
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: String(e) })
    };
  }
};
