"""
Trading Bot Engine
- Polls market data on interval
- Executes RSI+MACD strategy for ETH/BTC perps
- Manages stop loss / take profit orders
- Thread-safe state for the FastAPI server to read
"""
import time
import logging
import threading
import os
from datetime import datetime
from dotenv import load_dotenv

import aster_client as ac
import strategy as strat

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(__file__), '..', 'logs', 'bot.log')),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("bot")

# ── Config ────────────────────────────────────────────────────────────────────
SYMBOLS = os.getenv("SYMBOL_1", "ETHUSDT").split(",")
DEFAULT_LEVERAGE = int(os.getenv("DEFAULT_LEVERAGE", 10))
STOP_LOSS_PCT = float(os.getenv("STOP_LOSS_PCT", 2.0))
TAKE_PROFIT_PCT = float(os.getenv("TAKE_PROFIT_PCT", 4.0))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", 60))   # seconds
KLINE_INTERVAL = os.getenv("KLINE_INTERVAL", "5m")
POSITION_SIZE_USDT = float(os.getenv("POSITION_SIZE_USDT", 20.0))  # per trade

# ── Shared State (thread-safe) ────────────────────────────────────────────────
_lock = threading.Lock()
_state = {
    "running": False,
    "status": "stopped",
    "symbols": SYMBOLS,
    "positions": {},   # symbol -> position info
    "signals": {},     # symbol -> latest signal
    "trades": [],      # trade history
    "errors": [],      # recent errors
    "config": {
        "leverage": DEFAULT_LEVERAGE,
        "stop_loss_pct": STOP_LOSS_PCT,
        "take_profit_pct": TAKE_PROFIT_PCT,
        "kline_interval": KLINE_INTERVAL,
        "position_size_usdt": POSITION_SIZE_USDT,
    },
    "balance": None,
    "last_update": None,
}
_bot_thread = None


def get_state() -> dict:
    with _lock:
        return dict(_state)


def update_config(key: str, value):
    with _lock:
        _state["config"][key] = value


def _set_state(**kwargs):
    with _lock:
        for k, v in kwargs.items():
            _state[k] = v
        _state["last_update"] = datetime.utcnow().isoformat()


def _log_trade(symbol, side, qty, price, action, sl=None, tp=None):
    trade = {
        "time": datetime.utcnow().isoformat(),
        "symbol": symbol,
        "side": side,
        "qty": qty,
        "price": price,
        "action": action,
        "stop_loss": sl,
        "take_profit": tp,
    }
    with _lock:
        _state["trades"].insert(0, trade)
        _state["trades"] = _state["trades"][:100]  # keep last 100
    log.info(f"TRADE: {trade}")


def _log_error(msg: str):
    with _lock:
        _state["errors"].insert(0, {"time": datetime.utcnow().isoformat(), "msg": msg})
        _state["errors"] = _state["errors"][:20]
    log.error(msg)


# ── Core Logic ────────────────────────────────────────────────────────────────

def _get_open_position(symbol: str):
    """Returns position dict if we have an active position, else None."""
    try:
        positions = ac.get_positions(symbol)
        for p in positions:
            if p["symbol"] == symbol and float(p["positionAmt"]) != 0:
                return p
    except Exception as e:
        _log_error(f"get_positions error: {e}")
    return None


def _calc_qty(symbol: str, price: float) -> float:
    """Calculate position size in contracts from USDT budget."""
    cfg = get_state()["config"]
    size_usdt = cfg["position_size_usdt"]
    leverage = cfg["leverage"]
    notional = size_usdt * leverage
    qty = round(notional / price, 3)
    return max(qty, 0.001)


def _process_symbol(symbol: str):
    cfg = get_state()["config"]
    leverage = cfg["leverage"]
    sl_pct = cfg["stop_loss_pct"]
    tp_pct = cfg["take_profit_pct"]
    interval = cfg["kline_interval"]

    try:
        # Get market data
        klines = ac.get_klines(symbol, interval=interval, limit=100)
        signal = strat.analyze(symbol, klines)

        with _lock:
            _state["signals"][symbol] = {
                "action": signal.action,
                "reason": signal.reason,
                "rsi": signal.rsi,
                "macd": signal.macd,
                "macd_signal": signal.macd_signal,
                "close": signal.close,
                "time": datetime.utcnow().isoformat(),
            }

        open_pos = _get_open_position(symbol)

        with _lock:
            _state["positions"][symbol] = open_pos

        # Already in a position — let SL/TP orders handle exit
        if open_pos:
            amt = float(open_pos["positionAmt"])
            direction = "LONG" if amt > 0 else "SHORT"
            log.info(f"{symbol}: In {direction} position ({amt}), waiting for SL/TP")
            return

        # No position — check for entry signal
        if signal.action not in ("LONG", "SHORT"):
            log.info(f"{symbol}: {signal.action} — {signal.reason}")
            return

        price = signal.close
        qty = _calc_qty(symbol, price)
        side = "BUY" if signal.action == "LONG" else "SELL"

        log.info(f"{symbol}: Signal {signal.action} @ {price} | RSI={signal.rsi} | qty={qty}")

        # Set leverage
        try:
            ac.set_leverage(symbol, leverage)
        except Exception as e:
            log.warning(f"set_leverage: {e}")

        # Place market order
        order = ac.place_order(symbol=symbol, side=side, quantity=qty, order_type="MARKET")
        entry_price = float(order.get("avgPrice", price)) or price

        # Place SL and TP
        sl_price = strat.calc_stop_loss(entry_price, signal.action, sl_pct)
        tp_price = strat.calc_take_profit(entry_price, signal.action, tp_pct)

        try:
            ac.place_stop_loss(symbol, side, qty, sl_price)
        except Exception as e:
            _log_error(f"SL order failed for {symbol}: {e}")

        try:
            ac.place_take_profit(symbol, side, qty, tp_price)
        except Exception as e:
            _log_error(f"TP order failed for {symbol}: {e}")

        _log_trade(symbol, side, qty, entry_price, signal.action, sl=sl_price, tp=tp_price)

    except Exception as e:
        _log_error(f"process_symbol({symbol}) error: {e}")


def _bot_loop():
    log.info("Bot started")
    _set_state(running=True, status="running")

    while get_state()["running"]:
        try:
            # Refresh balance
            bal = ac.get_balance()
            usdt_bal = next((b for b in bal if b.get("asset") == "USDT"), None)
            _set_state(balance=usdt_bal)
        except Exception as e:
            _log_error(f"balance fetch error: {e}")

        for symbol in SYMBOLS:
            if not get_state()["running"]:
                break
            _process_symbol(symbol)

        time.sleep(POLL_INTERVAL)

    _set_state(running=False, status="stopped")
    log.info("Bot stopped")


# ── Control API ───────────────────────────────────────────────────────────────

def start():
    global _bot_thread
    if get_state()["running"]:
        return {"ok": False, "msg": "Already running"}
    _set_state(running=True)
    _bot_thread = threading.Thread(target=_bot_loop, daemon=True)
    _bot_thread.start()
    return {"ok": True, "msg": "Bot started"}


def stop():
    _set_state(running=False, status="stopping")
    return {"ok": True, "msg": "Bot stopping..."}


def emergency_close(symbol: str):
    """Immediately cancel all orders and close position."""
    try:
        ac.cancel_all_orders(symbol)
        pos = _get_open_position(symbol)
        if pos:
            ac.close_position(symbol, pos["positionAmt"])
            _log_trade(symbol, "CLOSE", pos["positionAmt"], 0, "EMERGENCY_CLOSE")
            return {"ok": True, "msg": f"Position closed for {symbol}"}
        return {"ok": True, "msg": "No open position"}
    except Exception as e:
        _log_error(f"emergency_close error: {e}")
        return {"ok": False, "msg": str(e)}
