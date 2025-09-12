const express = require('express');
const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Sett opp Shopify API-klient
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_orders'],
  hostName: process.env.HOST.replace(/https?:\/\//, ''),
  apiVersion: ApiVersion.April24,
});

// Hjemmeside
app.get('/', (req, res) => {
  res.send('<h1>Enthemed Dashboard</h1><p><a href="/orders">Vis siste ordrer</a></p>');
});

// Ordrer
app.get('/orders', async (req, res) => {
  try {
    const client = new shopify.clients.Rest({
      session: {
        shop: process.env.SHOP,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN
      }
    });

    const orders = await client.get({
      path: 'orders',
      query: { limit: 5, order: 'created_at desc' }
    });

    let html = '<h1>Siste ordrer</h1><ul>';
    orders.body.orders.forEach(order => {
      html += `<li>Ordre #${order.id} – ${order.created_at} – ${order.total_price} ${order.currency}</li>`;
    });
    html += '</ul>';

    res.send(html);
  } catch (error) {
    res.send('Feil ved henting av ordrer: ' + error.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Enthemed kjører på port ${PORT}`));const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Test-rute
app.get("/", (req, res) => {
  res.send("Hello from Enthemed app 🚀");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
