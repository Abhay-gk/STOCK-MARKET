<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/flask-3.1-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/websocket-socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/chart.js-4.4-FF6384?style=for-the-badge&logo=chart.js&logoColor=white" alt="Chart.js" />
</p>

<h1 align="center">📈 StockPulse</h1>

<p align="center">
  <strong>Real-time stock broker client dashboard with live WebSocket price feeds, interactive sparklines, OHLC tracking, and a Bloomberg-grade dark UI.</strong>
</p>

<p align="center">
  Built with Flask, Flask-SocketIO, Chart.js, and TailwindCSS — zero external APIs, zero databases, pure in-memory simulation.
</p>

---

## ✨ Features

### Core Requirements

| Feature | Description |
|---|---|
| **Email-based sessions** | Lightweight login — just an email, no password. Session persists via `localStorage`. |
| **5 live markets** | `GOOG` · `TSLA` · `AMZN` · `META` · `NVDA` — subscribe to any combination. |
| **Real-time price feeds** | Prices update every second via WebSocket using a Gaussian random walk model. |
| **Independent user feeds** | Each browser tab/session gets its own isolated price stream — fully concurrent. |

### Beyond Requirements

| Feature | Description |
|---|---|
| **Bloomberg-style ticker tape** | Scrolling price ribbon below the navbar shows all markets at a glance. |
| **OHLC session tracking** | Each card displays Open, High, Low, and Change — real trading terminal data. |
| **Simulated volume** | Realistic volume accumulation per stock, formatted with K/M suffixes. |
| **Interactive sparklines** | 60-point rolling Chart.js sparklines that update in-place without re-creation. |
| **Expanded chart modal** | Click any stock card for a full-screen chart with tooltips and Y-axis scale. |
| **Price alert toasts** | Significant moves (≥0.5%) trigger slide-in notifications with auto-dismiss. |
| **Active users counter** | Navbar shows live connected user count — proves multi-user concurrency. |
| **Market summary bar** | Aggregate stats: subscribed count, portfolio value, session uptime, total volume. |
| **Keyboard shortcuts** | `1-5` toggle stocks, `?` opens help, `Esc` closes modals. Power-user UX. |
| **Price flash animations** | Cards flash green on uptick, red on downtick — subtle CSS `@keyframes`. |
| **Live connection indicator** | Pulsing green dot confirms WebSocket is connected and streaming. |
| **Auto-reconnection** | Socket.IO client handles disconnects gracefully with exponential backoff. |
| **Responsive design** | Adapts seamlessly from desktop to mobile. |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Tab                           │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Login     │→ │  Dashboard   │  │  Chart.js Sparklines │ │
│  │  (email)    │  │  (Vanilla JS │  │  (60-pt rolling)     │ │
│  └────────────┘  │  + Tailwind) │  └──────────────────────┘ │
│                  └──────┬───────┘                            │
│  ┌──────────────────────┼───────────────────────────────┐   │
│  │  Ticker Tape │ Chart Modal │ Toast Alerts │ Kbd Shortcuts │
│  └──────────────────────┼───────────────────────────────┘   │
│                         │ Socket.IO (WebSocket)              │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    Flask Server (:5000)                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │               Flask-SocketIO Event Handlers            │  │
│  │  auth · subscribe · unsubscribe · connect · disconnect │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │             Price Engine (Background Thread)           │  │
│  │  • Gaussian random walk (μ=0, σ=0.4%)                  │  │
│  │  • Per-client independent OHLC + price state           │  │
│  │  • 60-point sliding history window                     │  │
│  │  • Simulated volume accumulation                       │  │
│  │  • 1-second tick interval                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           In-Memory State (Python dicts)               │  │
│  │  clients[sid] = {                                      │  │
│  │    email, subscriptions, prices, histories,            │  │
│  │    open_prices, high_prices, low_prices, volumes       │  │
│  │  }                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │          Active User Broadcasting                      │  │
│  │  • Emits user_count on connect/disconnect/auth         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
stockpulse/
├── app.py                  # Flask server + SocketIO handlers + price engine + OHLC
├── requirements.txt        # Pinned Python dependencies
├── templates/
│   ├── login.html          # Email login page (glassmorphic dark UI)
│   └── dashboard.html      # Dashboard shell (ticker tape, modal, toasts, shortcuts)
├── static/
│   ├── css/
│   │   └── style.css       # Custom styles, animations, ticker tape, modal, toasts
│   └── js/
│       └── dashboard.js    # Socket mgmt, cards, sparklines, modal, alerts, keyboard
├── .gitignore              # Python/Flask ignore rules
└── README.md               # You are here
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** installed
- **pip** package manager

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/stockpulse.git
cd stockpulse

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Launch the server
python app.py
```

### Open the app

Navigate to **[http://localhost:5000](http://localhost:5000)** in your browser.

1. Enter any email address (e.g., `alice@example.com`)
2. Click **Enter Dashboard**
3. Subscribe to stocks using the market toggles (or press `1`-`5`)
4. Watch prices stream in real-time with sparkline charts
5. Click any card to open the expanded chart modal
6. Press `?` to see all keyboard shortcuts

---

## 🧪 Testing Multi-User Feeds

StockPulse generates **independent price streams per session**. To verify:

1. Open **Tab A** → login as `alice@example.com` → subscribe to `GOOG`, `TSLA`
2. Open **Tab B** → login as `bob@example.com` → subscribe to `GOOG`, `NVDA`
3. Observe that `GOOG` prices **differ between tabs** — each session runs its own random walk
4. Check the **"X online"** counter in the navbar — it should show `2`
5. Subscribing/unsubscribing in one tab does **not** affect the other

This confirms that the server maintains fully isolated per-client state with concurrent WebSocket connections.

---

## ⚙️ Technical Details

### Price Simulation

Prices follow a **Gaussian random walk**:

```
price(t+1) = price(t) × (1 + δ/100)
where δ ~ N(μ=0, σ=0.4)
```

- Base prices are seeded from realistic market values
- Each client gets an independent copy of the price state
- OHLC (Open, High, Low) tracked per session per stock
- Volume simulated with randomized increments weighted by volatility
- History window maintains the last 60 data points for charts

### WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `auth` | Client → Server | `{ email }` |
| `auth_success` | Server → Client | `{ email }` |
| `stock_list` | Server → Client | `{ stocks: { ticker: {name, base_price} } }` |
| `subscribe` | Client → Server | `{ ticker }` |
| `unsubscribe` | Client → Server | `{ ticker }` |
| `snapshot` | Server → Client | `{ ticker, name, price, change, change_percent, open, high, low, volume, history }` |
| `tick` | Server → Client | `{ updates: [{ ticker, price, change, change_percent, open, high, low, volume, history }] }` |
| `unsubscribed` | Server → Client | `{ ticker }` |
| `user_count` | Server → All | `{ count }` |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` – `5` | Toggle subscription for the corresponding stock |
| `?` | Open/close keyboard shortcuts help |
| `Esc` | Close chart modal or help overlay |

### Frontend Architecture

- **No frameworks** — vanilla JavaScript with an IIFE module pattern
- **Sparklines** update via `chart.data.datasets[0].data` mutation + `chart.update('none')` for zero-flicker rendering
- **Subscriptions** persist in `localStorage` and auto-restore on reconnect
- **Flash animations** use CSS `@keyframes` with `border-color` and `box-shadow`, restarted via reflow trick
- **Ticker tape** uses CSS `translateX` animation with duplicated content for seamless infinite scroll
- **Chart modal** creates a dedicated Chart.js instance with interactive tooltips and Y-axis scale

---

## 🎨 Design Philosophy

StockPulse's UI is inspired by **Bloomberg Terminal aesthetics** crossed with **modern fintech design**:

- **Color palette**: Deep navy (`#0a0e1a`) base with slate grays and blue accents
- **Typography**: Inter for UI text, JetBrains Mono for all numerical/ticker displays
- **Micro-animations**: Card entry/exit, price tick flashes, live dot pulse, button state transitions, toast slide-in
- **Information density**: Each card surfaces ticker, company, price, delta, percentage, OHLC, volume, and sparkline — at a glance
- **Progressive disclosure**: Summary bar for overview, cards for detail, modal for deep dive

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ☕ and WebSockets</sub>
</p>
