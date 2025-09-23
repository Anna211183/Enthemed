const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Koble inn API-rutene (legg merke til at dette MÅ komme etter at app er laget)
const dashboardRoutes = require('./Routes/Dashboard');
app.use('/dashboard', dashboardRoutes);

// Hovedside – viser dashbord
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family:system-ui; padding:16px;">
      <h2>Enthemed – Dashbord</h2>
      <div id="kpi" style="display:flex; gap:16px; margin:16px 0;">
        <div style="border:1px solid #eee; padding:12px; border-radius:12px;">
          <div>Siste 7 dager – Omsetning</div>
          <div id="rev" style="font-size:24px; font-weight:700;">…</div>
        </div>
        <div style="border:1px solid #eee; padding:12px; border-radius:12px;">
          <div>Siste 7 dager – Antall ordre</div>
          <div id="cnt" style="font-size:24px; font-weight:700;">…</div>
        </div>
      </div>
      <script>
        fetch('/dashboard/summary', { credentials: 'include' })
          .then(r => r.json())
          .then(d => {
            const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: d.revenue?.currency || 'NOK' });
            document.getElementById('rev').textContent = fmt.format(d.revenue?.total || 0);
            document.getElementById('cnt').textContent = d.orders?.count || 0;
          })
          .catch(() => {
            document.getElementById('rev').textContent = '—';
            document.getElementById('cnt').textContent = '—';
          });
      </script>
    </div>
  `);
});

app.listen(PORT, () => {
  console.log(\`Serveren kjører på port \${PORT}\`);
});
