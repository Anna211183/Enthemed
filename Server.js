// Server.js – Enthemed (Shopify OAuth + Dashboard)
const express = require('express');
const dotenv = require('dotenv');
const crypto = require('crypto');

// -------------------- Boot & config --------------------
dotenv.config();

function reqEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === '') {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return String(v).trim();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify app config
const apiKey = reqEnv('SHOPIFY_API_KEY');
const apiSecret = reqEnv('SHOPIFY_API_SECRET');
const appUrl = reqEnv('SHOPIFY_APP_URL'); // e.g. https://enthemed-1.onrender.com
const scopes = (process.env.SHOPIFY_SCOPES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .join(',');
const hostName = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const apiVersion = '2025-01';

// -------------------- In-memory stores (ok for nå) --------------------
const stateStore = new Map();  // state -> ts
const tokenStore = new Map();  // shop -> access_token

// -------------------- Utils --------------------
function validHmac(query) {
  // Verify HMAC from Shopify callback
  const { hmac, signature, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');

  const digest = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch {
    return false;
  }
}

// -------------------- UI (/) --------------------
app.get('/', (_req, res) => {
  res.send(`
  <div style="font-family:system-ui;padding:16px;line-height:1.45">
    <h2>Enthemed – Dashboard</h2>
    <div style="display:flex;gap:16px;margin:16px 0">
      <div style="border:1px solid #eee;padding:12px;border-radius:12px">
        <div>Siste 7 dager – Omsetning</div>
        <div id="rev" style="font-size:24px;font-weight:700">…</div>
      </div>
      <div style="border:1px solid #eee;padding:12px;border-radius:12px">
        <div>Siste 7 dager – Antall ordre</div>
        <div id="cnt" style="font-size:24px;font-weight:700">…</div>
      </div>
    </div>
    <small id="note" style="color:#666"></small>

    <div style="margin-top:16px">
      <a href="/auth?shop=3b1vc0-xj.myshopify.com">🔑 Koble til Shopify (hvis nødvendig)</a>
    </div>

    <script>
    (async () => {
      try {
        const r = await fetch('/dashboard/summary', { credentials: 'include' });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        const fmt = new Intl.NumberFormat(undefined, { style:'currency', currency: d.currency || 'NOK' });
        document.getElementById('rev').textContent = fmt.format(d.revenue || 0);
        document.getElementById('cnt').textContent = d.orders || 0;
        document.getElementById('note').textContent = d.note || '';
      } catch (e) {
        document.getElementById('rev').textContent = '–';
        document.getElementById('cnt').textContent = '–';
        document.getElementById('note').textContent = 'Merk: No Shopify session – klikk “Koble til Shopify”.';
      }
    })();
    </script>
  </div>
  `);
});

// -------------------- OAuth start --------------------
app.get('/auth', (req, res) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return res.status(400).send('Missing/invalid ?shop=xxxx.myshopify.com');
  }

  if (tokenStore.get(shop)) {
    return res.redirect('/'); // already authed
  }

  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, Date.now());

  const redirectUri = `https://${hostName}/auth/callback`;
  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(installUrl);
});

// -------------------- OAuth callback --------------------
app.get('/auth/callback', async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;

    if (!shop || !hmac || !code || !state) {
      return res.status(400).send('Missing parameters');
    }
    if (!stateStore.has(state)) return res.status(400).send('Invalid state');
    stateStore.delete(state);

    if (!validHmac(req.query)) return res.status(400).send('HMAC validation failed');

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code })
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status(401).send('Token exchange failed: ' + t);
    }

    const { access_token } = await tokenRes.json();
    tokenStore.set(String(shop), access_token);

    return res.redirect('/');
  } catch (e) {
    console.error('OAuth callback error', e);
    return res.status(500).send('Auth error');
  }
});

// -------------------- KPI API --------------------
app.get('/dashboard/summary', async (_req, res) => {
  try {
    const shop = '3b1vc0-xj.myshopify.com'; // din butikk
    let token = tokenStore.get(shop);

    // Fallback: bruk Admin API access token fra env hvis OAuth ikke er gjort enda
    if (!token && process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
      token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    }
    if (!token) return res.status(401).json({ error: 'No Shopify session' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const url =
      `https://${shop}/admin/api/${apiVersion}/orders.json` +
      `?status=any&created_at_min=${encodeURIComponent(since)}` +
      `&fields=total_price,currency`;

    const r = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'Shopify API error: ' + t });
    }

    const data = await r.json();
    const orders = data.orders || [];
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const currency = orders[0]?.currency || 'NOK';

    res.json({ orders: orders.length, revenue, currency, note: '' });
  } catch (e) {
    console.error('summary error', e);
    res.status(500).json({ error: 'Internal' });
  }
});

// -------------------- (Valgfritt) andre ruter --------------------
try {
  const dashboardRoutes = require('./Routes/Dashboard');
  app.use('/dashboard', dashboardRoutes);
} catch { /* ignorer hvis mappa ikke finnes */ }

// -------------------- Start server --------------------
app.listen(PORT, () => {
  console.log(`Enthemed server listening on port ${PORT}`);
});
