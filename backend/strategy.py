"""
Trading Strategy: RSI + MACD Confluence
- LONG:  RSI < 35 (oversold) + MACD line crosses above signal line
- SHORT: RSI > 65 (overbought) + MACD line crosses below signal line
- EXIT:  Stop loss & take profit as % from entry price
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Literal


@dataclass
class Signal:
    action: Literal["LONG", "SHORT", "CLOSE_LONG", "CLOSE_SHORT", "HOLD"]
    symbol: str
    reason: str
    rsi: float
    macd: float
    macd_signal: float
    close: float


def parse_klines(raw: list) -> pd.DataFrame:
    df = pd.DataFrame(raw, columns=[
        "openTime", "open", "high", "low", "close",
        "volume", "closeTime", "quoteVolume", "trades",
        "takerBuyBase", "takerBuyQuote", "ignore"
    ])
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)
    return df


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def calc_macd(series: pd.Series,
              fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def analyze(symbol: str, klines: list,
            rsi_period: int = 14,
            rsi_oversold: float = 35.0,
            rsi_overbought: float = 65.0) -> Signal:
    """
    Returns a Signal with action and indicator values.
    Needs at least 50 candles for reliable signals.
    """
    df = parse_klines(klines)
    closes = df["close"]

    rsi = calc_rsi(closes, rsi_period)
    macd_line, signal_line, _ = calc_macd(closes)

    current_rsi = rsi.iloc[-1]
    current_macd = macd_line.iloc[-1]
    current_signal = signal_line.iloc[-1]
    prev_macd = macd_line.iloc[-2]
    prev_signal = signal_line.iloc[-2]
    current_close = closes.iloc[-1]

    # MACD crossover detection
    macd_bullish_cross = (prev_macd < prev_signal) and (current_macd > current_signal)
    macd_bearish_cross = (prev_macd > prev_signal) and (current_macd < current_signal)

    action = "HOLD"
    reason = "No signal"

    if current_rsi < rsi_oversold and macd_bullish_cross:
        action = "LONG"
        reason = f"RSI {current_rsi:.1f} oversold + MACD bullish cross"
    elif current_rsi > rsi_overbought and macd_bearish_cross:
        action = "SHORT"
        reason = f"RSI {current_rsi:.1f} overbought + MACD bearish cross"

    return Signal(
        action=action,
        symbol=symbol,
        reason=reason,
        rsi=round(current_rsi, 2),
        macd=round(current_macd, 6),
        macd_signal=round(current_signal, 6),
        close=current_close,
    )


def calc_stop_loss(entry: float, side: str, pct: float) -> float:
    """Calculate stop loss price."""
    if side == "LONG":
        return round(entry * (1 - pct / 100), 2)
    else:  # SHORT
        return round(entry * (1 + pct / 100), 2)


def calc_take_profit(entry: float, side: str, pct: float) -> float:
    """Calculate take profit price."""
    if side == "LONG":
        return round(entry * (1 + pct / 100), 2)
    else:  # SHORT
        return round(entry * (1 - pct / 100), 2)
