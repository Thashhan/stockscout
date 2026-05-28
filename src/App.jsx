import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://stockscout-fv6f.onrender.com";

const SUGGESTIONS = [
  "RELIANCE",
  "INFY",
  "TCS",
  "HDFCBANK",
  "BAJFINANCE",
  "TATASTEEL",
  "ZOMATO",
  "IRCTC",
];

const DEFAULT_WATCHLIST = ["RELIANCE", "TCS", "HDFCBANK"];
const WATCHLIST_STORAGE_KEY = "stockscout-watchlist";
const CHECKLIST_STORAGE_KEY = "stockscout-checklists";
const REFRESH_INTERVAL_MS = 15000;
const LIVE_PRICE_INTERVAL_MS = 2000;
const RESEARCH_CHECKLIST = [
  "Checked sales and profit growth",
  "Checked debt level",
  "Checked valuation",
  "Read latest quarterly result",
  "Compared with one competitor",
  "Decided my entry price",
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value) {
  const numeric = toNumber(value);
  if (!numeric) return "N/A";

  return `Rs. ${numeric.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatMarketCap(cap) {
  if (!cap) return "N/A";
  if (cap >= 1e12) return `Rs. ${(cap / 1e12).toFixed(2)} lakh cr`;
  if (cap >= 1e9) return `Rs. ${(cap / 1e9).toFixed(1)}k cr`;
  return `Rs. ${(cap / 1e7).toFixed(1)} cr`;
}

function formatRatio(value, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "N/A";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
}

function getScore(data) {
  let score = 48;
  const price = toNumber(data.price);
  const high52 = toNumber(data.high52);
  const volume = toNumber(data.volume);

  if (data.change > 0) score += 10;
  if (data.change > 2) score += 6;
  if (high52 > 0 && price > 0) {
    const rangePosition = price / high52;
    if (rangePosition > 0.9) score += 16;
    else if (rangePosition > 0.7) score += 9;
  }
  if (volume > 1000000) score += 10;
  if (data.marketCap && data.marketCap > 1e12) score += 10;
  if (data.fundamentals?.returnOnEquity > 0.15) score += 5;
  if (data.fundamentals?.debtToEquity && data.fundamentals.debtToEquity < 100) score += 4;
  if (data.fundamentals?.revenueGrowth > 0.1) score += 5;

  return clamp(score, 1, 99);
}

function getVerdict(score) {
  if (score >= 85) return "High momentum";
  if (score >= 75) return "Strong setup";
  if (score >= 65) return "Worth researching";
  if (score >= 55) return "Watch closely";
  return "Higher risk";
}

function getTone(score) {
  if (score >= 75) return "positive";
  if (score >= 55) return "neutral";
  return "negative";
}

function getQuickTake(stock) {
  if (stock.score >= 80) {
    return `${stock.name} is trading with strong momentum and sits close to its 52-week high. Use this as a research signal, then check fundamentals before acting.`;
  }

  if (stock.score >= 60) {
    return `${stock.name} has a balanced setup. It may deserve a place on your watchlist while you wait for a better entry or stronger confirmation.`;
  }

  return `${stock.name} is showing mixed signals right now. Treat it as a high-risk idea until price strength, volume, or business quality improves.`;
}

function getRangePercent(stock) {
  if (!stock || stock.high52 <= stock.low52) return 0;

  return clamp(
    ((stock.price - stock.low52) / (stock.high52 - stock.low52)) * 100,
    0,
    100,
  );
}

function getScoutPlan(stock, rangePercent) {
  const reasons = [];
  const risks = [];
  const nextChecks = [
    "Check sales and profit growth for the last 3-5 years.",
    "Compare valuation with companies in the same sector.",
    "Read the latest quarterly result before investing money.",
  ];

  if (stock.change > 1.5) {
    reasons.push("Price is showing positive momentum today.");
  } else if (stock.change < -1.5) {
    risks.push("Price is weak today, so avoid rushing into an entry.");
  }

  if (rangePercent >= 80) {
    reasons.push("It is trading close to its 52-week high, which can signal strength.");
    risks.push("Buying near highs can be risky if the move is already stretched.");
  } else if (rangePercent <= 25) {
    risks.push("It is near the lower part of its yearly range, so the market may be cautious.");
  } else {
    reasons.push("It is not at an extreme point in its 52-week range.");
  }

  if (stock.volume > 1000000) {
    reasons.push("Trading volume is healthy, so the move has some participation.");
  } else {
    risks.push("Volume is low, so price moves may be less reliable.");
  }

  if (stock.marketCap && stock.marketCap > 1e12) {
    reasons.push("It is a large company, which usually reduces business survival risk.");
  }

  if (stock.fundamentals?.returnOnEquity > 0.15) {
    reasons.push("Return on equity looks healthy from available fundamentals.");
  }

  if (stock.fundamentals?.debtToEquity > 150) {
    risks.push("Debt/equity looks elevated, so balance sheet quality needs checking.");
  }

  if (stock.score >= 75) {
    return {
      action: "Research deeper",
      summary: "This looks interesting enough for deeper study, but not an automatic buy.",
      reasons,
      risks,
      nextChecks,
    };
  }

  if (stock.score >= 55) {
    return {
      action: "Add to watchlist",
      summary: "This is worth tracking, but the signal is not strong enough yet.",
      reasons,
      risks,
      nextChecks,
    };
  }

  return {
    action: "Skip for now",
    summary: "There are better places to spend research time unless you already know the business well.",
    reasons,
    risks,
    nextChecks,
  };
}

function getScoreBreakdown(stock, rangePercent) {
  return [
    {
      label: "Momentum",
      status: stock.change > 1 ? "Strong" : stock.change >= 0 ? "Positive" : "Weak",
      tone: stock.change > 1 ? "good" : stock.change >= 0 ? "ok" : "risk",
      detail:
        stock.change >= 0
          ? `Up ${stock.change.toFixed(2)}% today.`
          : `Down ${Math.abs(stock.change).toFixed(2)}% today.`,
    },
    {
      label: "52-week position",
      status: rangePercent >= 80 ? "Near high" : rangePercent >= 40 ? "Middle range" : "Near low",
      tone: rangePercent >= 80 ? "good" : rangePercent >= 40 ? "ok" : "risk",
      detail: `Current price is around ${Math.round(rangePercent)}% of its yearly range.`,
    },
    {
      label: "Volume",
      status: stock.volume > 1000000 ? "Healthy" : "Low",
      tone: stock.volume > 1000000 ? "good" : "risk",
      detail:
        stock.volume > 1000000
          ? "Enough trading activity for a cleaner signal."
          : "Low activity can make price moves less reliable.",
    },
    {
      label: "Company size",
      status: stock.marketCap > 1e12 ? "Large cap" : stock.marketCap ? "Smaller cap" : "Unknown",
      tone: stock.marketCap > 1e12 ? "good" : stock.marketCap ? "ok" : "risk",
      detail: stock.marketCap
        ? `Market cap is ${formatMarketCap(stock.marketCap)}.`
        : "Market cap was not available from the data source.",
    },
    {
      label: "Fundamentals",
      status:
        stock.fundamentals?.returnOnEquity > 0.15
          ? "Healthy ROE"
          : stock.fundamentals?.peRatio
            ? "Data available"
            : "Limited data",
      tone:
        stock.fundamentals?.returnOnEquity > 0.15
          ? "good"
          : stock.fundamentals?.peRatio
            ? "ok"
            : "risk",
      detail: stock.fundamentals?.peRatio
        ? `P/E is ${formatRatio(stock.fundamentals.peRatio)}.`
        : "Fundamental data is limited for this ticker.",
    },
  ];
}

function getRiskLevel(stock, rangePercent) {
  const riskReasons = [];
  let riskPoints = 0;

  if (stock.change < -2) {
    riskPoints += 2;
    riskReasons.push("price is falling sharply today");
  } else if (stock.change < 0) {
    riskPoints += 1;
    riskReasons.push("price is slightly weak today");
  }

  if (rangePercent >= 88) {
    riskPoints += 1;
    riskReasons.push("it is very close to its 52-week high");
  }

  if (rangePercent <= 20) {
    riskPoints += 2;
    riskReasons.push("it is near the lower part of its yearly range");
  }

  if (stock.volume < 1000000) {
    riskPoints += 1;
    riskReasons.push("volume is low");
  }

  if (!stock.marketCap) {
    riskPoints += 1;
    riskReasons.push("market cap data is missing");
  } else if (stock.marketCap < 2e11) {
    riskPoints += 1;
    riskReasons.push("it is a smaller company compared with large caps");
  }

  if (stock.fundamentals?.debtToEquity > 150) {
    riskPoints += 2;
    riskReasons.push("debt/equity looks high");
  }

  if (stock.fundamentals?.revenueGrowth < 0) {
    riskPoints += 1;
    riskReasons.push("revenue growth is negative");
  }

  if (riskPoints >= 4) {
    return {
      level: "High risk",
      tone: "risk",
      summary: `High risk because ${riskReasons.slice(0, 2).join(" and ")}.`,
    };
  }

  if (riskPoints >= 2) {
    return {
      level: "Medium risk",
      tone: "ok",
      summary: `Medium risk because ${riskReasons.slice(0, 2).join(" and ")}.`,
    };
  }

  return {
    level: "Lower risk",
    tone: "good",
    summary: "Lower snapshot risk because price action, volume, and company size look reasonably stable.",
  };
}

function enrichStock(data) {
  const score = getScore(data);

  return {
    ...data,
    score,
    tone: getTone(score),
    verdict: getVerdict(score),
  };
}

function loadSavedWatchlist() {
  try {
    const saved = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!saved) return DEFAULT_WATCHLIST;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;

    return parsed.filter((ticker) => typeof ticker === "string" && ticker.trim());
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

function loadSavedChecklists() {
  try {
    const saved = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return parsed;
  } catch {
    return {};
  }
}

function ScoreRing({ score, tone }) {
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className={`score-ring ${tone}`} aria-label={`Scout score ${score}`}>
      <svg viewBox="0 0 80 80" role="img" aria-hidden="true">
        <circle className="score-track" cx="40" cy="40" r={radius} />
        <circle
          className="score-progress"
          cx="40"
          cy="40"
          r={radius}
          strokeDasharray={`${progress} ${circumference}`}
        />
      </svg>
      <span>{score}</span>
    </div>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </article>
  );
}

function ScoutPlan({ plan }) {
  return (
    <article className="scout-plan">
      <div className="section-title">
        <h3>Scout decision</h3>
        <span>{plan.action}</span>
      </div>
      <p>{plan.summary}</p>

      <div className="decision-grid">
        <div>
          <h4>Why it may be worth your time</h4>
          <ul>
            {plan.reasons.length ? (
              plan.reasons.map((reason) => <li key={reason}>{reason}</li>)
            ) : (
              <li>No strong positive signal from the live snapshot.</li>
            )}
          </ul>
        </div>

        <div>
          <h4>What could go wrong</h4>
          <ul>
            {plan.risks.length ? (
              plan.risks.map((risk) => <li key={risk}>{risk}</li>)
            ) : (
              <li>No major snapshot risk, but fundamentals still matter.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="next-checks">
        <h4>Before you invest, check this</h4>
        <ol>
          {plan.nextChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function ScoreBreakdown({ items }) {
  return (
    <article className="score-breakdown">
      <div className="section-title">
        <h3>Score breakdown</h3>
        <span>Why this score?</span>
      </div>
      <div className="breakdown-list">
        {items.map((item) => (
          <div className="breakdown-item" key={item.label}>
            <div>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
              <p>{item.detail}</p>
            </div>
            <i className={item.tone} aria-hidden="true" />
          </div>
        ))}
      </div>
    </article>
  );
}

function RiskCard({ risk }) {
  return (
    <article className={`risk-card ${risk.tone}`}>
      <div>
        <span>Risk level</span>
        <strong>{risk.level}</strong>
      </div>
      <p>{risk.summary}</p>
    </article>
  );
}

function FundamentalsPanel({ fundamentals }) {
  const hasProfile = fundamentals?.sector || fundamentals?.industry;

  return (
    <article className="fundamentals-panel">
      <div className="section-title">
        <h3>Fundamentals</h3>
        <span>Yahoo data</span>
      </div>
      <div className="fundamentals-grid">
        <MetricCard label="P/E" value={formatRatio(fundamentals?.peRatio)} />
        <MetricCard label="EPS" value={formatRatio(fundamentals?.eps)} />
        <MetricCard label="P/B" value={formatRatio(fundamentals?.priceToBook)} />
        <MetricCard label="Debt/Equity" value={formatRatio(fundamentals?.debtToEquity)} />
        <MetricCard label="ROE" value={formatPercent(fundamentals?.returnOnEquity)} />
        <MetricCard label="Profit margin" value={formatPercent(fundamentals?.profitMargins)} />
        <MetricCard label="Revenue growth" value={formatPercent(fundamentals?.revenueGrowth)} />
        <MetricCard label="Earnings growth" value={formatPercent(fundamentals?.earningsGrowth)} />
        <MetricCard label="Beta" value={formatRatio(fundamentals?.beta)} />
      </div>
      {hasProfile ? (
        <p>
          {fundamentals.sector || "Unknown sector"}
          {fundamentals.industry ? ` - ${fundamentals.industry}` : ""}
        </p>
      ) : (
        <p>Some fundamentals may be unavailable for this ticker from Yahoo Finance.</p>
      )}
    </article>
  );
}

function ResearchChecklist({ ticker, checkedItems, onToggle }) {
  const completed = checkedItems.length;
  const progress = Math.round((completed / RESEARCH_CHECKLIST.length) * 100);

  return (
    <article className="research-checklist">
      <div className="section-title">
        <h3>Research checklist</h3>
        <span>{progress}% done</span>
      </div>
      <div className="check-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="checklist-items">
        {RESEARCH_CHECKLIST.map((item) => {
          const checked = checkedItems.includes(item);

          return (
            <label className="checklist-item" key={item}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(ticker, item)}
              />
              <span>{item}</span>
            </label>
          );
        })}
      </div>
    </article>
  );
}

function CompareCard({ stock, winner }) {
  const rangePercent = getRangePercent(stock);

  return (
    <article className={`compare-card ${winner ? "winner" : ""}`}>
      <div className="compare-head">
        <div>
          <span>{stock.ticker}</span>
          <h4>{stock.name}</h4>
        </div>
        <strong>{stock.score}</strong>
      </div>
      <dl>
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(stock.price)}</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd className={stock.change >= 0 ? "gain-text" : "loss-text"}>
            {stock.change >= 0 ? "+" : ""}
            {stock.change.toFixed(2)}%
          </dd>
        </div>
        <div>
          <dt>52w position</dt>
          <dd>{Math.round(rangePercent)}%</dd>
        </div>
        <div>
          <dt>Market cap</dt>
          <dd>{formatMarketCap(stock.marketCap)}</dd>
        </div>
      </dl>
      <p>{stock.verdict}</p>
    </article>
  );
}

function CompareResult({ stocks }) {
  const [first, second] = stocks;
  const winner = first.score >= second.score ? first : second;
  const runnerUp = winner.ticker === first.ticker ? second : first;
  const scoreGap = Math.abs(first.score - second.score);

  return (
    <section className="compare-result" aria-label="Stock comparison result">
      <div className="section-title">
        <h3>Compare result</h3>
        <span>{winner.ticker} leads</span>
      </div>
      <p>
        {winner.ticker} looks more research-worthy than {runnerUp.ticker} from
        this live snapshot. The score gap is {scoreGap} points, so treat this as
        a starting filter, not a final investment decision.
      </p>
      <div className="compare-grid">
        <CompareCard stock={first} winner={winner.ticker === first.ticker} />
        <CompareCard stock={second} winner={winner.ticker === second.ticker} />
      </div>
    </section>
  );
}

function Watchlist({ items, onOpen, onRemove }) {
  return (
    <section className="watchlist-strip" aria-label="Saved watchlist">
      <div className="section-title">
        <h3>Saved watchlist</h3>
        <span>{items.length} saved</span>
      </div>
      <p>Tap a ticker to open it again. Remove anything that no longer deserves attention.</p>
      {items.length ? (
        <div className="watchlist-items">
          {items.map((ticker) => (
            <div className="watchlist-item" key={ticker}>
              <button type="button" onClick={() => onOpen(ticker)}>
                {ticker}
              </button>
              <button
                type="button"
                className="remove-watch"
                onClick={() => onRemove(ticker)}
                aria-label={`Remove ${ticker} from watchlist`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-watchlist">No saved stocks yet.</div>
      )}
    </section>
  );
}

function EmptyState({ onPick }) {
  return (
    <section className="empty-state" aria-label="Search prompt">
      <div className="empty-mark">SS</div>
      <h2>Scout an Indian stock in seconds</h2>
      <p>
        Search a ticker, compare price action, and turn the result into a
        shortlist for deeper research.
      </p>
      <button type="button" onClick={() => onPick("RELIANCE")}>
        Try RELIANCE
      </button>
    </section>
  );
}

function LandingPage({ onLaunch }) {
  const jumpTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <button type="button" className="landing-logo" onClick={() => jumpTo("landing-hero")}>
          <span />
          STOCKSCOUT
        </button>
        <button type="button" className="landing-nav-cta" onClick={onLaunch}>
          Launch App
        </button>
      </nav>

      <section className="landing-hero" id="landing-hero">
        <div className="landing-hero-bg" />
        <div className="landing-float-card card-one">
          <span>NSE - IRCTC</span>
          <strong>Rs. 892.45</strong>
          <em>+0.87% - Score 89</em>
        </div>
        <div className="landing-float-card card-two">
          <span>NSE - INFY</span>
          <strong>Rs. 1,182</strong>
          <em>+1.29%</em>
        </div>
        <div className="landing-float-card card-three">
          <span>NSE - TCS</span>
          <strong>Rs. 2,407</strong>
          <em className="down">-1.15%</em>
        </div>
        <div className="landing-float-card card-four">
          <span>SCOUT SCORE</span>
          <strong>89</strong>
          <em>Research deeper</em>
        </div>

        <p className="landing-tag">NSE - BSE - Real-Time Intelligence</p>
        <h1>
          SCOUT
          <span>SMARTER</span>
          <strong>INVEST</strong>
        </h1>
        <p className="landing-sub">
          The fastest way to research Indian stocks. Live price, fundamentals,
          risk level, watchlist, comparison, and a checklist in one clean flow.
        </p>
        <button type="button" className="landing-hero-btn" onClick={onLaunch}>
          Start Scouting
        </button>
      </section>

      <section className="landing-showcase">
        <div>
          <p className="landing-eyebrow">Built for Indian investors</p>
          <h2>Everything in your pocket</h2>
          <p>
            Stop jumping between different sites. StockScout combines live price,
            fundamentals from Yahoo, Groww-powered live quotes, risk, score,
            comparison, and research progress.
          </p>
          <div className="landing-pills">
            <span>Live price</span>
            <span>Scout score</span>
            <span>P/E - ROE - EPS</span>
            <span>Watchlist</span>
            <span>Compare</span>
            <span>Checklist</span>
          </div>
        </div>

        <div className="landing-phone-wrap">
          <div className="landing-phone">
            <div className="landing-phone-header">
              STOCKSCOUT <span>LIVE</span>
            </div>
            <div className="landing-phone-search">IRCTC</div>
            <div className="landing-phone-card">
              <span>IRCTC</span>
              <small>NSE - Travel and tourism</small>
              <strong>Rs. 892</strong>
              <em>+0.87% today</em>
            </div>
            <div className="landing-phone-score">
              <span>SCOUT SCORE</span>
              <strong>89</strong>
            </div>
            <div className="landing-phone-metrics">
              <span>ROE 38.4%</span>
              <span>P/E 54.1</span>
              <span>D/E 0.02</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-stats">
        <p className="landing-eyebrow">Why research matters</p>
        <h2>One search. Everything.</h2>
        <div className="landing-layers">
          <div><span>Live price</span><strong>Groww quotes</strong></div>
          <div><span>Fundamentals</span><strong>Yahoo data</strong></div>
          <div><span>Risk level</span><strong>Snapshot risk</strong></div>
          <div><span>Research flow</span><strong>Checklist progress</strong></div>
        </div>
      </section>

      <section className="landing-cta">
        <p className="landing-eyebrow">No signup. No download.</p>
        <h2>
          Start
          <span>Scouting</span>
          Now
        </h2>
        <button type="button" onClick={onLaunch}>
          Launch StockScout
        </button>
        <small>Research only - not financial advice</small>
      </section>

      <footer className="landing-footer">
        <span>StockScout - live price via Groww, fundamentals via Yahoo Finance</span>
        <span>Created by Thashhan, Ritvan, and Prajwal</span>
      </footer>
    </main>
  );
}

export default function StockScout() {
  const [showApp, setShowApp] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTicker, setActiveTicker] = useState("");
  const [compareA, setCompareA] = useState("RELIANCE");
  const [compareB, setCompareB] = useState("TCS");
  const [compareStocks, setCompareStocks] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [watchlist, setWatchlist] = useState(loadSavedWatchlist);
  const [checklists, setChecklists] = useState(loadSavedChecklists);
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [livePriceStatus, setLivePriceStatus] = useState("idle");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const liveFailureCount = useRef(0);

  const rangePercent = useMemo(() => {
    return getRangePercent(stock);
  }, [stock]);

  const fetchStock = useCallback(async (ticker) => {
    const cleanTicker = ticker.trim().toUpperCase();
    const response = await fetch(
      `${API_BASE_URL}/stock/${encodeURIComponent(cleanTicker)}`,
    );
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || "Stock not found");
    }

    return enrichStock(data);
  }, []);

  const search = useCallback(async (ticker, options = {}) => {
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker) return;

    const silent = options.silent === true;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setStock(null);
    }
    setError("");
    setQuery(cleanTicker);
    setActiveTicker(cleanTicker);

    try {
      setStock(await fetchStock(cleanTicker));
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) {
        setError(
          err.message === "Stock not found"
            ? `"${cleanTicker}" was not found. Check the NSE/BSE ticker and try again.`
            : "StockScout could not reach live market data. Try again in a moment.",
        );
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [fetchStock]);

  const compare = useCallback(async () => {
    const firstTicker = compareA.trim().toUpperCase();
    const secondTicker = compareB.trim().toUpperCase();

    if (!firstTicker || !secondTicker) {
      setCompareError("Enter two tickers to compare.");
      return;
    }

    if (firstTicker === secondTicker) {
      setCompareError("Choose two different stocks.");
      return;
    }

    setCompareLoading(true);
    setCompareError("");
    setCompareStocks(null);

    try {
      const result = await Promise.all([fetchStock(firstTicker), fetchStock(secondTicker)]);
      setCompareStocks(result);
    } catch (err) {
      setCompareError(
        err.message === "Stock not found"
          ? "One of those tickers was not found. Check both symbols and try again."
          : "StockScout could not compare those stocks right now.",
      );
    } finally {
      setCompareLoading(false);
    }
  }, [compareA, compareB, fetchStock]);

  useEffect(() => {
    if (!activeTicker || !stock) return undefined;

    const timer = window.setInterval(() => {
      search(activeTicker, { silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activeTicker, search, stock]);

  useEffect(() => {
    if (!activeTicker || !stock) return undefined;

    let cancelled = false;
    const updateLivePrice = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/live/${encodeURIComponent(activeTicker)}`,
        );

        if (!response.ok) {
          liveFailureCount.current += 1;
          if (response.status === 503) {
            setLivePriceStatus("missing-token");
          } else if (response.status === 401) {
            setLivePriceStatus("login-needed");
          } else if (liveFailureCount.current >= 3) {
            setLivePriceStatus("unavailable");
          }
          return;
        }

        const data = await response.json();
        if (!Number.isFinite(data.price) || cancelled) return;

        liveFailureCount.current = 0;
        setStock((current) => {
          if (!current || current.ticker !== activeTicker) return current;

          const prevClose =
            current.price && current.change !== undefined
              ? current.price / (1 + current.change / 100)
              : null;
          const nextChange = prevClose ? ((data.price - prevClose) / prevClose) * 100 : current.change;

          return {
            ...current,
            price: data.price,
            change: Number(nextChange.toFixed(2)),
            open: data.open || current.open,
            high: data.high || current.high,
            low: data.low || current.low,
            high52: data.high52 || current.high52,
            low52: data.low52 || current.low52,
            volume: data.volume || current.volume,
            marketCap: data.marketCap || current.marketCap,
            liveSource: data.source,
          };
        });
        setLiveUpdatedAt(new Date(data.updatedAt || Date.now()));
        setLivePriceStatus("connected");
      } catch {
        if (!cancelled) {
          liveFailureCount.current += 1;
          if (liveFailureCount.current >= 3) setLivePriceStatus("unavailable");
        }
      }
    };

    updateLivePrice();
    const timer = window.setInterval(updateLivePrice, LIVE_PRICE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTicker, stock]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checklists));
  }, [checklists]);

  const lastUpdatedText = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Not yet";
  const liveUpdatedText = liveUpdatedAt
    ? liveUpdatedAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const scoutPlan = stock ? getScoutPlan(stock, rangePercent) : null;
  const scoreBreakdown = stock ? getScoreBreakdown(stock, rangePercent) : [];
  const risk = stock ? getRiskLevel(stock, rangePercent) : null;
  const isSaved = stock ? watchlist.includes(stock.ticker) : false;
  const checkedItems = stock ? checklists[stock.ticker] || [] : [];

  const saveCurrentStock = () => {
    if (!stock) return;
    setWatchlist((items) => {
      if (items.includes(stock.ticker)) return items;
      return [stock.ticker, ...items].slice(0, 12);
    });
  };

  const removeFromWatchlist = (ticker) => {
    setWatchlist((items) => items.filter((item) => item !== ticker));
  };

  const toggleChecklistItem = (ticker, item) => {
    setChecklists((current) => {
      const currentItems = current[ticker] || [];
      const nextItems = currentItems.includes(item)
        ? currentItems.filter((savedItem) => savedItem !== item)
        : [...currentItems, item];

      return {
        ...current,
        [ticker]: nextItems,
      };
    });
  };

  const goHome = () => {
    setQuery("");
    setActiveTicker("");
    setStock(null);
    setError("");
    setLoading(false);
    setRefreshing(false);
    setLivePriceStatus("idle");
    setLiveUpdatedAt(null);
    setCompareStocks(null);
    setCompareError("");
    setLastUpdated(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setShowApp(false);
  };

  if (!showApp) {
    return <LandingPage onLaunch={() => setShowApp(true)} />;
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button type="button" className="home-button" onClick={goHome}>
          Home
        </button>
        <div className="brand-mark" aria-hidden="true">
          SS
        </div>
        <div>
          <h1>StockScout</h1>
          <p>NSE and BSE research companion</p>
        </div>
        <span className={`status-pill ${refreshing ? "refreshing" : ""}`}>
          {refreshing ? "Updating" : "Live"}
        </span>
      </header>

      <section className="hero-panel">
        <div>
          <span className="eyebrow">Indian equity snapshot</span>
          <h2>Find the stocks worth a second look.</h2>
        </div>
        <p>
          A fast MVP for price, range, momentum, volume, and a simple research
          score. Built for mobile-first scouting.
        </p>
      </section>

      <section className="search-panel" aria-label="Stock search">
        <div className="search-box">
          <label htmlFor="ticker-input">Ticker</label>
          <input
            id="ticker-input"
            value={query}
            onChange={(event) => setQuery(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") search(query);
            }}
            inputMode="text"
            autoCapitalize="characters"
            placeholder="WIPRO, INFY, TCS..."
          />
          <button type="button" onClick={() => search(query)} disabled={loading}>
            {loading ? "Loading" : "Scout"}
          </button>
        </div>

        <div className="suggestion-row" aria-label="Popular tickers">
          {SUGGESTIONS.map((ticker) => (
            <button type="button" key={ticker} onClick={() => search(ticker)}>
              {ticker}
            </button>
          ))}
        </div>
      </section>

      <section className="compare-panel" aria-label="Compare stocks">
        <div className="section-title">
          <h3>Compare two stocks</h3>
          <span>New</span>
        </div>
        <p>
          Use this when you are confused between two ideas and want to know
          which one deserves research first.
        </p>
        <div className="compare-form">
          <input
            value={compareA}
            onChange={(event) => setCompareA(event.target.value.toUpperCase())}
            placeholder="RELIANCE"
            autoCapitalize="characters"
          />
          <input
            value={compareB}
            onChange={(event) => setCompareB(event.target.value.toUpperCase())}
            placeholder="TCS"
            autoCapitalize="characters"
          />
          <button type="button" onClick={compare} disabled={compareLoading}>
            {compareLoading ? "Comparing" : "Compare"}
          </button>
        </div>
        {compareError ? <div className="compare-error">{compareError}</div> : null}
      </section>

      {compareStocks ? <CompareResult stocks={compareStocks} /> : null}

      {loading ? (
        <section className="state-panel" aria-live="polite">
          Fetching live data...
        </section>
      ) : null}

      {error && !loading ? (
        <section className="state-panel error" aria-live="assertive">
          {error}
        </section>
      ) : null}

      {stock && !loading ? (
        <section className="result-stack" aria-label={`${stock.name} research result`}>
          <article className={`stock-card ${stock.tone}`}>
            <div className="stock-main">
              <div>
                <span className="exchange">{stock.exchange}</span>
                <h2>{stock.name}</h2>
                <p>{stock.ticker}</p>
              </div>
              <ScoreRing score={stock.score} tone={stock.tone} />
            </div>

            <div className="price-row">
              <strong>{formatMoney(stock.price)}</strong>
              <span className={stock.change >= 0 ? "gain" : "loss"}>
                {stock.change >= 0 ? "+" : ""}
                {stock.change.toFixed(2)}%
              </span>
            </div>

            <div className="verdict-pill">{stock.verdict}</div>
            <div className={`live-price-pill ${livePriceStatus}`}>
              {livePriceStatus === "connected"
                ? `Groww live price - ${liveUpdatedText}`
                : livePriceStatus === "missing-token"
                  ? "Add Groww token for live ticks"
                  : livePriceStatus === "login-needed"
                    ? "Groww login needed"
                  : livePriceStatus === "unavailable"
                    ? "Groww live price unavailable"
                    : "Checking Groww live price"}
            </div>
            <div className="refresh-row">
              <div className="refresh-note">
                Auto-refreshes every 15 seconds. Last updated {lastUpdatedText}.
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => search(stock.ticker, { silent: true })}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
            <button
              type="button"
              className={`save-button ${isSaved ? "saved" : ""}`}
              onClick={saveCurrentStock}
              disabled={isSaved}
            >
              {isSaved ? "Saved to watchlist" : "Save to watchlist"}
            </button>
          </article>

          <section className="metrics-grid" aria-label="Key stock metrics">
            <MetricCard label="Day high" value={formatMoney(stock.high)} />
            <MetricCard label="Day low" value={formatMoney(stock.low)} />
            <MetricCard label="Open" value={formatMoney(stock.open)} />
            <MetricCard label="52w high" value={formatMoney(stock.high52)} />
            <MetricCard label="52w low" value={formatMoney(stock.low52)} />
            <MetricCard label="Market cap" value={formatMarketCap(stock.marketCap)} />
          </section>

          <article className="range-card">
            <div className="section-title">
              <h3>52-week range</h3>
              <span>{Math.round(rangePercent)}%</span>
            </div>
            <div className="range-track">
              <span style={{ width: `${rangePercent}%` }} />
            </div>
            <div className="range-labels">
              <span>{formatMoney(stock.low52)}</span>
              <span>{formatMoney(stock.price)}</span>
              <span>{formatMoney(stock.high52)}</span>
            </div>
          </article>

          <section className="metrics-grid two-column" aria-label="Trading details">
            <MetricCard
              label="Volume"
              value={toNumber(stock.volume).toLocaleString("en-IN")}
              sub="Today's trades"
            />
            <MetricCard label="Currency" value={stock.currency || "INR"} sub="Market quote" />
          </section>

          <RiskCard risk={risk} />

          <FundamentalsPanel fundamentals={stock.fundamentals || {}} />

          <ScoreBreakdown items={scoreBreakdown} />

          <article className="take-card">
            <div className="section-title">
              <h3>Quick take</h3>
              <span>Not advice</span>
            </div>
            <p>{getQuickTake(stock)}</p>
          </article>

          <ScoutPlan plan={scoutPlan} />

          <ResearchChecklist
            ticker={stock.ticker}
            checkedItems={checkedItems}
            onToggle={toggleChecklistItem}
          />
        </section>
      ) : null}

      {!stock && !loading && !error ? <EmptyState onPick={search} /> : null}

      <Watchlist items={watchlist} onOpen={search} onRemove={removeFromWatchlist} />

      <footer>
        Live market data via Yahoo Finance. Research only, not financial advice.
        <span>Created by Thashhan, Ritvan, and Prajwal.</span>
      </footer>
    </main>
  );
}
