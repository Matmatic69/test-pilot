/*
  Netlify Function: partners-register
  - POST { firstName: string, lastName: string, email: string, phone: string, storeName: string, city: string, desired_code?: string }
  - Creates a 5% coupon and a promotion code in Stripe
  - Attaches partner metadata to the promotion code
  - Returns { code, couponId, promotionCodeId }
  Env required: STRIPE_SECRET_KEY
*/

const Stripe = require('stripe');

exports.handler = async (event) => {
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
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY env var' }) };
    }
    const stripe = Stripe(secretKey);

    const body = JSON.parse(event.body || '{}');
    const { firstName, lastName, email, phone, storeName, city, desired_code } = body || {};

    if (!firstName || !lastName || !email || !phone || !storeName || !city) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const fullName = `${firstName} ${lastName}`.trim();

    const norm = (s) => (s || '').toString().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
    const rand4 = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    const base = desired_code ? norm(desired_code) : `PART-${norm(lastName)}-${rand4()}`;
    let code = base.slice(0, 40); // Stripe allows reasonably long codes; keep it short

    // 1) Create a 5% coupon (applies once)
    const coupon = await stripe.coupons.create({
      percent_off: 5,
      duration: 'once',
      name: `5% - ${fullName}`,
      metadata: {
        type: 'partner_coupon',
        partner_first_name: firstName,
        partner_last_name: lastName,
        partner_name: fullName,
        partner_email: email,
        partner_phone: phone,
        partner_store_name: storeName,
        partner_city: city,
        commission_eur: '25'
      }
    });

    // 2) Create a promotion code with partner metadata
    let promotionCode;
    try {
      promotionCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code,
        active: true,
        metadata: {
          partner_first_name: firstName,
          partner_last_name: lastName,
          partner_name: fullName,
          partner_email: email,
          partner_phone: phone,
          partner_store_name: storeName,
          partner_city: city,
          partner_id: norm(`${storeName}-${firstName}-${lastName}`),
          commission_eur: '25',
          discount_percent: '5'
        }
      });
    } catch (e) {
      // If code conflict, retry with a new suffix once
      if (e && e.code === 'promotion_code.already_exists') {
        code = `${base}-${rand4()}`.slice(0, 40);
        promotionCode = await stripe.promotionCodes.create({
          coupon: coupon.id,
          code,
          active: true,
          metadata: {
            partner_first_name: firstName,
            partner_last_name: lastName,
            partner_name: fullName,
            partner_email: email,
            partner_phone: phone,
            partner_store_name: storeName,
            partner_city: city,
            partner_id: norm(`${storeName}-${firstName}-${lastName}`),
            commission_eur: '25',
            discount_percent: '5'
          }
        });
      } else {
        throw e;
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, couponId: coupon.id, promotionCodeId: promotionCode.id })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: String(e && e.message ? e.message : e) })
    };
  }
};
