const express = require('express');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Enkel test-route
app.get('/', (req, res) => {
  res.send('Enthemed app kjører 🚀');
});

app.listen(PORT, () => {
  console.log(`Serveren kjører på port ${PORT}`);
});
