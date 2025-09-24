// server.js – Enthemed (med Shopify OAuth)
const express = require('express');
const dotenv = require('dotenv');
const crypto = require('crypto');

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

const apiKey = reqEnv('SHOPIFY_API_KEY');
const apiSecret = reqEnv('SHOPIFY_API_SECRET');
const appUrl = reqEnv('SHOPIFY_APP_URL');           // e.g. https://enthemed-1.onrender.com
const scopes = (process.env.SHOPIFY_SCOPES || '').split(',').map(s => s.trim()).join(',');
const hostName = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

// ======== Enkle "lagringer" i minne (OK for nå) ========
const stateStore = new Map();              // state -> timestamp
const tokenStore = new Map();              // shop -> access_token

// Hjelpere
const hostName = process.env.SHOPIFY_APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = (process.env.SHOPIFY_SCOPES || '').split(',').map(s => s.trim()).join(',');
const apiVersion = '2025-01';

// Verifiser HMAC fra Shopify callback
function validHmac(query) {
  const { hmac, signature, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
}

// ======== DASHBOARD UI (embedded eller stand-alone) ========
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

// ======== START OAUTH ========
app.get('/auth', (req, res) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return res.status(400).send('Missing/invalid ?shop=xxxx.myshopify.com');
  }

  // Hvis vi har token i minne, gå rett til appen
  if (tokenStore.get(shop)) {
    return res.redirect('/');
  }

  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, Date.now());

  const redirectUri = `https://${hostName}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${encodeURIComponent(
    scopes
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.redirect(installUrl);
});

// ======== OAUTH CALLBACK ========
app.get('/auth/callback', async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;

    if (!shop || !hmac || !code || !state) {
      return res.status(400).send('Missing parameters');
    }
    // sjekk state
    if (!stateStore.has(state)) return res.status(400).send('Invalid state');
    stateStore.delete(state);

    // verifiser hmac
    if (!validHmac(req.query)) return res.status(400).send('HMAC validation failed');

    // bytt code -> access_token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code })
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status
