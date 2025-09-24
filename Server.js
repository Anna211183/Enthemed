// Server.js – Enthemed (stabil: bruker ADMIN_API_ACCESS_TOKEN først)
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

// --- Konfig ---
const apiKey = reqEnv('SHOPIFY_API_KEY');
const apiSecret = reqEnv('SHOPIFY_API_SECRET');
const appUrl = reqEnv('SHOPIFY_APP_URL'); // fx https://enthemed-1.onrender.com
const scopes = (process.env.SHOPIFY_SCOPES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .join(',');
const hostName = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const apiVersion = '2025-01';

// Butikkdomene – hardkodet for nå
const SHOP = '3b1vc0-xj.myshopify.com';

// --- In-memory (fallback) ---
const stateStore = new Map();    // state -> ts
const tokenStore = new Map();    // shop -> access_token

// --- HMAC verif ---
function validHmac(query) {
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

// --- Hovedside (UI) ---
app.get('/', (_req, res) => {
  res.send(`
  <div style="font-family:system-ui;padding:16px;line-height:1.45;color:#111;background:#fff">
    <h2 style="margin:0 0 12px;font-weight:800;">Enthemed – Dashboard</h2>

    <div style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap">
      <div style="border:1px solid #ddd;padding:14px 16px;border-radius:12px;min-width:260px">
        <div style="font-size:14px;color:#222">Siste 7 dager – Omsetning</div>
        <div id="rev" style="font-size:28px;font-weight:800;color:#111;margin-top:4px">…</div>
      </div>
      <div style="border:1px solid #ddd;padding:14px 16px;border-radius:12px;min-width:260px">
        <div style="font-size:14px;color:#222">Siste 7 dager – Antall ordre</div>
        <div id="cnt" style="font-size:28px;font-weight:800;color:#111;margin-top:4px">…</div>
      </div>
    </div>

    <div id="empty" style="margin-top:6px;font-size:14px;color:#333;display:none">
      Ingen ordre de siste 7 dagene.
    </div>

    <div style="margin-top:16px">
      <button id="connect" style="cursor:pointer;border:1px solid #bbb;padding:8px 12px;border-radius:10px;background:#fafafa">
        🔑 Koble til Shopify (om nødvendig)
      </button>
      <button id="reload" style="cursor:pointer;border:1px solid #bbb;padding:8px 12px;border-radius:10px;background:#fafafa;margin-left:8px">
        🔄 Oppdater
      </button>
    </div>

    <div style="margin-top:24px;">
      <h3 style="margin:0 0 8px;font-weight:700;">Siste 14 dager – Omsetning & ordre</h3>
      <canvas id="salesChart" height="120"></canvas>
    </div>

    <script>
      // Knappene
      document.getElementById('connect').onclick = () => {
        const url = '/auth?shop=${SHOP}';
        if (window.top) window.top.location.href = url; else window.location.href = url;
      };
      document.getElementById('reload').onclick = () => {
        if (window.top) window.top.location.reload(); else window.location.reload();
      };

      // KPI: summary
      (async () => {
        try {
          const r = await fetch('/dashboard/summary', { credentials: 'include', cache:'no-store' });
          const d = await r.json();
          if (d.error) throw new Error(d.error);

          const fmt = new Intl.NumberFormat(undefined, { style:'currency', currency: d.currency || 'NOK' });
          const hasOrders = (d.orders || 0) > 0;

          document.getElementById('rev').textContent = hasOrders ? fmt.format(d.revenue || 0) : '0,00 kr';
          document.getElementById('cnt').textContent = hasOrders ? (d.orders || 0) : '0';
          document.getElementById('empty').style.display = hasOrders ? 'none' : 'block';
        } catch (e) {
          document.getElementById('rev').textContent = '–';
          document.getElementById('cnt').textContent = '–';
          document.getElementById('empty').style.display = 'block';
          document.getElementById('empty').textContent = 'Kunne ikke hente data. Klikk “Koble til Shopify” eller sjekk ACCESS_TOKEN.';
        }
      })();
    </script>

    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      // Linjegraf: omsetning + ordre (siste 14 dager)
      (async () => {
        try {
          const r = await fetch('/dashboard/daily?days=14', { cache: 'no-store' });
          const d = await r.json();
          if (d.error) throw new Error(d.error);

          const labels = d.data.map(x => x.date.slice(5)); // mm-dd
          const revenues = d.data.map(x => x.revenue);
          const orders = d.data.map(x => x.orders);

          const ctx = document.getElementById('salesChart').getContext('2d');
          new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'Omsetning (' + (d.currency || 'NOK') + ')',
                  data: revenues,
                  borderWidth: 2,
                  borderColor: '#4e79a7',
                  backgroundColor: 'rgba(78,121,167,0.08)',
                  fill: true,
                  tension: 0.25,
                  yAxisID: 'y1'
                },
                {
                  label: 'Ordre (antall)',
                  data: orders,
                  borderWidth: 2,
                  borderColor: '#f28e2b',
                  backgroundColor: 'rgba(242,142,43,0.08)',
                  fill: true,
                  tension: 0.25,
                  yAxisID: 'y2'
                }
              ]
            },
            options: {
              responsive: true,
              interaction: { mode: 'index', intersect: false },
              scales: {
                y1: { type: 'linear', position: 'left', grid: { drawOnChartArea: true } },
                y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
              }
            }
          });
        } catch (e) {
          console.error('Chart error', e);
          const c = document.getElementById('salesChart');
          if (c) c.outerHTML = '<div style="color:#b00">Kunne ikke laste salgsgraf.</div>';
        }
      })();
    </script>
  </div>
  `);
});

// --- Start OAuth (reserve) ---
app.get('/auth', (req, res) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!shop.endsWith('.myshopify.com')) return res.status(400).send('Missing/invalid ?shop=xxxx.myshopify.com');
  if (tokenStore.get(shop)) return res.redirect('/');

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

// --- OAuth callback (reserve) ---
app.get('/auth/callback', async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;
    if (!shop || !hmac || !code || !state) return res.status(400).send('Missing parameters');
    if (!stateStore.has(state)) return res.status(400).send('Invalid state');
    stateStore.delete(state);
    if (!validHmac(req.query)) return res.status(400).send('HMAC validation failed');

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

// --- KPI-endepunkt (prioriterer ADMIN_API_ACCESS_TOKEN) ---
app.get('/dashboard/summary', async (_req, res) => {
  try {
    let token = (process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '').trim();
    if (!token) token = tokenStore.get(SHOP);
    if (!token) {
      return res.status(401).json({
        error: 'No token available',
        note: 'Klikk “Koble til Shopify” eller sett SHOPIFY_ADMIN_API_ACCESS_TOKEN i Render.'
      });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const url =
      `https://${SHOP}/admin/api/${apiVersion}/orders.json` +
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
      return res.status(502).json({ error: 'Shopify API error', detail: t });
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

// --- Sales per day (last N days) ---
app.get('/dashboard/daily', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days || '7', 10)));
    let token = (process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '').trim();
    if (!token) token = tokenStore.get(SHOP);
    if (!token) return res.status(401).json({ error: 'No token available' });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();
    const url =
      `https://${SHOP}/admin/api/${apiVersion}/orders.json` +
      `?status=any&created_at_min=${encodeURIComponent(sinceISO)}` +
      `&fields=total_price,currency,created_at&limit=250`;
    // NOTE: For stores med mange ordre må du paginere (page_info). Holder for nå.

    const r = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    if (!r.ok) return res.status(502).json({ error: 'Shopify API error', detail: await r.text() });

    const data = await r.json();
    const orders = data.orders || [];
    const currency = orders[0]?.currency || 'NOK';

    // Seed alle dager
    const dayKey = (d) => d.toISOString().slice(0, 10);
    const series = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() - (days - 1 - i));
      series[dayKey(d)] = { date: dayKey(d), revenue: 0, orders: 0 };
    }

    // Gruppér
    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      if (!series[key]) continue;
      series[key].revenue += parseFloat(o.total_price || 0);
      series[key].orders += 1;
    }

    const result = Object.values(series);
    res.json({ days, currency, data: result });
  } catch (e) {
    console.error('daily error', e);
    res.status(500).json({ error: 'Internal' });
  }
});

// --- Healthcheck ---
app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Enthemed server listening on port ${PORT}`);
});
