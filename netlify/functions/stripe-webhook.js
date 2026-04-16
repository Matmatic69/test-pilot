/*
  Netlify Function: stripe-webhook
  - Handles Stripe webhooks
  - Events handled:
    * checkout.session.completed: attach partner metadata to PaymentIntent and mark commission due (25€)
    * charge.refunded: mark commission reversed
  Env required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
*/

const Stripe = require('stripe');

exports.handler = async (event) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers: corsHeaders, body: 'Missing STRIPE_SECRET_KEY' };
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = Stripe(secretKey);

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const isBase64 = event.isBase64Encoded;
  const bodyBuffer = Buffer.from(event.body || '', isBase64 ? 'base64' : 'utf8');

  let stripeEvent;
  try {
    if (!webhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET');
    stripeEvent = stripe.webhooks.constructEvent(bodyBuffer, sig, webhookSecret);
  } catch (err) {
    return { statusCode: 400, headers: corsHeaders, body: `Webhook signature verification failed: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const sessionId = session.id;
        // Retrieve expanded session to get promotion code metadata and the PI
        const fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: [
            'payment_intent',
            // Try both places promotion code may appear
            'discounts.promotion_code',
            'total_details.breakdown.discounts.discount.promotion_code'
          ]
        });

        let partnerMeta = null;
        let partnerCode = null;

        // 1) Prefer top-level discounts array if present
        if (Array.isArray(fullSession?.discounts) && fullSession.discounts.length > 0) {
          for (const d of fullSession.discounts) {
            const pc = d?.promotion_code;
            if (pc && pc.code) {
              partnerCode = pc.code;
              partnerMeta = pc.metadata || {};
              break;
            }
          }
        }

        // 2) Fallback to total_details.breakdown if needed
        if (!partnerCode) {
          const breakdown = fullSession?.total_details?.breakdown;
          if (breakdown?.discounts && breakdown.discounts.length > 0) {
            for (const d of breakdown.discounts) {
              const pc = d?.discount?.promotion_code;
              if (pc && pc.code) {
                partnerCode = pc.code;
                partnerMeta = pc.metadata || {};
                break;
              }
            }
          }
        }

        const paymentIntentId = fullSession?.payment_intent?.id || session.payment_intent;
        if (paymentIntentId) {
          const toSet = {
            docId: session?.metadata?.docId || '',
            partner_code: partnerCode || '',
            partner_id: partnerMeta?.partner_id || '',
            partner_name: partnerMeta?.partner_name || '',
            partner_email: partnerMeta?.partner_email || '',
            partner_phone: partnerMeta?.partner_phone || '',
            partner_store_name: partnerMeta?.partner_store_name || '',
            partner_city: partnerMeta?.partner_city || '',
            discount_percent: partnerMeta?.discount_percent || '5',
            commission_eur: partnerMeta?.commission_eur || '25',
            commission_status: 'due'
          };
          await stripe.paymentIntents.update(paymentIntentId, { metadata: { ...toSet } });
        }
        break;
      }
      case 'charge.refunded': {
        const charge = stripeEvent.data.object;
        const paymentIntentId = charge.payment_intent;
        if (paymentIntentId) {
          await stripe.paymentIntents.update(paymentIntentId, {
            metadata: { commission_status: 'reversed' }
          });
        }
        break;
      }
      default:
        // ignore others
        break;
    }

    return { statusCode: 200, headers: corsHeaders, body: 'ok' };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: `Handler error: ${e.message || e}` };
  }
};
