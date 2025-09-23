// Server.js
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// API-ruter (pass på: mappen heter "Routes" og filen "Dashboard.js")
const dashboardRoutes = require('./Routes/Dashboard');
app.use('/dashboard', dashboardRoutes);

// Hovedside – enkel KPI-visning (kaller /dashboard/summary)
app.get('/', (_req, res) => {
  res.send(`
    <div style="font-family:system-ui; padding:16px; line-height:1.4;">
      <h2>Enthemed – Dashbord</h2>
      <div style="display:flex; gap:16px; margin:16px 0;">
        <div style="border:1px solid #eee; padding:12px; border-radius:12px; min-width:220px;">
          <div>Siste 7 dager – Omsetning</div>
          <div id="rev" style="font-size:24px; font-weight:700;">…</div>
        </div>
        <div style="border:1px solid #eee; padding:12px; border-radius:12px; min-width:220px;">
          <div>Siste 7 dager – Antall ordre</div>
          <div id="cnt" style="font-size:24px; font-weight:700;">…</div>
        </div>
      </div>
      <small id="note" style="color:#666"></small>
      <script>
        (async () => {
          try {
            const r = await fetch('/dashboard/summary', { credentials: 'include' });
            const d = await r.json();
            const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: (d.revenue && d.revenue.currency) || 'NOK' });
            document.getElementById('rev').textContent = fmt.format((d.revenue && d.revenue.total) || 0);
            document.getElementById('cnt').textContent = (d.orders && d.orders.count) || 0;
            if (d.error) document.getElementById('note').textContent = 'Merk: ' + d.error;
          } catch (e) {
            document.getElementById('rev').textContent = '—';
            document.getElementById('cnt').textContent = '—';
            document.getElementById('note').textContent = 'Kunne ikke hente data (mangler Shopify-innlogging/tilganger?).';
          }
        })();
      </script>
    </div>
  `);
});

app.listen(PORT, () => {
  console.log(`Serveren kjører på port ${PORT}`);
});
