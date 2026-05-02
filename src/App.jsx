import { useState } from "react";

const suggestions = ["RELIANCE", "INFY", "TCS", "WIPRO", "HDFCBANK", "TATASTEEL", "ZOMATO", "IRCTC"];

function ScoreRing({ score, color }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 72, height: 72 }}>
      <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="#1a1a2e" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color
      }}>{score}</div>
    </div>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#0d0d1a", border: "1px solid #1e1e3a",
      borderRadius: 12, padding: "12px 14px", flex: 1, minWidth: 0
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: "#e8e8f0" }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function getScore(data) {
  let score = 50;
  if (data.change > 0) score += 10;
  if (data.change > 2) score += 5;
  if (data.high52 > 0 && data.price > 0) {
    const pct = data.price / data.high52;
    if (pct > 0.9) score += 15;
    else if (pct > 0.7) score += 8;
  }
  if (data.volume > 1000000) score += 10;
  if (data.marketCap && data.marketCap > 1e12) score += 10;
  return Math.min(score, 99);
}

function getVerdict(score) {
  if (score >= 85) return "Hidden Gem 💎";
  if (score >= 75) return "High Conviction Pick";
  if (score >= 65) return "Strong Compounder";
  if (score >= 55) return "Watchlist Worthy";
  return "High Risk, Tread Carefully";
}

function getColor(score) {
  if (score >= 75) return "#00C896";
  if (score >= 55) return "#FFD700";
  return "#FF4D4D";
}

function formatMarketCap(cap) {
  if (!cap) return "N/A";
  if (cap >= 1e12) return `₹${(cap / 1e12).toFixed(2)}L Cr`;
  if (cap >= 1e9) return `₹${(cap / 1e9).toFixed(1)}K Cr`;
  return `₹${(cap / 1e7).toFixed(1)} Cr`;
}

export default function StockScout() {
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(false);

  const search = async (ticker) => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setStock(null);
    setQuery(ticker);

    try {
      const res = await fetch(`https://stockscout-fv6f.onrender.com/stock/${ticker}`);
      const data = await res.json();

      if (data.error) {
        setError(`"${ticker}" not found. Check the NSE ticker and try again.`);
        setLoading(false);
        return;
      }

      const score = getScore(data);
      setStock({
        ...data,
        score,
        verdict: getVerdict(score),
        color: getColor(score),
      });
    } catch (err) {
      setError("Could not connect to server. Make sure server.cjs is running.");
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07070f; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1e1e3a; border-radius: 4px; }
        input::placeholder { color: #333; }
        input:focus { outline: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>
      <div style={{
        minHeight: "100vh", background: "#07070f",
        fontFamily: "'Syne', sans-serif",
        maxWidth: 480, margin: "0 auto", padding: "0 0 40px"
      }}>
        {/* Header */}
        <div style={{ padding: "28px 20px 20px", borderBottom: "1px solid #0f0f1e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #00C896, #0066FF)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
            }}>📈</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#e8e8f0", letterSpacing: -0.5 }}>StockScout</div>
              <div style={{ fontSize: 10, color: "#333", fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>NSE · BSE · LIVE DATA</div>
            </div>
            <div style={{
              marginLeft: "auto", background: "#00C89618", border: "1px solid #00C89633",
              borderRadius: 20, padding: "3px 10px",
              fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#00C896"
            }}>● LIVE</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "center",
            background: "#0d0d1a",
            border: `1px solid ${focused ? "#00C896" : "#1e1e3a"}`,
            borderRadius: 14, padding: "12px 16px", transition: "border-color 0.2s"
          }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === "Enter" && search(query)}
              placeholder="Any NSE ticker — WIPRO, BAJFINANCE..."
              style={{
                flex: 1, background: "transparent", border: "none",
                fontFamily: "'DM Mono', monospace", fontSize: 13,
                color: "#e8e8f0", letterSpacing: 1
              }}
            />
            <button onClick={() => search(query)} style={{
              background: "linear-gradient(135deg, #00C896, #0066FF)",
              border: "none", borderRadius: 8, padding: "6px 14px",
              color: "#fff", fontFamily: "'Syne', sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer"
            }}>GO</button>
          </div>

          {/* Suggestions */}
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => search(s)} style={{
                background: "#0d0d1a", border: "1px solid #1e1e3a",
                borderRadius: 20, padding: "4px 12px",
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: "#555", cursor: "pointer", letterSpacing: 0.5
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#333", animation: "pulse 1s infinite", letterSpacing: 2 }}>FETCHING LIVE DATA...</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#FF4D4D", lineHeight: 1.8 }}>{error}</div>
          </div>
        )}

        {/* Stock Card */}
        {stock && !loading && (
          <div style={{ padding: "20px 20px 0", animation: "fadeUp 0.4s ease" }}>

            {/* Top Card */}
            <div style={{
              background: "#0d0d1a", border: "1px solid #1e1e3a",
              borderRadius: 18, padding: 18, marginBottom: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#444", letterSpacing: 1, marginBottom: 3 }}>{stock.exchange}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#e8e8f0", letterSpacing: -0.5, lineHeight: 1.1 }}>{stock.name}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#555", marginTop: 2 }}>{stock.ticker}</div>
                </div>
                <ScoreRing score={stock.score} color={stock.color} />
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#e8e8f0" }}>
                  ₹{stock.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: stock.change >= 0 ? "#00C896" : "#FF4D4D"
                }}>{stock.change >= 0 ? "▲" : "▼"} {Math.abs(stock.change).toFixed(2)}%</div>
              </div>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: `${stock.color}18`, border: `1px solid ${stock.color}44`,
                borderRadius: 20, padding: "4px 12px", marginTop: 10
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: stock.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: stock.color }}>{stock.verdict}</span>
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <MetricCard label="Day High" value={`₹${stock.high.toLocaleString("en-IN")}`} />
              <MetricCard label="Day Low" value={`₹${stock.low.toLocaleString("en-IN")}`} />
              <MetricCard label="Open" value={`₹${stock.open.toLocaleString("en-IN")}`} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <MetricCard label="52W High" value={`₹${stock.high52.toLocaleString("en-IN")}`} />
              <MetricCard label="52W Low" value={`₹${stock.low52.toLocaleString("en-IN")}`} />
              <MetricCard label="Mkt Cap" value={formatMarketCap(stock.marketCap)} />
            </div>

            {/* 52W Range Bar */}
            <div style={{
              background: "#0d0d1a", border: "1px solid #1e1e3a",
              borderRadius: 18, padding: 16, marginBottom: 12
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8f0", marginBottom: 12 }}>📊 52-Week Range</div>
              <div style={{ position: "relative", height: 6, background: "#1e1e3a", borderRadius: 3 }}>
                {stock.high52 > stock.low52 && (
                  <div style={{
                    position: "absolute", left: 0, height: "100%", borderRadius: 3,
                    width: `${Math.min(((stock.price - stock.low52) / (stock.high52 - stock.low52)) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #0066FF, #00C896)"
                  }} />
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#FF4D4D" }}>₹{stock.low52.toLocaleString("en-IN")}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555" }}>Current: ₹{stock.price.toLocaleString("en-IN")}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#00C896" }}>₹{stock.high52.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Volume */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <MetricCard label="Volume" value={stock.volume.toLocaleString("en-IN")} sub="Today's trades" />
              <MetricCard label="Currency" value={stock.currency} sub="Trading currency" />
            </div>

            {/* AI Tip */}
            <div style={{
              background: "linear-gradient(135deg, #00120e, #00080f)",
              border: "1px solid #00C89622",
              borderRadius: 18, padding: 16
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#00C896", marginBottom: 6 }}>⚡ Quick Take</div>
              <div style={{ fontSize: 13, color: "#667", lineHeight: 1.6 }}>
                {stock.score >= 80
                  ? `${stock.name} is showing strong momentum. Trading near its 52-week high with solid volume. Worth deep research for long-term holding.`
                  : stock.score >= 60
                  ? `${stock.name} has decent signals. Monitor closely and look for a good entry point before investing.`
                  : `${stock.name} has mixed signals right now. Only for high-risk appetite investors with a long time horizon.`}
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 16, fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#222", letterSpacing: 1 }}>
              LIVE DATA VIA YAHOO FINANCE · NOT FINANCIAL ADVICE
              <div style={{ textAlign: "center", marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#333", letterSpacing: 1 }}>
  CREATED BY THASHHAN · RITVAN · PRAJWAL
</div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!stock && !loading && !error && (
          <div style={{ padding: "50px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#e8e8f0", marginBottom: 8 }}>Find Your Next Win</div>
            <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6, fontFamily: "'DM Mono', monospace" }}>
              Search ANY NSE stock above<br />Powered by Yahoo Finance
            </div>
          </div>
        )}
      </div>
    </>
  );
}
