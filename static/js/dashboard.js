/**
 * StockPulse — Dashboard Controller
 * Manages WebSocket connection, subscriptions, live price updates, Chart.js sparklines,
 * ticker tape, OHLC tracking, chart modal, toast notifications, and keyboard shortcuts.
 */

(function () {
  "use strict";

  /* ──────────────────────────── State ──────────────────────────── */

  var state = {
    email: localStorage.getItem("stockpulse_email"),
    socket: null,
    stocks: {},
    subscriptions: new Set(
      JSON.parse(localStorage.getItem("stockpulse_subs") || "[]")
    ),
    charts: {},
    cardEls: {},
    prices: {},
    ohlc: {},
    volumes: {},
    histories: {},
    sessionStart: Date.now(),
    modalTicker: null,
    modalChart: null,
    tickerOrder: [],
  };

  /* ──────────────────────────── Boot ──────────────────────────── */

  function init() {
    if (!state.email) {
      window.location.href = "/";
      return;
    }
    document.getElementById("user-email").textContent = state.email;
    connectSocket();
    startUptimeClock();
  }

  /* ──────────────────────────── Socket ──────────────────────────── */

  function connectSocket() {
    state.socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    state.socket.on("connect", function () {
      setStatus(true);
      state.socket.emit("auth", { email: state.email });
    });

    state.socket.on("disconnect", function () {
      setStatus(false);
    });

    state.socket.on("reconnect", function () {
      setStatus(true);
      state.socket.emit("auth", { email: state.email });
      state.subscriptions.forEach(function (t) {
        state.socket.emit("subscribe", { ticker: t });
      });
    });

    state.socket.on("auth_success", function () {
      state.subscriptions.forEach(function (t) {
        state.socket.emit("subscribe", { ticker: t });
      });
    });

    state.socket.on("stock_list", function (data) {
      state.stocks = data.stocks;
      state.tickerOrder = Object.keys(data.stocks);
      renderSubPanel();
      initTickerTape();
    });

    state.socket.on("snapshot", function (data) {
      storeTickData(data);
      upsertCard(data);
      updateSummary();
    });

    state.socket.on("tick", function (data) {
      data.updates.forEach(function (u) {
        storeTickData(u);
        updateCard(u);
        updateTickerTape(u);
        checkAlert(u);
      });
      updateSummary();
      if (state.modalTicker) updateModal();
    });

    state.socket.on("unsubscribed", function (data) {
      removeCard(data.ticker);
      updateSummary();
    });

    state.socket.on("user_count", function (data) {
      var el = document.getElementById("user-count-val");
      if (el) el.textContent = data.count;
    });
  }

  function storeTickData(d) {
    state.prices[d.ticker] = d.price;
    if (d.open !== undefined) state.ohlc[d.ticker] = { open: d.open, high: d.high, low: d.low };
    if (d.volume !== undefined) state.volumes[d.ticker] = d.volume;
    if (d.history) state.histories[d.ticker] = d.history;
  }

  /* ──────────────────────────── Status ──────────────────────────── */

  function setStatus(connected) {
    var dot = document.getElementById("status-dot");
    var txt = document.getElementById("status-text");
    var wrap = document.getElementById("connection-status");
    if (connected) {
      dot.className = "w-2 h-2 rounded-full bg-emerald-500 transition-colors duration-300";
      dot.style.boxShadow = "0 0 8px rgba(16,185,129,0.5)";
      txt.textContent = "Live";
      txt.className = "text-xs font-medium text-emerald-400 font-mono";
      wrap.className =
        "flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/20";
    } else {
      dot.className = "w-2 h-2 rounded-full bg-red-500 transition-colors duration-300";
      dot.style.boxShadow = "0 0 8px rgba(239,68,68,0.5)";
      txt.textContent = "Disconnected";
      txt.className = "text-xs font-medium text-red-400 font-mono";
      wrap.className =
        "flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/5 border border-red-500/20";
    }
  }

  /* ──────────────────────────── Ticker Tape ──────────────────────────── */

  function initTickerTape() {
    var inner = document.getElementById("ticker-tape-inner");
    inner.innerHTML = "";
    var html = "";
    for (var i = 0; i < 2; i++) {
      state.tickerOrder.forEach(function (t, idx) {
        var info = state.stocks[t];
        html +=
          '<div class="tape-item" id="tape-' + t + (i === 0 ? "" : "-dup") + '">' +
            '<span class="tape-ticker">' + t + '</span>' +
            '<span class="tape-price" data-tape-price="' + t + '">$' + fmtPrice(info.base_price) + '</span>' +
            '<span class="tape-change up" data-tape-change="' + t + '">0.00%</span>' +
          '</div>';
        if (idx < state.tickerOrder.length - 1 || i === 0) {
          html += '<span class="tape-sep">•</span>';
        }
      });
    }
    inner.innerHTML = html;
  }

  function updateTickerTape(data) {
    var priceEls = document.querySelectorAll('[data-tape-price="' + data.ticker + '"]');
    var changeEls = document.querySelectorAll('[data-tape-change="' + data.ticker + '"]');
    var isUp = data.change >= 0;
    var sign = isUp ? "+" : "";
    priceEls.forEach(function (el) {
      el.textContent = "$" + fmtPrice(data.price);
    });
    changeEls.forEach(function (el) {
      el.textContent = sign + data.change_percent.toFixed(2) + "%";
      el.className = "tape-change " + (isUp ? "up" : "down");
    });
  }

  /* ──────────────────────────── Market Summary ──────────────────────────── */

  function updateSummary() {
    var subCount = state.subscriptions.size;
    document.getElementById("stat-subscribed").textContent = subCount + " / 5";

    var total = 0;
    state.subscriptions.forEach(function (t) {
      if (state.prices[t]) total += state.prices[t];
    });
    document.getElementById("stat-portfolio").textContent = "$" + fmtPrice(total);

    var totalVol = 0;
    state.subscriptions.forEach(function (t) {
      if (state.volumes[t]) totalVol += state.volumes[t];
    });
    document.getElementById("stat-volume").textContent = fmtVolume(totalVol);
  }

  function startUptimeClock() {
    setInterval(function () {
      var elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      var h = Math.floor(m / 60);
      m = m % 60;
      var txt = h > 0
        ? pad(h) + ":" + pad(m) + ":" + pad(s)
        : pad(m) + ":" + pad(s);
      document.getElementById("stat-uptime").textContent = txt;
    }, 1000);
  }

  /* ──────────────────────────── Subscription Panel ──────────────────────────── */

  function renderSubPanel() {
    var panel = document.getElementById("subscription-panel");
    panel.innerHTML = "";
    state.tickerOrder.forEach(function (ticker, idx) {
      var info = state.stocks[ticker];
      var btn = document.createElement("button");
      btn.id = "sub-btn-" + ticker;
      btn.className = "sub-btn" + (state.subscriptions.has(ticker) ? " active" : "");
      btn.innerHTML =
        '<span class="dot"></span>' +
        '<span>' + ticker + '</span>' +
        '<span class="text-[0.6rem] font-sans font-normal opacity-50 hidden sm:inline">' +
        info.name.split(" ")[0] +
        "</span>" +
        '<span class="text-[0.55rem] font-mono text-slate-600 hidden md:inline ml-1">[' + (idx + 1) + ']</span>';
      btn.addEventListener("click", function () {
        toggleSub(ticker);
      });
      panel.appendChild(btn);
    });
  }

  function toggleSub(ticker) {
    if (state.subscriptions.has(ticker)) {
      state.subscriptions.delete(ticker);
      state.socket.emit("unsubscribe", { ticker: ticker });
      updateSubBtn(ticker, false);
    } else {
      state.subscriptions.add(ticker);
      state.socket.emit("subscribe", { ticker: ticker });
      updateSubBtn(ticker, true);
    }
    localStorage.setItem(
      "stockpulse_subs",
      JSON.stringify(Array.from(state.subscriptions))
    );
    updateSummary();
  }

  function updateSubBtn(ticker, active) {
    var btn = document.getElementById("sub-btn-" + ticker);
    if (!btn) return;
    if (active) btn.classList.add("active");
    else btn.classList.remove("active");
  }

  /* ──────────────────────────── Cards ──────────────────────────── */

  function upsertCard(data) {
    if (state.cardEls[data.ticker]) {
      updateCard(data);
      return;
    }

    var grid = document.getElementById("cards-grid");
    var empty = document.getElementById("empty-state");
    empty.style.display = "none";

    var card = document.createElement("div");
    card.id = "card-" + data.ticker;
    card.className = "stock-card entering";
    card.addEventListener("click", function () {
      openChartModal(data.ticker);
    });

    var canvasId = "spark-" + data.ticker;
    var o = data.open || data.price;
    var h = data.high || data.price;
    var l = data.low || data.price;
    var vol = data.volume || 0;

    card.innerHTML =
      '<div class="flex items-start justify-between mb-3">' +
        '<div>' +
          '<div class="ticker-symbol">' + data.ticker + '</div>' +
          '<div class="company-name">' + (data.name || "") + '</div>' +
        '</div>' +
        '<div class="text-right">' +
          '<div class="price-change neutral" id="change-' + data.ticker + '">' +
            '<span>—</span>' +
          '</div>' +
          '<div class="text-[0.65rem] text-slate-500 font-mono mt-0.5" id="pct-' + data.ticker + '">0.00%</div>' +
        '</div>' +
      '</div>' +
      '<div class="price-value" id="price-' + data.ticker + '">' +
        '$' + fmtPrice(data.price) +
      '</div>' +
      '<div class="volume-badge" id="vol-' + data.ticker + '">' +
        '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' +
        'Vol: ' + fmtVolume(vol) +
      '</div>' +
      '<div class="sparkline-wrap">' +
        '<canvas id="' + canvasId + '"></canvas>' +
      '</div>' +
      '<div class="ohlc-row">' +
        '<div class="ohlc-item"><div class="ohlc-label">Open</div><div class="ohlc-val" id="ohlc-o-' + data.ticker + '">$' + fmtPrice(o) + '</div></div>' +
        '<div class="ohlc-item"><div class="ohlc-label">High</div><div class="ohlc-val text-emerald-400/70" id="ohlc-h-' + data.ticker + '">$' + fmtPrice(h) + '</div></div>' +
        '<div class="ohlc-item"><div class="ohlc-label">Low</div><div class="ohlc-val text-red-400/70" id="ohlc-l-' + data.ticker + '">$' + fmtPrice(l) + '</div></div>' +
        '<div class="ohlc-item"><div class="ohlc-label">Chg</div><div class="ohlc-val" id="ohlc-c-' + data.ticker + '">0.00%</div></div>' +
      '</div>';

    grid.appendChild(card);
    state.cardEls[data.ticker] = card;

    setTimeout(function () {
      card.classList.remove("entering");
    }, 500);

    createSparkline(canvasId, data.history || []);
  }

  function updateCard(data) {
    var card = state.cardEls[data.ticker];
    if (!card) {
      upsertCard(data);
      return;
    }

    var priceEl = document.getElementById("price-" + data.ticker);
    var changeEl = document.getElementById("change-" + data.ticker);
    var pctEl = document.getElementById("pct-" + data.ticker);
    var volEl = document.getElementById("vol-" + data.ticker);

    if (priceEl) priceEl.textContent = "$" + fmtPrice(data.price);

    var isUp = data.change >= 0;
    var arrow = isUp ? "↑" : "↓";
    var sign = isUp ? "+" : "";
    var cls = data.change === 0 ? "neutral" : isUp ? "up" : "down";

    if (changeEl) {
      changeEl.className = "price-change " + cls;
      changeEl.innerHTML =
        "<span>" + arrow + " " + sign + "$" + fmtPrice(Math.abs(data.change)) + "</span>";
    }

    if (pctEl) {
      pctEl.textContent = sign + data.change_percent.toFixed(2) + "%";
      pctEl.className =
        "text-[0.65rem] font-mono mt-0.5 " +
        (data.change === 0 ? "text-slate-500" : isUp ? "text-emerald-400/70" : "text-red-400/70");
    }

    if (volEl && data.volume !== undefined) {
      volEl.innerHTML =
        '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' +
        'Vol: ' + fmtVolume(data.volume);
    }

    /* OHLC */
    var oO = document.getElementById("ohlc-o-" + data.ticker);
    var oH = document.getElementById("ohlc-h-" + data.ticker);
    var oL = document.getElementById("ohlc-l-" + data.ticker);
    var oC = document.getElementById("ohlc-c-" + data.ticker);
    if (oO && data.open !== undefined) oO.textContent = "$" + fmtPrice(data.open);
    if (oH && data.high !== undefined) oH.textContent = "$" + fmtPrice(data.high);
    if (oL && data.low !== undefined) oL.textContent = "$" + fmtPrice(data.low);
    if (oC) {
      oC.textContent = sign + data.change_percent.toFixed(2) + "%";
      oC.className = "ohlc-val " + (isUp ? "text-emerald-400/70" : "text-red-400/70");
    }

    /* Flash animation */
    card.classList.remove("tick-up", "tick-down");
    void card.offsetWidth;
    if (data.change > 0) card.classList.add("tick-up");
    else if (data.change < 0) card.classList.add("tick-down");

    /* Update sparkline */
    var chart = state.charts[data.ticker];
    if (chart && data.history) {
      chart.data.datasets[0].data = data.history;
      chart.data.labels = Array(data.history.length).fill("");

      var lineColor = isUp ? "#10b981" : "#ef4444";
      chart.data.datasets[0].borderColor = lineColor;

      var ctx = chart.ctx;
      if (ctx) {
        var gradient = ctx.createLinearGradient(0, 0, 0, 70);
        gradient.addColorStop(0, isUp ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        chart.data.datasets[0].backgroundColor = gradient;
      }

      chart.update("none");
    }
  }

  function removeCard(ticker) {
    var card = state.cardEls[ticker];
    if (!card) return;

    card.classList.add("exiting");
    setTimeout(function () {
      if (state.charts[ticker]) {
        state.charts[ticker].destroy();
        delete state.charts[ticker];
      }
      card.remove();
      delete state.cardEls[ticker];
      delete state.prices[ticker];

      if (Object.keys(state.cardEls).length === 0) {
        document.getElementById("empty-state").style.display = "flex";
      }
    }, 350);
  }

  /* ──────────────────────────── Sparkline ──────────────────────────── */

  function createSparkline(canvasId, data) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext("2d");

    var gradient = ctx.createLinearGradient(0, 0, 0, 70);
    gradient.addColorStop(0, "rgba(59,130,246,0.18)");
    gradient.addColorStop(1, "rgba(59,130,246,0)");

    var ticker = canvasId.replace("spark-", "");

    state.charts[ticker] = new Chart(ctx, {
      type: "line",
      data: {
        labels: Array(data.length).fill(""),
        datasets: [
          {
            data: data.slice(),
            borderColor: "#3b82f6",
            borderWidth: 1.5,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        animation: false,
        elements: { line: { capBezierPoints: true } },
      },
    });
  }

  /* ──────────────────────────── Chart Modal ──────────────────────────── */

  function openChartModal(ticker) {
    state.modalTicker = ticker;
    var modal = document.getElementById("chart-modal");
    modal.classList.remove("hidden");
    document.getElementById("modal-ticker").textContent = ticker;
    document.getElementById("modal-name").textContent =
      state.stocks[ticker] ? state.stocks[ticker].name : "";
    updateModal();
    createModalChart(ticker);
  }

  function updateModal() {
    var t = state.modalTicker;
    if (!t) return;
    var p = state.prices[t];
    var o = state.ohlc[t];
    if (p !== undefined) document.getElementById("modal-price").textContent = "$" + fmtPrice(p);
    if (o) {
      document.getElementById("modal-open").textContent = "$" + fmtPrice(o.open);
      document.getElementById("modal-high").textContent = "$" + fmtPrice(o.high);
      document.getElementById("modal-low").textContent = "$" + fmtPrice(o.low);
    }
    if (state.modalChart && state.histories[t]) {
      var hist = state.histories[t];
      state.modalChart.data.datasets[0].data = hist;
      state.modalChart.data.labels = Array(hist.length).fill("");
      var last = hist[hist.length - 1] || 0;
      var prev = hist[hist.length - 2] || last;
      var isUp = last >= prev;
      state.modalChart.data.datasets[0].borderColor = isUp ? "#10b981" : "#ef4444";
      var ctx = state.modalChart.ctx;
      if (ctx) {
        var g = ctx.createLinearGradient(0, 0, 0, 260);
        g.addColorStop(0, isUp ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        state.modalChart.data.datasets[0].backgroundColor = g;
      }
      state.modalChart.update("none");
    }
  }

  function createModalChart(ticker) {
    if (state.modalChart) {
      state.modalChart.destroy();
      state.modalChart = null;
    }
    var canvas = document.getElementById("modal-chart-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var hist = state.histories[ticker] || [];
    var g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, "rgba(59,130,246,0.15)");
    g.addColorStop(1, "rgba(0,0,0,0)");

    state.modalChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: Array(hist.length).fill(""),
        datasets: [
          {
            data: hist.slice(),
            borderColor: "#3b82f6",
            borderWidth: 2,
            backgroundColor: g,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHitRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(15,22,41,0.9)",
            borderColor: "#1e293b",
            borderWidth: 1,
            titleFont: { family: "JetBrains Mono", size: 11 },
            bodyFont: { family: "JetBrains Mono", size: 12 },
            padding: 8,
            callbacks: {
              title: function () { return ticker; },
              label: function (ctx) { return "$" + fmtPrice(ctx.parsed.y); },
            },
          },
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            position: "right",
            grid: { color: "rgba(30,41,59,0.3)", drawBorder: false },
            ticks: {
              font: { family: "JetBrains Mono", size: 10 },
              color: "#475569",
              callback: function (v) { return "$" + fmtPrice(v); },
              maxTicksLimit: 5,
            },
          },
        },
        interaction: { mode: "index", intersect: false },
        animation: false,
      },
    });
  }

  window.closeChartModal = function () {
    state.modalTicker = null;
    document.getElementById("chart-modal").classList.add("hidden");
    if (state.modalChart) {
      state.modalChart.destroy();
      state.modalChart = null;
    }
  };

  window.closeModal = function (e) {
    if (e.target === e.currentTarget) window.closeChartModal();
  };

  /* ──────────────────────────── Toast Notifications ──────────────────────────── */

  function checkAlert(data) {
    if (Math.abs(data.change_percent) >= 0.5) {
      var isUp = data.change >= 0;
      showToast({
        ticker: data.ticker,
        message: (isUp ? "+" : "") + data.change_percent.toFixed(2) + "% → $" + fmtPrice(data.price),
        type: isUp ? "up" : "down",
      });
    }
  }

  function showToast(opts) {
    var container = document.getElementById("toast-container");
    var toast = document.createElement("div");
    toast.className = "toast toast-" + opts.type;
    toast.innerHTML =
      '<div class="toast-icon">' + (opts.type === "up" ? "↑" : "↓") + '</div>' +
      '<div class="toast-body">' +
        '<div class="toast-title">' + opts.ticker + '</div>' +
        '<div class="toast-msg">' + opts.message + '</div>' +
      '</div>';
    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("exiting");
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3500);
  }

  /* ──────────────────────────── Keyboard Shortcuts ──────────────────────────── */

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    var key = e.key;
    if (key === "Escape") {
      if (state.modalTicker) window.closeChartModal();
      var help = document.getElementById("keyboard-help");
      if (!help.classList.contains("hidden")) help.classList.add("hidden");
      return;
    }
    if (key === "?") {
      window.toggleHelp();
      return;
    }
    var num = parseInt(key);
    if (num >= 1 && num <= 5 && state.tickerOrder.length >= num) {
      toggleSub(state.tickerOrder[num - 1]);
    }
  });

  window.toggleHelp = function () {
    var el = document.getElementById("keyboard-help");
    el.classList.toggle("hidden");
  };

  /* ──────────────────────────── Helpers ──────────────────────────── */

  function fmtPrice(n) {
    return Number(n).toFixed(2);
  }

  function fmtVolume(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /* ──────────────────────────── Logout ──────────────────────────── */

  window.logout = function () {
    localStorage.removeItem("stockpulse_email");
    localStorage.removeItem("stockpulse_subs");
    if (state.socket) state.socket.disconnect();
    window.location.href = "/";
  };

  /* ──────────────────────────── Start ──────────────────────────── */

  document.addEventListener("DOMContentLoaded", init);
})();
