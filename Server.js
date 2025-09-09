const express = require("express");
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
