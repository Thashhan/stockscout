const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

app.get("/stock/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  
  // Try NSE first, then BSE
  const symbols = [`${ticker}.NS`, `${ticker}.BO`];
  
  for (const symbol of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const data = response.data;
      const meta = data.chart.result[0].meta;

      if (!meta || !meta.regularMarketPrice) continue;

      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = prevClose ? (((price - prevClose) / prevClose) * 100) : 0;

      return res.json({
        name: meta.longName || meta.shortName || ticker,
        ticker: ticker,
        exchange: meta.exchangeName || "NSE",
        price: price,
        change: parseFloat(change.toFixed(2)),
        open: meta.regularMarketOpen || 0,
        high: meta.regularMarketDayHigh || 0,
        low: meta.regularMarketDayLow || 0,
        high52: meta.fiftyTwoWeekHigh || 0,
        low52: meta.fiftyTwoWeekLow || 0,
        volume: meta.regularMarketVolume || 0,
        marketCap: meta.marketCap || null,
        currency: meta.currency || "INR",
      });

    } catch (err) {
      continue;
    }
  }

  res.status(404).json({ error: "Stock not found" });
});

app.listen(3001, () => {
  console.log("StockScout server running on http://localhost:3001");
});
