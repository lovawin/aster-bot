"""
Aster DEX API Client (v1 HMAC)
Futures base: https://fapi.asterdex.com
"""
import hashlib
import hmac
import time
import os
import requests
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

BASE_URL = "https://fapi.asterdex.com"
API_KEY = os.getenv("ASTER_API_KEY")
API_SECRET = os.getenv("ASTER_API_SECRET")


def _sign(params: dict) -> str:
    query = urlencode(params)
    return hmac.new(API_SECRET.encode(), query.encode(), hashlib.sha256).hexdigest()


def _headers():
    return {"X-MBX-APIKEY": API_KEY, "Content-Type": "application/x-www-form-urlencoded"}


def _get(path: str, params: dict = None, signed: bool = False):
    params = params or {}
    if signed:
        params["timestamp"] = int(time.time() * 1000)
        params["recvWindow"] = 5000
        params["signature"] = _sign(params)
    r = requests.get(BASE_URL + path, params=params, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json()


def _post(path: str, params: dict = None, signed: bool = True):
    params = params or {}
    if signed:
        params["timestamp"] = int(time.time() * 1000)
        params["recvWindow"] = 5000
        params["signature"] = _sign(params)
    r = requests.post(BASE_URL + path, data=params, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json()


def _delete(path: str, params: dict = None, signed: bool = True):
    params = params or {}
    if signed:
        params["timestamp"] = int(time.time() * 1000)
        params["recvWindow"] = 5000
        params["signature"] = _sign(params)
    r = requests.delete(BASE_URL + path, params=params, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json()


# ── Market Data ─────────────────────────────────────────────────────────────

def get_klines(symbol: str, interval: str = "5m", limit: int = 100):
    """Returns list of [openTime, open, high, low, close, volume, ...]"""
    return _get("/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": limit})


def get_ticker(symbol: str):
    return _get("/fapi/v1/ticker/24hr", {"symbol": symbol})


def get_price(symbol: str):
    return _get("/fapi/v1/ticker/price", {"symbol": symbol})


def get_funding_rate(symbol: str):
    return _get("/fapi/v1/premiumIndex", {"symbol": symbol})


def get_server_time():
    return _get("/fapi/v1/time")


# ── Account ──────────────────────────────────────────────────────────────────

def get_balance():
    return _get("/fapi/v2/balance", signed=True)


def get_account():
    return _get("/fapi/v2/account", signed=True)


def get_positions(symbol: str = None):
    params = {}
    if symbol:
        params["symbol"] = symbol
    return _get("/fapi/v2/positionRisk", params, signed=True)


def get_open_orders(symbol: str = None):
    params = {}
    if symbol:
        params["symbol"] = symbol
    return _get("/fapi/v1/openOrders", params, signed=True)


# ── Trading ───────────────────────────────────────────────────────────────────

def set_leverage(symbol: str, leverage: int):
    return _post("/fapi/v1/leverage", {"symbol": symbol, "leverage": leverage})


def set_margin_mode(symbol: str, margin_type: str = "ISOLATED"):
    """margin_type: ISOLATED or CROSSED"""
    try:
        return _post("/fapi/v1/marginType", {"symbol": symbol, "marginType": margin_type})
    except Exception as e:
        # Already set — Aster returns error if unchanged
        return {"msg": str(e)}


def place_order(symbol: str, side: str, quantity: float,
                order_type: str = "MARKET", price: float = None,
                stop_price: float = None, reduce_only: bool = False,
                position_side: str = "BOTH"):
    """
    side: BUY (long) or SELL (short)
    order_type: MARKET, LIMIT, STOP_MARKET, TAKE_PROFIT_MARKET
    """
    params = {
        "symbol": symbol,
        "side": side,
        "type": order_type,
        "quantity": quantity,
        "positionSide": position_side,
    }
    if price:
        params["price"] = price
        params["timeInForce"] = "GTC"
    if stop_price:
        params["stopPrice"] = stop_price
    if reduce_only:
        params["reduceOnly"] = "true"
    return _post("/fapi/v1/order", params)


def place_stop_loss(symbol: str, side: str, quantity: float, stop_price: float):
    """Place a stop-market order to close a position."""
    close_side = "SELL" if side == "BUY" else "BUY"
    return place_order(
        symbol=symbol,
        side=close_side,
        quantity=quantity,
        order_type="STOP_MARKET",
        stop_price=stop_price,
        reduce_only=True,
    )


def place_take_profit(symbol: str, side: str, quantity: float, take_profit_price: float):
    """Place a take-profit-market order."""
    close_side = "SELL" if side == "BUY" else "BUY"
    return place_order(
        symbol=symbol,
        side=close_side,
        quantity=quantity,
        order_type="TAKE_PROFIT_MARKET",
        stop_price=take_profit_price,
        reduce_only=True,
    )


def cancel_order(symbol: str, order_id: int):
    return _delete("/fapi/v1/order", {"symbol": symbol, "orderId": order_id})


def cancel_all_orders(symbol: str):
    return _delete("/fapi/v1/allOpenOrders", {"symbol": symbol})


def close_position(symbol: str, position_amt: float, position_side: str = "BOTH"):
    """Market close an open position."""
    side = "SELL" if float(position_amt) > 0 else "BUY"
    qty = abs(float(position_amt))
    return place_order(symbol=symbol, side=side, quantity=qty,
                       order_type="MARKET", reduce_only=True,
                       position_side=position_side)
