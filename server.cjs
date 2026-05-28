const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
loadLocalEnv();

const port = process.env.PORT || 3001;
const allowedOrigin = process.env.CORS_ORIGIN;
const growwApiSecret = process.env.GROWW_API_SECRET;
const growwApiKey = process.env.GROWW_API_KEY || (growwApiSecret ? process.env.GROWW_API_AUTH_TOKEN : "");
const growwToken = growwApiSecret ? "" : process.env.GROWW_API_AUTH_TOKEN;
const yahooHeaders = {
  "User-Agent": "Mozilla/5.0 StockScout/1.0",
};
let yahooAuthCache = null;
let growwAccessTokenCache = null;

app.use(
  cors({
    origin: allowedOrigin ? allowedOrigin.split(",").map((origin) => origin.trim()) : true,
  }),
);

app.get("/", (_req, res) => {
  res.json({
    name: "StockScout API",
    status: "ok",
    endpoints: ["/health", "/stock/:ticker"],
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/live/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();

  if (!/^[A-Z0-9-]{1,16}$/.test(ticker)) {
    return res.status(400).json({ error: "Invalid ticker" });
  }

  if (!growwToken && (!growwApiKey || !growwApiSecret)) {
    return res.status(503).json({ error: "Groww credentials missing" });
  }

  try {
    const liveData = await getGrowwQuote(ticker);
    return res.json(liveData);
  } catch (err) {
    return res.status(err.response?.status || 502).json({
      error: "Could not fetch Groww live price",
      detail: err.response?.data || err.message,
    });
  }
});

app.get("/stock/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();

  if (!/^[A-Z0-9-]{1,16}$/.test(ticker)) {
    return res.status(400).json({ error: "Invalid ticker" });
  }

  const symbols = [`${ticker}.NS`, `${ticker}.BO`];

  for (const symbol of symbols) {
    try {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        {
          headers: yahooHeaders,
          timeout: 8000,
        },
      );

      const meta = response.data?.chart?.result?.[0]?.meta;
      if (!meta || !Number.isFinite(meta.regularMarketPrice)) continue;

      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      const fundamentals = await getFundamentals(symbol);

      return res.json({
        name: meta.longName || meta.shortName || ticker,
        ticker,
        exchange: meta.exchangeName || (symbol.endsWith(".BO") ? "BSE" : "NSE"),
        price,
        change: Number(change.toFixed(2)),
        open: meta.regularMarketOpen || 0,
        high: meta.regularMarketDayHigh || 0,
        low: meta.regularMarketDayLow || 0,
        high52: meta.fiftyTwoWeekHigh || 0,
        low52: meta.fiftyTwoWeekLow || 0,
        volume: meta.regularMarketVolume || 0,
        marketCap: meta.marketCap || null,
        currency: meta.currency || "INR",
        fundamentals,
        source: "Yahoo Finance",
        symbol,
      });
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        return res.status(504).json({ error: "Market data timed out" });
      }
    }
  }

  try {
    const live = await getGrowwQuote(ticker);
    return res.json({
      name: ticker,
      ticker,
      exchange: "NSE",
      price: live.price,
      change: live.change,
      open: live.open,
      high: live.high,
      low: live.low,
      high52: live.high52,
      low52: live.low52,
      volume: live.volume,
      marketCap: live.marketCap,
      currency: "INR",
      fundamentals: emptyFundamentals(),
      source: "Groww",
      symbol: live.exchangeSymbol,
      liveOnly: true,
    });
  } catch {
    // If Groww is not configured or unavailable, keep the normal not-found response.
  }

  return res.status(404).json({ error: "Stock not found" });
});

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function getGrowwLtp(ticker) {
  const accessToken = await getGrowwAccessToken();
  const exchangeSymbol = `NSE_${ticker}`;
  const response = await axios.get("https://api.groww.in/v1/live-data/ltp", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-API-VERSION": "1.0",
    },
    params: {
      segment: "CASH",
      exchange_symbols: exchangeSymbol,
    },
    timeout: 6000,
  });

  const price = response.data?.payload?.[exchangeSymbol];
  if (!Number.isFinite(price)) {
    throw new Error("Groww LTP missing from response");
  }

  return {
    ticker,
    exchangeSymbol,
    price,
    source: "Groww",
    updatedAt: Date.now(),
  };
}

async function getGrowwQuote(ticker) {
  const accessToken = await getGrowwAccessToken();
  const response = await axios.get("https://api.groww.in/v1/live-data/quote", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-API-VERSION": "1.0",
    },
    params: {
      exchange: "NSE",
      segment: "CASH",
      trading_symbol: ticker,
    },
    timeout: 6000,
  });

  const payload = response.data?.payload;
  const ohlc = parseOhlc(payload?.ohlc);
  const price = numberOrNull(payload?.last_price);
  if (!Number.isFinite(price)) {
    throw new Error("Groww quote missing last price");
  }

  return {
    ticker,
    exchangeSymbol: `NSE_${ticker}`,
    price,
    change: numberOrNull(payload?.day_change_perc) || 0,
    open: numberOrNull(payload?.open) || ohlc.open || 0,
    high: numberOrNull(payload?.high) || ohlc.high || 0,
    low: numberOrNull(payload?.low) || ohlc.low || 0,
    high52: numberOrNull(payload?.week_52_high) || 0,
    low52: numberOrNull(payload?.week_52_low) || 0,
    volume: numberOrNull(payload?.volume) || 0,
    marketCap: numberOrNull(payload?.market_cap),
    source: "Groww",
    updatedAt: Date.now(),
  };
}

function parseOhlc(value) {
  if (!value || typeof value !== "string") {
    return { open: 0, high: 0, low: 0, close: 0 };
  }

  const clean = value.replace(/[{}]/g, "");
  return clean.split(",").reduce(
    (result, part) => {
      const [key, rawValue] = part.split(":").map((item) => item.trim());
      if (key && rawValue) result[key] = numberOrNull(rawValue) || 0;
      return result;
    },
    { open: 0, high: 0, low: 0, close: 0 },
  );
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getGrowwAccessToken() {
  if (growwToken) return growwToken;

  const now = Math.floor(Date.now() / 1000);
  if (growwAccessTokenCache && growwAccessTokenCache.expiresAt > now + 60) {
    return growwAccessTokenCache.token;
  }

  const timestamp = String(now);
  const checksum = crypto
    .createHash("sha256")
    .update(`${growwApiSecret}${timestamp}`)
    .digest("hex");

  const response = await axios.post(
    "https://api.groww.in/v1/token/api/access",
    {
      key_type: "approval",
      checksum,
      timestamp,
    },
    {
      headers: {
        Authorization: `Bearer ${growwApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 8000,
    },
  );

  const token = response.data?.token;
  if (!token) throw new Error("Groww access token missing from response");

  const expiry = response.data?.expiry ? Date.parse(response.data.expiry) : null;
  growwAccessTokenCache = {
    token,
    expiresAt: expiry ? Math.floor(expiry / 1000) : now + 3600,
  };

  return token;
}

async function getFundamentals(symbol) {
  const fundamentals = emptyFundamentals();

  try {
    const auth = await getYahooAuth();
    const modules = [
      "defaultKeyStatistics",
      "financialData",
      "assetProfile",
      "summaryDetail",
    ].join(",");
    const summaryResponse = await axios.get(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
      {
        headers: {
          ...yahooHeaders,
          Cookie: auth.cookie,
        },
        timeout: 8000,
      },
    );

    const result = summaryResponse.data?.quoteSummary?.result?.[0];
    const financialData = result?.financialData;
    const keyStats = result?.defaultKeyStatistics;
    const summary = result?.summaryDetail;
    const profile = result?.assetProfile;

    fundamentals.peRatio =
      rawNumber(summary?.trailingPE) ||
      rawNumber(summary?.forwardPE) ||
      rawNumber(keyStats?.trailingPE) ||
      rawNumber(keyStats?.forwardPE);
    fundamentals.eps =
      rawNumber(keyStats?.trailingEps) ||
      rawNumber(keyStats?.forwardEps);
    fundamentals.bookValue = rawNumber(keyStats?.bookValue);
    fundamentals.priceToBook = rawNumber(keyStats?.priceToBook);
    fundamentals.dividendYield = rawNumber(summary?.dividendYield);
    fundamentals.profitMargins = rawNumber(keyStats?.profitMargins);
    fundamentals.revenueGrowth = rawNumber(financialData?.revenueGrowth);
    fundamentals.earningsGrowth = rawNumber(financialData?.earningsGrowth);
    fundamentals.debtToEquity = rawNumber(financialData?.debtToEquity);
    fundamentals.returnOnEquity = rawNumber(financialData?.returnOnEquity);
    fundamentals.beta = rawNumber(summary?.beta);
    fundamentals.sector = profile?.sector || null;
    fundamentals.industry = profile?.industry || null;
  } catch {
    // Some Yahoo summary modules fail for Indian tickers. Return what we have.
  }

  if (!fundamentals.peRatio && !fundamentals.eps && !fundamentals.sector) {
    await fillFundamentalsFromYahooPage(symbol, fundamentals);
  }

  return fundamentals;
}

function emptyFundamentals() {
  return {
    peRatio: null,
    eps: null,
    bookValue: null,
    priceToBook: null,
    dividendYield: null,
    profitMargins: null,
    revenueGrowth: null,
    earningsGrowth: null,
    debtToEquity: null,
    returnOnEquity: null,
    beta: null,
    sector: null,
    industry: null,
  };
}

async function fillFundamentalsFromYahooPage(symbol, fundamentals) {
  try {
    const response = await axios.get(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, {
      headers: {
        ...yahooHeaders,
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: 8000,
    });

    const html = String(response.data);
    const pe = findYahooValue(html, "trailingPE");
    const eps = findYahooValue(html, "epsTrailingTwelveMonths");
    const marketCap = findYahooValue(html, "marketCap");

    fundamentals.peRatio = fundamentals.peRatio || pe;
    fundamentals.eps = fundamentals.eps || eps;
    fundamentals.marketCap = fundamentals.marketCap || marketCap;
  } catch {
    // Keep fundamentals optional.
  }
}

function findYahooValue(html, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`"${escapedKey}"\\s*:\\s*\\{\\s*"raw"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

async function getYahooAuth() {
  if (yahooAuthCache) return yahooAuthCache;

  const cookieResponse = await axios.get("https://fc.yahoo.com", {
    headers: yahooHeaders,
    timeout: 8000,
    validateStatus: () => true,
  });
  const setCookie = cookieResponse.headers["set-cookie"] || [];
  const cookie = setCookie.map((item) => item.split(";")[0]).join("; ");

  const crumbResponse = await axios.get("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      ...yahooHeaders,
      Cookie: cookie,
    },
    timeout: 8000,
  });

  yahooAuthCache = {
    cookie,
    crumb: String(crumbResponse.data),
  };

  return yahooAuthCache;
}

function rawNumber(field) {
  if (typeof field?.raw === "number") return field.raw;
  if (typeof field === "number") return field;
  return null;
}

app.listen(port, () => {
  console.log(`StockScout API running on http://localhost:${port}`);
});
