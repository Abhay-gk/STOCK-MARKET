"""
StockPulse — Real-time stock broker client dashboard.
Flask + Flask-SocketIO backend with in-memory state and random walk price simulation.
Each connected client receives independent price feeds via WebSocket.
Tracks OHLC (Open, High, Low, Close) data and simulated volume per session.
"""

import math
import random
import threading
import time

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = "stockpulse-secret-key-9f3a7c"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

STOCKS = {
    "GOOG": {"name": "Alphabet Inc.", "base_price": 178.25},
    "TSLA": {"name": "Tesla Inc.", "base_price": 248.50},
    "AMZN": {"name": "Amazon.com Inc.", "base_price": 186.75},
    "META": {"name": "Meta Platforms Inc.", "base_price": 507.30},
    "NVDA": {"name": "NVIDIA Corp.", "base_price": 135.60},
}

HISTORY_LEN = 60

clients = {}


def active_user_count():
    """Count clients that have authenticated with an email."""
    return sum(1 for c in clients.values() if c["email"])


def broadcast_user_count():
    """Emit the current active user count to every connected client."""
    count = active_user_count()
    socketio.emit("user_count", {"count": count})


@app.route("/")
def login_page():
    return render_template("login.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@socketio.on("connect")
def on_connect():
    sid = request.sid
    clients[sid] = {
        "email": None,
        "subscriptions": set(),
        "prices": {t: s["base_price"] for t, s in STOCKS.items()},
        "open_prices": {t: s["base_price"] for t, s in STOCKS.items()},
        "high_prices": {t: s["base_price"] for t, s in STOCKS.items()},
        "low_prices": {t: s["base_price"] for t, s in STOCKS.items()},
        "histories": {t: [s["base_price"]] * HISTORY_LEN for t, s in STOCKS.items()},
        "volumes": {t: 0 for t in STOCKS},
        "tick_count": {t: 0 for t in STOCKS},
    }
    emit("stock_list", {
        "stocks": {t: {"name": s["name"], "base_price": s["base_price"]} for t, s in STOCKS.items()}
    })


@socketio.on("disconnect")
def on_disconnect():
    clients.pop(request.sid, None)
    broadcast_user_count()


@socketio.on("auth")
def on_auth(data):
    sid = request.sid
    email = data.get("email", "").strip()
    if not email:
        emit("auth_error", {"message": "Email is required."})
        return
    if sid in clients:
        clients[sid]["email"] = email
    emit("auth_success", {"email": email})
    broadcast_user_count()


@socketio.on("subscribe")
def on_subscribe(data):
    sid = request.sid
    ticker = data.get("ticker", "").upper()
    if sid not in clients or ticker not in STOCKS:
        return
    client = clients[sid]
    client["subscriptions"].add(ticker)
    price = client["prices"][ticker]
    history = client["histories"][ticker]
    emit("snapshot", {
        "ticker": ticker,
        "name": STOCKS[ticker]["name"],
        "price": round(price, 2),
        "change": 0.00,
        "change_percent": 0.00,
        "open": round(client["open_prices"][ticker], 2),
        "high": round(client["high_prices"][ticker], 2),
        "low": round(client["low_prices"][ticker], 2),
        "volume": client["volumes"][ticker],
        "history": [round(p, 2) for p in history],
    })


@socketio.on("unsubscribe")
def on_unsubscribe(data):
    sid = request.sid
    ticker = data.get("ticker", "").upper()
    if sid in clients:
        clients[sid]["subscriptions"].discard(ticker)
    emit("unsubscribed", {"ticker": ticker})


def price_engine():
    """Background thread: generates independent random walk prices per client every second."""
    while True:
        time.sleep(1)
        for sid, client in list(clients.items()):
            if not client["email"] or not client["subscriptions"]:
                continue
            updates = []
            for ticker in list(client["subscriptions"]):
                prev = client["prices"][ticker]
                delta_pct = random.gauss(0, 0.4)
                delta = prev * (delta_pct / 100)
                new_price = max(0.01, prev + delta)

                client["prices"][ticker] = new_price
                client["tick_count"][ticker] += 1

                if new_price > client["high_prices"][ticker]:
                    client["high_prices"][ticker] = new_price
                if new_price < client["low_prices"][ticker]:
                    client["low_prices"][ticker] = new_price

                vol_increment = int(random.uniform(100, 5000) * (1 + abs(delta_pct)))
                client["volumes"][ticker] += vol_increment

                history = client["histories"][ticker]
                history.append(new_price)
                if len(history) > HISTORY_LEN:
                    history.pop(0)

                change = new_price - prev
                change_pct = (change / prev) * 100 if prev else 0.0
                updates.append({
                    "ticker": ticker,
                    "price": round(new_price, 2),
                    "change": round(change, 2),
                    "change_percent": round(change_pct, 2),
                    "open": round(client["open_prices"][ticker], 2),
                    "high": round(client["high_prices"][ticker], 2),
                    "low": round(client["low_prices"][ticker], 2),
                    "volume": client["volumes"][ticker],
                    "history": [round(p, 2) for p in history],
                })
            if updates:
                try:
                    socketio.emit("tick", {"updates": updates}, room=sid)
                except Exception:
                    pass


if __name__ == "__main__":
    threading.Thread(target=price_engine, daemon=True).start()
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, allow_unsafe_werkzeug=True)
