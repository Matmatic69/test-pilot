/*
  Netlify Function: commissions-export
  - GET with query: year=YYYY&month=MM (1-12)
  - Auth: Authorization: Bearer <ADMIN_TOKEN> or ?token=
  - Exports CSV of partner commissions (25€ per succeeded PI with commission_status=due) in the given month
  Env required: STRIPE_SECRET_KEY, ADMIN_TOKEN
*/

const Stripe = require('stripe');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const adminToken = process.env.ADMIN_TOKEN;
    const provided = (event.headers.authorization || '').replace(/^Bearer\s+/i, '') || (event.queryStringParameters || {}).token;
    if (!adminToken || provided !== adminToken) {
      return { statusCode: 401, headers, body: 'Unauthorized' };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return { statusCode: 500, headers, body: 'Missing STRIPE_SECRET_KEY' };
    }

    const { year, month } = event.queryStringParameters || {};
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      return { statusCode: 400, headers, body: 'Invalid or missing year/month' };
    }

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // first day of next month
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    const stripe = Stripe(secretKey);

    const query = 'status:"succeeded" AND metadata["commission_status"]:"due" AND metadata["partner_id"]:"*"';

    let page = undefined;
    const perPage = 100;
    const rows = [];

    while (true) {
      const res = await stripe.paymentIntents.search({ query, limit: perPage, page });
      for (const pi of res.data) {
        // Filter by created range client-side
        if (typeof pi.created === 'number' && (pi.created < startTs || pi.created >= endTs)) continue;
        const md = pi.metadata || {};
        rows.push({
          pi: pi.id,
          created: pi.created,
          amount_cents: pi.amount,
          currency: pi.currency,
          partner_id: md.partner_id || '',
          partner_name: md.partner_name || '',
          partner_email: md.partner_email || '',
          partner_phone: md.partner_phone || '',
          partner_store_name: md.partner_store_name || '',
          partner_city: md.partner_city || '',
          partner_code: md.partner_code || '',
        });
      }
      if (res.has_more && res.next_page) {
        page = res.next_page;
      } else {
        break;
      }
    }

    // Aggregate by partner
    const agg = new Map();
    for (const r of rows) {
      const key = `${r.partner_id}|${r.partner_name}|${r.partner_email}`;
      if (!agg.has(key)) {
        agg.set(key, {
          count: 0,
          codes: new Set(),
          payments: [],
          partner_id: r.partner_id,
          partner_name: r.partner_name,
          partner_email: r.partner_email,
          partner_phone: r.partner_phone,
          partner_store_name: r.partner_store_name,
          partner_city: r.partner_city,
        });
      }
      const a = agg.get(key);
      a.count += 1;
      if (r.partner_code) a.codes.add(r.partner_code);
      a.payments.push(r.pi);
    }

    // Build CSV
    const esc = (s) => {
      const v = (s == null ? '' : String(s));
      if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
      return v;
    };

    const headersCsv = [
      'partner_id','partner_name','partner_email','partner_phone','partner_store_name','partner_city','period_start_iso','period_end_iso','count','commission_per_sale_eur','total_commission_eur','codes_used','payment_intents'
    ];

    const lines = [];
    lines.push(headersCsv.join(','));
    for (const [, a] of agg) {
      const totalCommission = a.count * 25;
      const codes = Array.from(a.codes).join(';');
      const payments = a.payments.join(';');
      lines.push([
        esc(a.partner_id),
        esc(a.partner_name),
        esc(a.partner_email),
        esc(a.partner_phone || ''),
        esc(a.partner_store_name || ''),
        esc(a.partner_city || ''),
        esc(start.toISOString()),
        esc(end.toISOString()),
        esc(a.count),
        esc(25),
        esc(totalCommission),
        esc(codes),
        esc(payments)
      ].join(','));
    }

    const csv = lines.join('\n');

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="commissions-${y}-${String(m).padStart(2,'0')}.csv"`
      },
      body: csv
    };
  } catch (e) {
    return { statusCode: 500, headers, body: `Server error: ${e && e.message ? e.message : e}` };
  }
};
