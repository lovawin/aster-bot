"use client";
import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Play, Square, AlertTriangle, RefreshCw, Settings, X, TrendingUp, TrendingDown, Save, Eye, EyeOff, Zap, Bot, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const API = "http://localhost:8000";
const call = async (path: string, opts?: RequestInit) => {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0f1a] border border-gray-700/60 rounded-lg px-3 py-2 text-xs shadow-2xl">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || "#e5e7eb" }}>
          {p.name}: <b>{typeof p.value === "number" ? p.value.toFixed(p.value > 100 ? 2 : 6) : "—"}</b>
        </p>
      ))}
    </div>
  );
};

// ── RSI calc ─────────────────────────────────────────────────────────────────
function rsi(prices: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = Array(n).fill(null);
  for (let i = n; i < prices.length; i++) {
    let g = 0, l = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = prices[j] - prices[j - 1];
      d > 0 ? (g += d) : (l -= d);
    }
    out.push(100 - 100 / (1 + g / (l || 1e-9)));
  }
  return out;
}

function ema(prices: number[], n: number): number[] {
  const k = 2 / (n + 1), out = [prices[0]];
  for (let i = 1; i < prices.length; i++) out.push(prices[i] * k + out[i - 1] * (1 - k));
  return out;
}

function macd(prices: number[]) {
  const e12 = ema(prices, 12), e26 = ema(prices, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = [...Array(26).fill(null), ...ema(line.slice(26), 9)];
  const hist = line.map((v, i) => sig[i] != null ? v - (sig[i] as number) : null);
  return { line, sig, hist };
}

// ── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ config, onSave, onClose }: { config: any; onSave: (c: any) => void; onClose: () => void }) {
  const [f, setF] = useState({ ...config });
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSec, setShowSec] = useState(false);
  const [tab, setTab] = useState<"bot" | "api" | "risk">("bot");
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0c1220] border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Settings size={14} className="text-blue-400" /> Settings
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#080d16]">
          {(["bot", "api", "risk"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[11px] font-semibold uppercase tracking-wider transition-all
                ${tab === t ? "text-blue-400 border-b-2 border-blue-500 bg-blue-500/5" : "text-gray-500 hover:text-gray-300"}`}>
              {t === "bot" ? "Bot Config" : t === "api" ? "API Keys" : "Risk Mgmt"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[55vh]">
          {tab === "bot" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-gray-400 block mb-1.5">Leverage <span className="text-gray-600">(1–50x)</span></span>
                  <input type="number" min={1} max={50} value={f.leverage} onChange={e => set("leverage", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-400 block mb-1.5">Position Size <span className="text-gray-600">(USDT)</span></span>
                  <input type="number" min={5} max={100000} value={f.position_size_usdt} onChange={e => set("position_size_usdt", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">Candle Interval</span>
                <select value={f.kline_interval} onChange={e => set("kline_interval", e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500">
                  {["1m","3m","5m","15m","30m","1h","2h","4h","1d"].map(v => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">Poll Interval <span className="text-gray-600">(seconds)</span></span>
                <input type="number" min={10} max={3600} value={f.poll_interval ?? 60} onChange={e => set("poll_interval", +e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
              </label>
            </>
          )}

          {tab === "api" && (
            <>
              <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-3 text-[11px] text-yellow-400">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>Keys stored locally in <code className="font-mono bg-yellow-900/40 px-1 rounded">~/aster-bot/.env</code>. Never share them.</span>
              </div>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">API Key (Public)</span>
                <input type="text" placeholder="Paste public key..." value={apiKey} onChange={e => setApiKey(e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-blue-500 transition-colors" />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">API Secret (Private)</span>
                <div className="relative">
                  <input type={showSec ? "text" : "password"} placeholder="Paste secret..." value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-white font-mono outline-none focus:border-blue-500 transition-colors" />
                  <button onClick={() => setShowSec(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showSec ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">Auth Type</span>
                <select className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500">
                  <option value="v1">HMAC v1 — API Key / Secret</option>
                  <option value="v3">EIP-712 v3 — Wallet Signing</option>
                </select>
              </label>
            </>
          )}

          {tab === "risk" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-red-400 block mb-1.5">Stop Loss (%)</span>
                  <input type="number" min={0.1} max={50} step={0.1} value={f.stop_loss_pct} onChange={e => set("stop_loss_pct", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-red-900/40 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500 transition-colors" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-green-400 block mb-1.5">Take Profit (%)</span>
                  <input type="number" min={0.1} max={500} step={0.1} value={f.take_profit_pct} onChange={e => set("take_profit_pct", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-green-900/40 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-green-400 block mb-1.5">RSI Oversold → Long</span>
                  <input type="number" min={10} max={45} value={f.rsi_oversold ?? 35} onChange={e => set("rsi_oversold", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-red-400 block mb-1.5">RSI Overbought → Short</span>
                  <input type="number" min={55} max={90} value={f.rsi_overbought ?? 65} onChange={e => set("rsi_overbought", +e.target.value)}
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] text-gray-400 block mb-1.5">Margin Mode</span>
                <select value={f.margin_mode ?? "ISOLATED"} onChange={e => set("margin_mode", e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500">
                  <option value="ISOLATED">Isolated Margin</option>
                  <option value="CROSSED">Cross Margin</option>
                </select>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => { onSave(f); onClose(); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors">
            <Save size={13} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<any>(null);
  const [priceData, setPriceData] = useState<any[]>([]);
  const [rsiData, setRsiData] = useState<any[]>([]);
  const [macdData, setMacdData] = useState<any[]>([]);
  const [sym, setSym] = useState("ETHUSDT");
  const [direction, setDirection] = useState("BOTH");
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [qty, setQty] = useState("0.01");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [assetBalances, setAssetBalances] = useState<any[]>([]);

  // Update backend config when symbol/direction changes
  const updateSymbolDirection = async (newSym: string) => {
    setSym(newSym);
    let newDirection = direction;
    if (newSym === "BOTH") newDirection = "BOTH";
    else if (newSym === "ETHUSDT") newDirection = "LONG";
    else if (newSym === "BTCUSDT") newDirection = "SHORT";
    setDirection(newDirection);
    await fetch("http://localhost:8000/bot/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: newDirection }),
    });
    loadState();
  };

  // shared button styles for consistency
  const btnBase = "py-2.5 rounded-xl text-sm font-bold transition-all";
  const btnInactive = "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white";
  const btnActive = "bg-blue-600 text-white shadow-lg shadow-blue-500/20";

  const loadState = useCallback(async () => {
    try { setState(await call("/status")); } catch {}
  }, []);

  const loadKlines = useCallback(async (s: string) => {
    try {
      const raw = await call(`/klines/${s}?interval=5m&limit=100`);
      const closes = raw.map((k: any[]) => parseFloat(k[4]));
      const times = raw.map((k: any[]) =>
        new Date(k[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      setPriceData(raw.map((k: any[], i: number) => ({
        t: times[i], price: parseFloat(k[4]), vol: parseFloat(k[5])
      })));
      const rv = rsi(closes);
      setRsiData(rv.map((v, i) => ({ t: times[i], rsi: v })));
      const { line, sig, hist } = macd(closes);
      setMacdData(line.map((v, i) => ({ t: times[i], macd: v, sig: sig[i], hist: hist[i] })));
    } catch {}
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const [e, b] = await Promise.all([call("/ticker/ETHUSDT"), call("/ticker/BTCUSDT")]);
      setPrices({ ETHUSDT: parseFloat(e.lastPrice), BTCUSDT: parseFloat(b.lastPrice) });
    } catch {}
  }, []);

  const loadBalances = useCallback(async () => {
    try {
      const bal = await call("/balance");
      // keep raw list; entries may have availableBalance, free or balance
      setAssetBalances(bal || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadState(); loadKlines(sym); loadPrices(); loadBalances();
    const i1 = setInterval(loadState, 10000);
    const i2 = setInterval(() => loadKlines(sym), 30000);
    const i3 = setInterval(loadPrices, 15000);
    const i4 = setInterval(loadBalances, 30000);
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3); };
  }, [loadState, loadKlines, loadPrices, sym]);

  const startBot = async () => { setLoading(true); await call("/bot/start", { method: "POST" }); await loadState(); setLoading(false); };
  const stopBot  = async () => { setLoading(true); await call("/bot/stop",  { method: "POST" }); await loadState(); setLoading(false); };
  const closePos = async (s: string) => {
    if (!confirm(`Close all ${s} positions?`)) return;
    await call(`/bot/close/${s}`, { method: "POST" }); loadState();
  };
  const saveConfig = async (cfg: any) => {
    await call("/bot/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    loadState();
  };
  const manualTrade = async (side: "BUY" | "SELL") => {
    try {
      await call("/trade/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, side, quantity: parseFloat(qty) }),
      });
      const unit = sym === 'ETHUSDT' ? 'ETH' : sym === 'BTCUSDT' ? 'BTC' : 'asset';
      alert(`${side} order placed for ${qty} ${unit} (${sym})`);
      loadState();
    } catch (e: any) { alert("Error: " + e.message); }
  };

  const isRunning = state?.running ?? false;
  const config = state?.config ?? {};
  const signal = state?.signals?.[sym];
  const balance = state?.balance;
  const pnl = Object.values(state?.positions ?? {}).reduce(
    (a: number, p: any) => a + (p ? parseFloat(p.unRealizedProfit ?? 0) : 0), 0
  ) as number;
  const curPrice = priceData[priceData.length - 1]?.price;
  const latestRSI = rsiData[rsiData.length - 1]?.rsi;
  const ax = { fill: "#374151", fontSize: 10, fontFamily: "monospace" };
  const unitLabel = sym === 'ETHUSDT' ? 'ETH' : sym === 'BTCUSDT' ? 'BTC' : 'ETH/BTC';

  return (
    <div className="min-h-screen bg-[#060a10] text-white font-sans">
      {showSettings && <SettingsModal config={config} onSave={saveConfig} onClose={() => setShowSettings(false)} />}

      {/* ── Header ── */}
      <header className="border-b border-gray-800/80 bg-[#0a0f1a] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-blue-400" />
            <span className="text-sm font-bold tracking-wide text-white">ASTER PERPS BOT</span>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border
            ${isRunning ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-gray-500 border-gray-700 bg-gray-800/50"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
            {state?.status ?? "loading"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadState(); loadKlines(sym); loadPrices(); }}
            className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <Settings size={13} />
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Balance", val: balance ? `$${parseFloat(balance.availableBalance ?? 0).toFixed(2)}` : "—", sub: "USDT", color: "text-white" },
            { label: "Unreal. PnL", val: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`, sub: "USDT", color: pnl >= 0 ? "text-green-400" : "text-red-400" },
            { label: "ETH", val: prices.ETHUSDT ? `$${prices.ETHUSDT.toLocaleString()}` : "—", sub: "ETHUSDT", color: "text-blue-300" },
            { label: "BTC", val: prices.BTCUSDT ? `$${prices.BTCUSDT.toLocaleString()}` : "—", sub: "BTCUSDT", color: "text-orange-300" },
            { label: "RSI", val: latestRSI ? latestRSI.toFixed(1) : "—", sub: latestRSI ? (latestRSI < 35 ? "Oversold" : latestRSI > 65 ? "Overbought" : "Neutral") : "", color: latestRSI ? (latestRSI < 35 ? "text-green-400" : latestRSI > 65 ? "text-red-400" : "text-white") : "text-white" },
            { label: "Leverage", val: config.leverage ? `${config.leverage}x` : "—", sub: config.kline_interval ?? "", color: "text-purple-300" },
          ].map(({ label, val, sub, color }) => (
            <div key={label} className="bg-[#0d1420] border border-gray-800/60 rounded-xl px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-lg font-bold font-mono ${color}`}>{val}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Price Chart */}
          <div className="lg:col-span-2 bg-[#0d1420] border border-gray-800/60 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Price · 5m</span>
              <span className="text-sm font-mono font-bold text-white">{curPrice ? `$${curPrice.toLocaleString()}` : "—"}</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={priceData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
                <XAxis dataKey="t" tick={ax} tickLine={false} axisLine={false} interval={19} />
                <YAxis domain={["auto","auto"]} tick={ax} tickLine={false} axisLine={false} width={62} tickFormatter={v => `$${v.toFixed(0)}`} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="price" name="Price" stroke="#3b82f6" fill="url(#pg)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Trading Panel */}
          <div className="bg-[#0d1420] border border-gray-800/60 rounded-xl p-4 flex flex-col gap-4">

            {/* Symbol selector */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Symbol</p>
              <div className="flex gap-2">
                {["ETHUSDT", "BTCUSDT", "BOTH"].map(s => (
                  <button key={s}
                    onClick={() => updateSymbolDirection(s)}
                    className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all border-2
                      ${sym === s ? "bg-gradient-to-br from-blue-700 via-blue-900 to-gray-900 text-white border-blue-500 shadow-lg shadow-blue-500/20" : "bg-gray-800 text-gray-400 border-transparent hover:bg-blue-700 hover:text-white hover:border-blue-400"}`}
                  >
                    {s === "ETHUSDT" ? "ETH" : s === "BTCUSDT" ? "BTC" : "Both"}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Direction</p>
              <div className="flex gap-2">
                {[
                  { val: "LONG", label: "▲ Long", active: "bg-green-600 text-white shadow-green-500/20", inactive: "bg-gray-800 text-gray-400 hover:text-green-400" },
                  { val: "SHORT", label: "▼ Short", active: "bg-red-600 text-white shadow-red-500/20", inactive: "bg-gray-800 text-gray-400 hover:text-red-400" },
                  { val: "BOTH", label: "⇅ Both", active: "bg-purple-600 text-white shadow-purple-500/20", inactive: "bg-gray-800 text-gray-400 hover:text-purple-400" },
                ].map(({ val, label, active, inactive }) => (
                  <button key={val} onClick={() => setDirection(val)}
                    className={`${btnBase} flex-1 text-xs
                      ${direction === val ? `${active} shadow-lg` : inactive}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode toggle */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Trading Mode</p>
              <div className="flex gap-2">
                {(["AUTO", "MANUAL"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`${btnBase} flex-1 flex items-center justify-center gap-2
                      ${mode === m ? "bg-blue-600/90 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                    {m === "AUTO" ? <Bot size={14} /> : <Zap size={14} />} {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto signal */}
            {mode === "AUTO" && (
              <div className={`rounded-xl p-3 border ${
                signal?.action === "LONG" ? "bg-green-500/10 border-green-500/30" :
                signal?.action === "SHORT" ? "bg-red-500/10 border-red-500/30" :
                "bg-gray-800/40 border-gray-700/40"}`}>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Signal</p>
                <p className={`text-xl font-black ${signal?.action === "LONG" ? "text-green-400" : signal?.action ===
                "SHORT" ? "text-red-400" : "text-gray-500"}`}>
                  {signal?.action === "LONG" ? "▲ LONG" : signal?.action === "SHORT" ? "▼ SHORT" : "— HOLD"}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">{signal?.reason ?? "Scanning..."}</p>
              </div>
            )}

            {/* Manual trade */}
            {mode === "MANUAL" && (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Quantity</p>
                  <div className="flex items-center gap-3">
                    <input type="number" step="0.001" min="0.001" value={qty} onChange={e => setQty(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-blue-500 transition-colors" />
                    <div className="text-xs text-gray-400 text-right">
                      <div>Unit: <span className="text-white font-bold">{sym === 'ETHUSDT' ? 'ETH' : sym === 'BTCUSDT' ? 'BTC' : 'ETH / BTC'}</span></div>
                      <div>
                        Balance: <span className="text-white font-mono">{
                          (() => {
                            if (!assetBalances?.length) return '—';
                            if (sym === 'ETHUSDT') {
                              const a = assetBalances.find((x: any) => x.asset === 'ETH');
                              return (a?.availableBalance || a?.free || a?.balance || '—') + ' ETH';
                            }
                            if (sym === 'BTCUSDT') {
                              const a = assetBalances.find((x: any) => x.asset === 'BTC');
                              return (a?.availableBalance || a?.free || a?.balance || '—') + ' BTC';
                            }
                            // BOTH — show USDT available
                            const us = assetBalances.find((x: any) => x.asset === 'USDT');
                            return (us?.availableBalance || us?.free || us?.balance || '—') + ' USDT';
                          })()
                        }</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => manualTrade("BUY")}
                  className={`${btnBase} w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white rounded-full shadow-lg shadow-green-500/20`}>
                  <ArrowUpCircle size={16} /> BUY / LONG
                </button>
                <button onClick={() => manualTrade("SELL")}
                  className={`${btnBase} w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-lg shadow-red-500/20`}>
                  <ArrowDownCircle size={16} /> SELL / SHORT
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RSI + MACD */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0d1420] border border-gray-800/60 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">RSI (14)</span>
              <span className={`text-sm font-mono font-bold ${latestRSI < 35 ? "text-green-400" : latestRSI > 65 ? "text-red-400" : "text-white"}`}>
                {latestRSI?.toFixed(2) ?? "—"}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={rsiData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
                <XAxis dataKey="t" tick={ax} tickLine={false} axisLine={false} interval={24} />
                <YAxis domain={[0,100]} tick={ax} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={<Tip />} />
                <ReferenceLine y={35} stroke="#4ade80" strokeDasharray="4 3" strokeWidth={1} />
                <ReferenceLine y={65} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />
                <ReferenceLine y={50} stroke="#1f2937" strokeWidth={1} />
                <Line type="monotone" dataKey="rsi" name="RSI" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#0d1420] border border-gray-800/60 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">MACD (12/26/9)</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={macdData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
                <XAxis dataKey="t" tick={ax} tickLine={false} axisLine={false} interval={24} />
                <YAxis tick={ax} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<Tip />} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                <Bar dataKey="hist" name="Hist" fill="#4ade80" radius={[1,1,0,0]} />
                <Line type="monotone" dataKey="macd" name="MACD" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="sig" name="Signal" stroke="#fb923c" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bot Controls */}
        <div className="bg-[#0d1420] border border-gray-800/60 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            {!isRunning ? (
              <button onClick={startBot} disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-green-500/20">
                <Play size={14} /> Start Bot
              </button>
            ) : (
              <button onClick={stopBot} disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-all">
                <Square size={14} /> Stop Bot
              </button>
            )}
            <button onClick={() => closePos("ETHUSDT")}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-900/40 hover:bg-red-800/60 border border-red-700/40 text-red-400 text-sm font-bold rounded-lg transition-all">
              <AlertTriangle size={13} /> Close ETH
            </button>
            <button onClick={() => closePos("BTCUSDT")}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-900/40 hover:bg-red-800/60 border border-red-700/40 text-red-400 text-sm font-bold rounded-lg transition-all">
              <AlertTriangle size={13} /> Close BTC
            </button>
            <button onClick={() => setShowSettings(true)}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded-lg transition-all">
              <Settings size={13} /> Configure
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            {[
              ["Leverage", config.leverage ? config.leverage + "x" : "—"],
              ["Stop Loss", config.stop_loss_pct ? config.stop_loss_pct + "%" : "—"],
              ["Take Profit", config.take_profit_pct ? config.take_profit_pct + "%" : "—"],
              ["Size", config.position_size_usdt ? "$" + config.position_size_usdt : "—"],
              ["Interval", config.kline_interval ?? "—"],
            ].map(([l, v]) => (
              <div key={l} className="bg-gray-800/40 rounded-lg px-3 py-2 text-xs">
                <span className="text-gray-500 block">{l}</span>
                <span className="text-white font-mono font-bold">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trade History */}
        <div className="bg-[#0d1420] border border-gray-800/60 rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Trade History</span>
            <span className="text-xs text-gray-600">{state?.trades?.length ?? 0} trades</span>
          </div>
          {!state?.trades?.length ? (
            <div className="text-center py-10 text-gray-600 text-sm">No trades yet — start the bot to begin</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-gray-800">
                    {["Time","Symbol","Action","Side","Qty","Entry","SL","TP"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(state?.trades ?? []).slice(0,20).map((t: any, i: number) => (
                    <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                      <td className="py-2 pr-4 text-gray-500 font-mono">{new Date(t.time).toLocaleTimeString()}</td>
                      <td className="py-2 pr-4 font-bold text-gray-200">{t.symbol}</td>
                      <td className={`py-2 pr-4 font-bold ${t.action === "LONG" ? "text-green-400" : t.action === "SHORT" ? "text-red-400" : "text-gray-400"}`}>{t.action}</td>
                      <td className="py-2 pr-4 text-gray-300">{t.side}</td>
                      <td className="py-2 pr-4 font-mono text-gray-300">{t.qty}</td>
                      <td className="py-2 pr-4 font-mono text-white">{t.price ? "$" + t.price : "—"}</td>
                      <td className="py-2 pr-4 font-mono text-red-400">{t.stop_loss ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-green-400">{t.take_profit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {state?.errors?.length > 0 && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4">
            <span className="text-[10px] text-red-400 uppercase tracking-widest block mb-2">Errors</span>
            {state.errors.slice(0,5).map((e: any, i: number) => (
              <p key={i} className="text-red-300/70 text-xs font-mono mb-1">[{new Date(e.time).toLocaleTimeString()}] {e.msg}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
