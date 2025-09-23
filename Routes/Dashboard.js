// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { shopifyApi, LATEST_API_VERSION } = require("@shopify/shopify-api");

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

router.get("/summary", async (req, res) => {
  try {
    // Standard Shopify Node template legger session på res.locals.shopify.session
    const session = res.locals?.shopify?.session;
    if (!session) return res.status(401).json({ error: "No Shopify session" });

    const client = new shopifyApi({ apiVersion: LATEST_API_VERSION }).clients.Graphql({ session });

    const since = isoDaysAgo(7);
    const sinceQuery = `created_at:>=${since}`;

    const query = `
      query($sinceQuery: String) {
        orders(first: 100, query: $sinceQuery) {
          edges {
            node {
              id
              createdAt
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    `;

    const resp = await client.query({ data: { query, variables: { sinceQuery } } });
    const edges = resp.body.data.orders.edges || [];
    const orders = edges.map(e => e.node);

    const total = orders.reduce((sum, o) => sum + Number(o.totalPriceSet.shopMoney.amount), 0);
    const currency = orders[0]?.totalPriceSet.shopMoney.currencyCode || "NOK";

    res.json({
      range: { from: since, to: new Date().toISOString() },
      orders: { count: orders.length },
      revenue: { total, currency },
    });
  } catch (err) {
    console.error("DASHBOARD_SUMMARY_ERROR", err);
    res.status(500).json({ error: "Failed to fetch orders summary" });
  }
});

module.exports = router;
