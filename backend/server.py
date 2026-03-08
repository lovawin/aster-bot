from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import bot
import aster_client as ac

app = FastAPI(title="Aster Trading Bot")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ConfigUpdate(BaseModel):
    leverage: Optional[int] = None
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    position_size_usdt: Optional[float] = None
    direction: Optional[str] = None  # LONG, SHORT, BOTH
    rsi_oversold: Optional[float] = None
    rsi_overbought: Optional[float] = None

class ManualTrade(BaseModel):
    symbol: str
    side: str
    quantity: float
    order_type: str = "MARKET"
    price: Optional[float] = None

@app.get("/status")
def get_status(): return bot.get_state()

@app.get("/balance")
def get_balance():
    try: return ac.get_balance()
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/positions")
def get_positions():
    try: return ac.get_positions()
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/klines/{symbol}")
def get_klines(symbol: str, interval: str = "5m", limit: int = 100):
    try: return ac.get_klines(symbol, interval=interval, limit=limit)
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/ticker/{symbol}")
def get_ticker(symbol: str):
    try: return ac.get_ticker(symbol)
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/funding/{symbol}")
def get_funding(symbol: str):
    try: return ac.get_funding_rate(symbol)
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/bot/start")
def start_bot(): return bot.start()

@app.post("/bot/stop")
def stop_bot(): return bot.stop()

@app.post("/bot/close/{symbol}")
def emergency_close(symbol: str): return bot.emergency_close(symbol.upper())

@app.post("/bot/config")
def update_config(cfg: ConfigUpdate):
    updates = cfg.model_dump(exclude_none=True)
    for k, v in updates.items():
        bot.update_config(k, v)
    return {"ok": True, "config": bot.get_state()["config"]}

@app.post("/trade/manual")
def manual_trade(trade: ManualTrade):
    try:
        result = ac.place_order(
            symbol=trade.symbol.upper(),
            side=trade.side.upper(),
            quantity=trade.quantity,
            order_type=trade.order_type,
            price=trade.price,
        )
        bot._log_trade(trade.symbol.upper(), trade.side.upper(), trade.quantity, trade.price or 0, "MANUAL")
        return {"ok": True, "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/orders/{symbol}")
def cancel_all(symbol: str):
    try: return ac.cancel_all_orders(symbol.upper())
    except Exception as e: raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn, os
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("BACKEND_PORT", 8000)), reload=True)
