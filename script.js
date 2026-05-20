/* =========================================================
   Meridian AI Trading Bot — live frontend simulation
   Два баланси: торговий (поповнення) + дохід (вивід / реінвест).
   ========================================================= */

// ---------- STATE ----------
const TRADING_SYMBOLS = {
  USD: "$",
  TON: "TON",
};
const TRADING_RATES   = { USD: 1, TON: 1 / 3.8 };
const TON_SYMBOL = TRADING_SYMBOLS.TON;

const state = {
  tradingCur: "TON",
  lang: "RU",
  trading:        100000.00, // working capital
  tradingStart:   100000.00, // for daily growth %
  income:          28420.00, // accumulated profit, withdrawable
  incomeStart:     26000.00,
  hidden: false,
  tradesCount: 142,
  positions: [
    { pair: "BTC/USDT", logo: "₿", color: "orange", side: "long",  qty: 0.42,  entry: 63520, mark: 64218, sl: 62000, tp: 66000 },
    { pair: "ETH/USDT", logo: "Ξ", color: "gray",   side: "long",  qty: 4.20,  entry: 3080,  mark: 3120,  sl: 2980,  tp: 3260  },
    { pair: "SOL/USDT", logo: "S", color: "blue",   side: "short", qty: 32,    entry: 148.2, mark: 145.6, sl: 152,   tp: 138   },
    { pair: "LINK/USDT",logo: "L", color: "green",  side: "long",  qty: 180,   entry: 14.20, mark: 14.62, sl: 13.5,  tp: 15.8  },
  ],
  trades: [],
  chart: { range: "1D", series: [], bench: [], labels: [] },
  filter: "ALL",
};

// ---------- HELPERS ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const fmt = (n, d = 2) =>
  Math.abs(n).toLocaleString("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d });

const pad = (n) => String(n).padStart(2, "0");
const timeNow = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const incomeCalcState = {
  rate: 1.3,
  balance: 100000,
};

function tradingConvert(usd) { return usd * TRADING_RATES[state.tradingCur]; }
function tradingSymbol() { return TRADING_SYMBOLS[state.tradingCur]; }
function tradingDecimals() { return state.tradingCur === "TON" ? 4 : 2; }

// ---------- BALANCE RENDER (two balances) ----------
function flash(el, dir) {
  if (!dir) return;
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth;
  el.classList.add(dir > 0 ? "flash-up" : "flash-down");
  setTimeout(() => el.classList.remove("flash-up", "flash-down"), 500);
}
function tickIndicator(el, dir) {
  if (!dir) return;
  el.textContent = dir > 0 ? "▲" : "▼";
  el.className = `tick show tick--${dir > 0 ? "up" : "down"}`;
  setTimeout(() => el.classList.remove("show"), 700);
}

function renderOneBalance(usd, valueEl, symbolEl, dir, convertFn, symbolFn, decimalsFn) {
  const v = convertFn(usd);
  const d = decimalsFn();
  const [int, dec] = fmt(v, d).split(",");
  symbolEl.innerHTML = symbolFn();
  if (state.hidden) {
    valueEl.innerHTML = "•••,•••<small>.••</small>";
  } else {
    valueEl.innerHTML = `${int}<small>.${dec || "00"}</small>`;
  }
  flash(valueEl, dir);
}

let prevTrading = state.trading;
let prevIncome  = state.income;
let incomeShown = state.income;
let incomeAnimFrame = null;

function setIncomeDisplay(value) {
  const el = $("#incomeValue");
  const [int, dec] = fmt(Math.max(0, value), 4).split(",");
  if (state.hidden) {
    el.innerHTML = "•••,•••<small>.••••</small>";
  } else {
    el.innerHTML = `${int}<small>.${dec || "0000"}</small>`;
  }
}

function animateIncomeTo(target) {
  const el = $("#incomeValue");
  if (!el) return;
  if (incomeAnimFrame) cancelAnimationFrame(incomeAnimFrame);

  const start = incomeShown;
  const delta = target - start;
  const duration = 750;
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const wobble = Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI) * 0.018;
    const current = start + delta * Math.max(0, Math.min(1, eased + wobble));
    incomeShown = current;
    setIncomeDisplay(current);
    if (progress < 1) {
      incomeAnimFrame = requestAnimationFrame(step);
    } else {
      incomeShown = target;
      setIncomeDisplay(target);
      incomeAnimFrame = null;
    }
  };

  incomeAnimFrame = requestAnimationFrame(step);
}

function updateBotPowerRate() {
  const rateEl = $("#botpowerRate");
  const stackEl = $("#botpowerStack");
  const copyEl = $("#botpowerCopy");
  const friendsValueEl = $("#botpowerFriendsValue");
  const friendsNoteEl = $("#botpowerFriendsNote");
  const friendsBarEl = $("#botpowerFriendsBar");
  const balanceValueEl = $("#botpowerBalanceValue");
  const balanceNoteEl = $("#botpowerBalanceNote");
  const balanceBarEl = $("#botpowerBalanceBar");
  if (!rateEl || !stackEl) return;
  const timelineEl = stackEl.querySelector(".botpower__timeline");
  const lineEl = timelineEl?.querySelector(".botpower__timeline-line");
  const activeDot = timelineEl?.querySelector(".botpower__timeline-dot.is-active");

  const rates = [1.1, 1.3, 1.5, 1.7, 2.0];
  const stageIndexRaw = Number(stackEl.dataset.stageIndex ?? 1);
  const stageIndex = Number.isFinite(stageIndexRaw)
    ? Math.max(0, Math.min(rates.length - 1, stageIndexRaw))
    : 1;
  const nextIndex = Math.min(stageIndex + 1, rates.length - 1);
  const currentLabel = `${rates[stageIndex].toFixed(1)}%`;
  const nextLabel = `${rates[nextIndex].toFixed(1)}%`;
  const friendsCurrent = Number(stackEl.dataset.friendsCurrent ?? 3);
  const friendsGoal = Number(stackEl.dataset.friendsGoal ?? 5);
  const balanceCurrent = Number(stackEl.dataset.balanceCurrent ?? 100000);
  const balanceGoal = Number(stackEl.dataset.balanceGoal ?? 150000);
  const friendsRemaining = Math.max(0, friendsGoal - friendsCurrent);
  const balanceRemaining = Math.max(0, balanceGoal - balanceCurrent);
  const compactMoney = (value) => {
    if (value >= 1000) return `$${fmt(value / 1000, 0)}K`;
    return `$${fmt(value, 0)}`;
  };

  rateEl.textContent = currentLabel;
  if (copyEl) {
    copyEl.textContent = friendsRemaining === 0 && balanceRemaining === 0
      ? `Ви вже на максимумі ${currentLabel}. Продовжуйте нарощувати баланс і залучати друзів.`
      : `Запрошуйте друзів і збільшуйте баланс, щоб піднімати свій дохід на день.`;
  }
  $$(".botpower__scale span").forEach((item, index) => {
    item.classList.toggle("is-active", index === stageIndex);
  });
  $$(".botpower__timeline-dot").forEach((item, index) => {
    item.classList.toggle("is-active", index === stageIndex);
  });
  if (friendsValueEl) friendsValueEl.textContent = `${friendsCurrent} / ${friendsGoal}`;
  if (friendsNoteEl) friendsNoteEl.textContent = friendsRemaining === 0 ? `Рівень досягнуто` : `Ще ${friendsRemaining} до ${nextLabel}`;
  if (friendsBarEl) friendsBarEl.style.width = `${Math.max(0, Math.min(100, (friendsCurrent / Math.max(1, friendsGoal)) * 100))}%`;
  if (balanceValueEl) balanceValueEl.textContent = `${compactMoney(balanceCurrent)} / ${compactMoney(balanceGoal)}`;
  if (balanceNoteEl) balanceNoteEl.textContent = balanceRemaining === 0 ? `Рівень досягнуто` : `Ще ${compactMoney(balanceRemaining)} до ${nextLabel}`;
  if (balanceBarEl) balanceBarEl.style.width = `${Math.max(0, Math.min(100, (balanceCurrent / Math.max(1, balanceGoal)) * 100))}%`;
  if (timelineEl && lineEl && activeDot) {
    const syncLine = () => {
      const dots = $$(".botpower__timeline-dot", timelineEl);
      const firstDot = dots[0];
      const lastDot = dots[dots.length - 1];
      if (!firstDot || !lastDot) return;
      const timelineRect = timelineEl.getBoundingClientRect();
      const firstDotRect = firstDot.getBoundingClientRect();
      const lastDotRect = lastDot.getBoundingClientRect();
      const dotRect = activeDot.getBoundingClientRect();
      const firstDotCenter = firstDotRect.left + firstDotRect.width / 2;
      const lastDotCenter = lastDotRect.left + lastDotRect.width / 2;
      const activeDotCenter = dotRect.left + dotRect.width / 2;
      lineEl.style.left = `${Math.max(0, firstDotCenter - timelineRect.left)}px`;
      lineEl.style.right = `${Math.max(0, timelineRect.right - lastDotCenter)}px`;
      const fillWidth = Math.max(0, activeDotCenter - firstDotCenter);
      lineEl.style.setProperty("--botpower-fill-width", `${fillWidth}px`);
    };
    requestAnimationFrame(syncLine);
  }
}

function formatCalcMoney(value) {
  return fmt(Math.max(0, Number(value) || 0), 2);
}

function updateIncomeCalculator() {
  const root = $("[data-income-calc]");
  if (!root) return;
  const balanceInput = $("#incomeCalcBalance");
  const rateLabel = $("#incomeCalcRateLabel");
  const balanceLabel = $("#incomeCalcBalanceLabel");
  const dayLabel = $("#incomeCalcDay");
  const weekLabel = $("#incomeCalcWeek");
  const monthLabel = $("#incomeCalcMonth");

  const rate = Number(root.dataset.rate ?? incomeCalcState.rate);
  const balance = Number(root.dataset.balance ?? incomeCalcState.balance);
  const day = (balance * rate) / 100;
  const week = day * 7;
  const month = day * 30;
  const min = Number(balanceInput?.min ?? 0);
  const max = Number(balanceInput?.max ?? 1);
  const fill = Math.max(0, Math.min(100, ((balance - min) / Math.max(1, max - min)) * 100));

  incomeCalcState.rate = rate;
  incomeCalcState.balance = balance;

  if (rateLabel) rateLabel.textContent = `${rate.toFixed(1)}%`;
  if (balanceLabel) balanceLabel.textContent = `${fmt(balance)} TON`;
  if (dayLabel) dayLabel.textContent = formatCalcMoney(day);
  if (weekLabel) weekLabel.textContent = formatCalcMoney(week);
  if (monthLabel) monthLabel.textContent = formatCalcMoney(month);
  if (balanceInput) balanceInput.style.setProperty("--income-calc-fill", `${fill}%`);

  $$(".income-calc__rate").forEach((btn) => {
    const active = Number(btn.dataset.incomeRate) === rate;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function setIncomeCalcRate(rate) {
  const root = $("[data-income-calc]");
  if (!root) return;
  root.dataset.rate = String(rate);
  updateIncomeCalculator();
}

function setIncomeCalcBalance(balance) {
  const root = $("[data-income-calc]");
  if (!root) return;
  root.dataset.balance = String(balance);
  updateIncomeCalculator();
}

function renderBalances(animate = false) {
  const tDir = animate ? Math.sign(state.trading - prevTrading) : 0;
  const iDir = animate ? Math.sign(state.income  - prevIncome)  : 0;

  renderOneBalance(
    state.trading,
    $("#tradingValue"),
    $("#tradingSymbol"),
    0,
    tradingConvert,
    tradingSymbol,
    tradingDecimals
  );
  $("#incomeSymbol").innerHTML = TON_SYMBOL;
  if (animate) {
    animateIncomeTo(state.income);
  } else {
    incomeShown = state.income;
    setIncomeDisplay(state.income);
  }

  if (iDir) tickIndicator($("#incomeTick"),  iDir);

  // Trading growth %
  const tGrowth = ((state.trading - state.tradingStart) / state.tradingStart) * 100;
  const tUp = tGrowth >= 0;
  const tEl = $("#tradingGrowth");
  if (tEl) {
    tEl.textContent = `${tUp ? "+" : "−"}${fmt(Math.abs(tGrowth))}%`;
    tEl.className = `trend trend--${tUp ? "up" : "down"}`;
  }

  // Income today $
  const iDelta = state.income - state.incomeStart;
  const iUp = iDelta >= 0;
  const iEl = $("#incomeToday");
  if (iEl) {
    iEl.textContent = `${iUp ? "+" : "−"}$${fmt(Math.abs(iDelta))}`;
    iEl.className = `trend trend--${iUp ? "up" : "down"}`;
  }

  // Project capital KPI
  const kPnl = $("#kpiPnl");
  if (kPnl) {
    kPnl.innerHTML = `${fmt(state.trading + state.income)}<span class="ton-inline">${TON_SYMBOL}</span>`;
    kPnl.style.color = "var(--ink)";
  }

  const baxterPoolTotal = $("#baxterPoolTotal");
  const baxterPoolDelta = $("#baxterPoolDelta");
  const baxterPoolPulse = $("#baxterPoolPulse");
  if (baxterPoolTotal) {
    const pool = state.trading + state.income;
    const prevPool = prevTrading + prevIncome;
    const delta = pool - prevPool;
    baxterPoolTotal.textContent = `${fmt(pool)} ${TON_SYMBOL}`;
    if (baxterPoolDelta) {
      baxterPoolDelta.textContent = `${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} ${TON_SYMBOL}`;
      baxterPoolDelta.classList.toggle("is-down", delta < 0);
    }
    if (baxterPoolPulse) {
      const bars = Array.from(baxterPoolPulse.children);
      const recent = state.trades.slice(0, bars.length);
      bars.forEach((bar, i) => {
        const trade = recent[i];
        const strength = trade ? Math.min(1, Math.abs(trade.pnl) / 80) : 0.22;
        const jitter = ((Date.now() / 240) + i) % 1;
        const height = Math.max(18, Math.min(100, (strength * 70 + jitter * 22)));
        bar.style.height = `${height}%`;
      });
    }
  }

  updateBotPowerRate();

  prevTrading = state.trading;
  prevIncome  = state.income;
}

function syncTradingButtons() {
  $$("[data-trading-cur]").forEach((x) => {
    x.classList.toggle("trading-switch__btn--active", x.dataset.tradingCur === state.tradingCur);
  });
}

function syncLanguageButtons() {
  $$("[data-lang]").forEach((x) => {
    x.classList.toggle("trading-switch__btn--active", x.dataset.lang === state.lang);
  });
}

$$("[data-trading-cur]").forEach((b) =>
  b.addEventListener("click", () => {
    state.tradingCur = b.dataset.tradingCur;
    syncTradingButtons();
    renderBalances();
  })
);

$$("[data-lang]").forEach((b) =>
  b.addEventListener("click", () => {
    state.lang = b.dataset.lang;
    syncLanguageButtons();
  })
);

// ---------- POSITIONS ----------
function pnlOf(p) {
  const diff = p.side === "long" ? (p.mark - p.entry) : (p.entry - p.mark);
  const pnl = diff * p.qty;
  const pct = (diff / p.entry) * 100;
  return { pnl, pct };
}
function renderPositions() {
  const list = $("#positionsList");
  if (!list) return;
  list.innerHTML = state.positions.map((p, i) => {
    const { pnl, pct } = pnlOf(p);
    const up = pnl >= 0;
    const range = p.side === "long" ? (p.tp - p.sl) : (p.sl - p.tp);
    const pos = p.side === "long" ? (p.mark - p.sl) : (p.sl - p.mark);
    const progress = Math.max(2, Math.min(98, (pos / range) * 100));
    const color = up ? "var(--green-d)" : "var(--red)";
    return `
      <li class="position" data-i="${i}">
        <div class="position__head">
          <div class="position__pair">
            <div class="position__logo position__logo--${p.color}">${p.logo}</div>
            <div>
              <div class="position__name">
                ${p.pair}
                <span class="position__side position__side--${p.side}">${p.side === "long" ? "LONG" : "SHORT"}</span>
              </div>
              <div style="font-size:11px;color:var(--muted);">Qty ${p.qty}</div>
            </div>
          </div>
          <div class="position__pnl position__pnl--${up ? "up" : "down"}">
            ${up ? "+" : "−"}$${fmt(Math.abs(pnl))}<br>
            <span style="font-size:11px;font-weight:500;">${up ? "+" : "−"}${fmt(Math.abs(pct))}%</span>
          </div>
        </div>
        <div class="position__meta">
          <div><span>Entry</span><b>$${fmt(p.entry, p.entry < 100 ? 2 : 0)}</b></div>
          <div><span>Mark</span><b>$${fmt(p.mark, p.mark < 100 ? 2 : 0)}</b></div>
          <div><span>SL / TP</span><b>${fmt(p.sl, p.sl < 100 ? 2 : 0)} / ${fmt(p.tp, p.tp < 100 ? 2 : 0)}</b></div>
        </div>
        <div class="position__bar"><i style="width:${progress}%;background:${color}"></i></div>
      </li>
    `;
  }).join("");
}

// ---------- TRADES LOG ----------
const TRADE_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "LINK/USDT", "ARB/USDT", "AVAX/USDT"];
const PRICE_REF   = { "BTC/USDT": 64000, "ETH/USDT": 3120, "SOL/USDT": 146, "LINK/USDT": 14.6, "ARB/USDT": 1.18, "AVAX/USDT": 36.4 };

function seedTrades() {
  for (let i = 0; i < 8; i++) state.trades.push(makeTrade(i * 30));
}
function makeTrade(secAgo = 0) {
  const pair  = TRADE_PAIRS[Math.floor(Math.random() * TRADE_PAIRS.length)];
  const side  = Math.random() > 0.5 ? "BUY" : "SELL";
  const price = PRICE_REF[pair] * (1 + (Math.random() - 0.5) * 0.01);
  const qty   = +(Math.random() * (PRICE_REF[pair] > 1000 ? 0.2 : PRICE_REF[pair] > 100 ? 4 : 80)).toFixed(3);
  const pnl   = (Math.random() - 0.42) * 80;
  return { pair, side, price, qty, pnl, fresh: false };
}

function renderTrades() {
  const body = $("#tradesBody");
  const filtered = state.trades.filter(
    (t) => state.filter === "ALL" || t.side === state.filter
  ).slice(0, 3);
  if (body) {
    body.innerHTML = filtered.map((t) => {
      const up = t.pnl >= 0;
      const priceDigits = t.price < 10 ? 4 : t.price < 1000 ? 2 : 1;
      const pairShort = `${t.pair.split("/")[0].slice(0, 3)}/USD`;
      return `
        <tr class="${t.fresh ? "flash trade-enter" : ""}">
          <td class="trade__pair">${pairShort}</td>
          <td><span class="trade__side trade__side--${t.side.toLowerCase()}">${t.side}</span></td>
          <td>$${fmt(t.price, priceDigits)}</td>
          <td class="t-right ${up ? "pnl--up" : "pnl--down"}">${up ? "+" : "−"}${fmt(Math.abs(t.pnl))}<span class="trade__currency">${TON_SYMBOL}</span></td>
        </tr>
      `;
    }).join("");
  }

  const baxterTradesList = $("#baxterTradesList");
  if (baxterTradesList) {
    baxterTradesList.innerHTML = filtered.map((t) => {
      const up = t.pnl >= 0;
      const priceDigits = t.price < 10 ? 4 : t.price < 1000 ? 2 : 1;
      const pairShort = `${t.pair.split("/")[0].slice(0, 3)}/USD`;
      return `
        <li class="baxter-card__tx-item">
          <span class="baxter-card__tx-pair">${pairShort}</span>
          <span class="trade__side trade__side--${t.side.toLowerCase()} baxter-card__tx-side">${t.side}</span>
          <span class="baxter-card__tx-price">$${fmt(t.price, priceDigits)}</span>
          <span class="baxter-card__tx-pnl ${up ? "pnl--up" : "pnl--down"}">${up ? "+" : "−"}${fmt(Math.abs(t.pnl))}${TON_SYMBOL}</span>
        </li>
      `;
    }).join("");
  }

  state.trades.forEach((t) => (t.fresh = false));
}

$$(".filter__btn").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".filter__btn").forEach((x) => x.classList.remove("filter__btn--active"));
    b.classList.add("filter__btn--active");
    state.filter = b.dataset.filter;
    renderTrades();
  })
);

// ---------- CHART ----------
const CHART_W = 800;
const CHART_H = 280;
const CHART_PAD = { l: 48, r: 14, t: 16, b: 28 };
const RANGE_POINTS = { "1H": 60, "1D": 96, "1W": 84, "1M": 60, "ALL": 48 };

function genWalk(n, base, vol, drift = 0.0008) {
  const out = []; let v = base;
  for (let i = 0; i < n; i++) {
    v += (Math.random() - 0.5) * vol + base * drift;
    out.push(v);
  }
  return out;
}
function genLabels(range, n) {
  if (range === "1H") return Array.from({ length: n }, (_, i) => i % 10 === 0 ? `${i}m` : "");
  if (range === "1D") return Array.from({ length: n }, (_, i) => i % 12 === 0 ? `${pad(Math.floor(i / 4))}:00` : "");
  if (range === "1W") return Array.from({ length: n }, (_, i) => i % 12 === 0 ? ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"][Math.floor(i/12)] : "");
  if (range === "1M") return Array.from({ length: n }, (_, i) => i % 10 === 0 ? `Т${Math.floor(i/15)+1}` : "");
  return ["2022","","","2023","","","2024","","","2025","","","2026"].slice(0, n);
}

function buildChart() {
  if (!$("#chart")) return;
  const n = RANGE_POINTS[state.chart.range];
  const total = state.trading + state.income;
  state.chart.series = genWalk(n, total - 4000, 350, 0.00012);
  const last = state.chart.series[n - 1];
  const offset = total - last;
  state.chart.series = state.chart.series.map((v, i) => v + offset * (i / (n - 1)));
  state.chart.bench  = genWalk(n, total - 5000, 320, 0.00006);
  state.chart.labels = genLabels(state.chart.range, n);
  drawChart();
}

function drawChart() {
  const chartRoot = $("#chart");
  if (!chartRoot) return;
  const P = state.chart.series;
  const B = state.chart.bench;
  const L = state.chart.labels;
  const all = [...P, ...B];
  const min = Math.min(...all) * 0.997;
  const max = Math.max(...all) * 1.003;

  const innerW = CHART_W - CHART_PAD.l - CHART_PAD.r;
  const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
  const xAt = (i, len) => CHART_PAD.l + (innerW * i) / (len - 1);
  const yAt = (v) => CHART_PAD.t + innerH - ((v - min) / (max - min)) * innerH;
  const path = (a) => a.map((v, i) => `${i ? "L" : "M"}${xAt(i, a.length).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");

  const linePath  = path(P);
  const benchPath = path(B);
  const areaPath  = `${linePath} L${xAt(P.length-1, P.length)} ${CHART_PAD.t+innerH} L${xAt(0, P.length)} ${CHART_PAD.t+innerH} Z`;

  const grid = []; const yAxis = [];
  for (let i = 0; i <= 4; i++) {
    const y = CHART_PAD.t + (innerH * i) / 4;
    const v = max - ((max - min) * i) / 4;
    grid.push(`<line x1="${CHART_PAD.l}" x2="${CHART_W-CHART_PAD.r}" y1="${y}" y2="${y}"/>`);
    yAxis.push(`<text x="${CHART_PAD.l - 8}" y="${y + 3}" text-anchor="end">$${(v/1000).toFixed(1)}K</text>`);
  }
  const xAxis = L.map((l, i) => l ? `<text x="${xAt(i,L.length)}" y="${CHART_H-10}" text-anchor="middle">${l}</text>` : "").join("");

  const lastX = xAt(P.length - 1, P.length);
  const lastY = yAt(P[P.length - 1]);

  chartRoot.innerHTML = `
    <svg viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0e0f0c" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#0e0f0c" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g class="chart__grid">${grid.join("")}</g>
      <g class="chart__axis">${yAxis.join("")}${xAxis}</g>
      <path class="chart__area" d="${areaPath}"/>
      <path class="chart__line chart__line--bench" d="${benchPath}"/>
      <path class="chart__line" d="${linePath}"/>
      <g class="chart__last"><circle cx="${lastX}" cy="${lastY}" r="4"/></g>
      <g class="chart__cursor" style="display:none">
        <line y1="${CHART_PAD.t}" y2="${CHART_PAD.t+innerH}"/>
        <circle r="4"/>
      </g>
    </svg>
    <div class="chart__tip"></div>
  `;

  const svg = $("#chart svg");
  const cursor = $("#chart .chart__cursor");
  const cLine = cursor.querySelector("line");
  const cDot  = cursor.querySelector("circle");
  const tip   = $("#chart .chart__tip");
  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const idx = Math.round(((px - CHART_PAD.l) / innerW) * (P.length - 1));
    if (idx < 0 || idx >= P.length) return;
    const x = xAt(idx, P.length); const y = yAt(P[idx]);
    cursor.style.display = "";
    cLine.setAttribute("x1", x); cLine.setAttribute("x2", x);
    cDot.setAttribute("cx", x);  cDot.setAttribute("cy", y);
    tip.style.display = "block";
    tip.style.left = `${(x / CHART_W) * 100}%`;
    tip.style.top  = `${(y / CHART_H) * 100}%`;
    tip.innerHTML = `<b>$${fmt(P[idx], 0)}</b><span>${L[idx] || `T${idx}`}</span>`;
  });
  svg.addEventListener("mouseleave", () => {
    cursor.style.display = "none";
    tip.style.display = "none";
  });
}

$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.remove("tab--active"));
    t.classList.add("tab--active");
    state.chart.range = t.dataset.range;
    buildChart();
  })
);

// ---------- LIVE TICK ----------
function tick() {
  // Move mark prices
  state.positions.forEach((p) => {
    const vol = p.entry * 0.001;
    p.mark = +(p.mark + (Math.random() - 0.48) * vol).toFixed(p.entry < 100 ? 2 : 1);
  });

  // Sometimes execute trade
  if (Math.random() < 0.8) {
    const t = makeTrade(0);
    t.fresh = true;
    state.trades.unshift(t);
    if (state.trades.length > 20) state.trades.pop();
    state.tradesCount++;
    renderTrades();

    // Income only grows when the latest trade is positive.
    if (t.pnl >= 0) {
      const iDrift = +(0.05 + Math.random() * 17.95).toFixed(2);
      state.income = +(state.income + iDrift).toFixed(2);
    }
  }

  // Update chart with total after the trade/income step.
  const total = state.trading + state.income;
  state.chart.series.shift();
  state.chart.series.push(total);
  state.chart.bench.shift();
  state.chart.bench.push(state.chart.bench[state.chart.bench.length - 1] + (Math.random() - 0.5) * 80);
  if ($("#chart")) drawChart();

  renderPositions();
  renderBalances(true);
  const chartLast = $("#chartLast");
  if (chartLast) chartLast.textContent = `Останній тік: ${timeNow()}`;
}

// ---------- WALLET BUTTON ----------
$("#connectWalletBtn").addEventListener("click", () => {
  const btn = $("#connectWalletBtn");
  btn.textContent = "Підключення…";
  btn.classList.remove("btn--primary");
  btn.classList.remove("btn--ghost");
  btn.classList.remove("btn--connected");
  setTimeout(() => {
    btn.textContent = "Гаманець підключено";
    btn.classList.add("btn--connected");
  }, 900);
});

$("#settingsBtn").addEventListener("click", () => openSettingsModal());
$("#botInfoBtn").addEventListener("click", () => openModal("botInfo"));

// ============================================================
// MODAL: deposit / withdraw / reinvest
// ============================================================
const MODAL_CONFIG = {
  botInfo: {
    title: "Про бота",
    sub:   "Інформація та тарифи",
    confirmText: "Зрозуміло",
    fromValue: () => null,
    max: () => null,
    summary: () => [],
    apply: null,
  },
  deposit: {
    title: "Поповнити торговий баланс",
    sub:   "Кошти одразу включаються в роботу бота",
    fromLabel: null,                          // нема обмеження зверху
    fromValue: () => null,
    max: () => null,
    confirmText: "Поповнити",
    summary: (amt) => [
      ["Поточний торговий", `$${fmt(state.trading)}`],
      ["Сума поповнення",   `+$${fmt(amt)}`],
      ["Стане",              `$${fmt(state.trading + amt)}`],
    ],
    apply: (amt) => {
      state.trading = +(state.trading + amt).toFixed(2);
      toast(`Торговий баланс поповнено на $${fmt(amt)}`, "ok");
    },
  },
  withdrawTrading: {
    title: "Вивести з торгового балансу",
    sub:   "На підключений гаманець, ~30 секунд",
    fromLabel: "Доступний торговий",
    fromValue: () => state.trading,
    max: () => state.trading,
    confirmText: "Вивести",
    summary: (amt) => [
      ["Поточний торговий", `$${fmt(state.trading)}`],
      ["До виводу",         `−$${fmt(amt)}`],
      ["Залишок",           `$${fmt(state.trading - amt)}`],
    ],
    apply: (amt) => {
      state.trading = +(state.trading - amt).toFixed(2);
      toast(`Виведено $${fmt(amt)} з торгового балансу`, "ok");
    },
  },
  withdraw: {
    title: "Вивести дохід",
    sub:   "На підключений гаманець, ~30 секунд",
    fromLabel: "Доступний дохід",
    fromValue: () => state.income,
    max: () => state.income,
    confirmText: "Вивести",
    summary: (amt) => [
      ["Поточний дохід", `$${fmt(state.income)}`],
      ["До виводу",       `−$${fmt(amt)}`],
      ["Залишок доходу",  `$${fmt(state.income - amt)}`],
    ],
    apply: (amt) => {
      state.income = +(state.income - amt).toFixed(2);
      toast(`Виведено $${fmt(amt)} на гаманець`, "ok");
    },
  },
  reinvest: {
    title: "Реінвестувати дохід",
    sub:   "Перевести з доходу в торговий баланс",
    fromLabel: "Доступний дохід",
    fromValue: () => state.income,
    max: () => state.income,
    confirmText: "Реінвестувати",
    summary: (amt) => [
      ["Дохід",            `$${fmt(state.income)} → $${fmt(state.income - amt)}`],
      ["Торговий баланс",  `$${fmt(state.trading)} → $${fmt(state.trading + amt)}`],
      ["Сума",             `$${fmt(amt)}`],
    ],
    apply: (amt) => {
      state.income  = +(state.income  - amt).toFixed(2);
      state.trading = +(state.trading + amt).toFixed(2);
      toast(`Реінвестовано $${fmt(amt)} в торговий баланс`, "ok");
    },
  },
};

let activeModal = null;

function openModal(kind) {
  const cfg = MODAL_CONFIG[kind];
  if (!cfg) return;
  activeModal = kind;

  $("#modalTitle").textContent = cfg.title;
  const modalSub = $("#modalSub");
  if (modalSub) modalSub.textContent = cfg.sub;
  $("#modalConfirm").textContent = cfg.confirmText;

  const modalCard = $("#modal .modal__card");
  const fromBlock = $("#modalFromBlock");
  const modalInfo = $("#modalInfo");
  const field = $("#modalAmount").closest(".field");
  const maxBtn    = $("#modalMax");
  const quick     = $("#modalQuick");
  const fromVal   = cfg.fromValue();
  const infoMode  = kind === "botInfo";

  modalCard.classList.toggle("modal__card--info", infoMode);
  modalInfo.hidden = !infoMode;
  modalInfo.setAttribute("aria-hidden", String(!infoMode));
  field.hidden = infoMode;

  if (fromVal != null && !infoMode) {
    fromBlock.hidden = false;
    $("#modalFromLabel").textContent = cfg.fromLabel + ":";
    $("#modalFromVal").textContent   = `$${fmt(fromVal)}`;
    maxBtn.hidden = false;
    quick.hidden = false;
  } else {
    fromBlock.hidden = true;
    maxBtn.hidden = true;
    quick.hidden = true;
  }

  $("#modalAmount").value = "";
  $("#modalSummary").hidden = true;
  $("#modalSummary").innerHTML = "";

  $("#modal").hidden = false;
  setTimeout(() => {
    if (infoMode) {
      $("#modal .modal__close").focus();
    } else {
      $("#modalAmount").focus();
    }
  }, 50);
}

function closeModal() {
  $("#modal").hidden = true;
  $("#modalInfo").hidden = true;
  $("#modal .modal__card").classList.remove("modal__card--info");
  activeModal = null;
}

function openSettingsModal() {
  syncTradingButtons();
  syncLanguageButtons();
  const modal = $("#settingsModal");
  clearTimeout(modal._closeTimer);
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
  setTimeout(() => $("#settingsModal .modal__close").focus(), 50);
}

function closeSettingsModal() {
  const modal = $("#settingsModal");
  modal.classList.remove("is-open");
  clearTimeout(modal._closeTimer);
  modal._closeTimer = setTimeout(() => {
    modal.hidden = true;
  }, 240);
}

function refreshSummary() {
  if (!activeModal) return;
  const cfg = MODAL_CONFIG[activeModal];
  const amt = parseFloat($("#modalAmount").value);
  const sum = $("#modalSummary");
  if (!isFinite(amt) || amt <= 0) {
    sum.hidden = true; sum.innerHTML = "";
    return;
  }
  sum.hidden = false;
  sum.innerHTML = cfg.summary(amt).map(([k, v]) =>
    `<div class="row"><span>${k}</span><b>${v}</b></div>`
  ).join("");
}

$$("[data-action]").forEach((b) =>
  b.addEventListener("click", () => openModal(b.dataset.action))
);
$$("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeModal) closeModal();
});

$("#modalAmount").addEventListener("input", refreshSummary);

$("#modalMax").addEventListener("click", () => {
  const cfg = MODAL_CONFIG[activeModal];
  const m = cfg.max();
  if (m != null) { $("#modalAmount").value = m.toFixed(2); refreshSummary(); }
});

$$("#modalQuick button").forEach((b) =>
  b.addEventListener("click", () => {
    const cfg = MODAL_CONFIG[activeModal];
    const m = cfg.max();
    if (m != null) {
      $("#modalAmount").value = (m * parseFloat(b.dataset.q)).toFixed(2);
      refreshSummary();
    }
  })
);

$("#modalConfirm").addEventListener("click", () => {
  const cfg = MODAL_CONFIG[activeModal];
  if (!cfg || !cfg.apply) { closeModal(); return; }
  const amt = parseFloat($("#modalAmount").value);
  if (!isFinite(amt) || amt <= 0) { toast("Введіть коректну суму", "error"); return; }
  const m = cfg.max();
  if (m != null && amt > m + 1e-6) { toast(`Максимум: $${fmt(m)}`, "error"); return; }
  cfg.apply(amt);
  if (activeModal === "deposit")  state.tradingStart = state.trading - (state.trading - state.tradingStart); // keep growth ref relative
  closeModal();
  renderBalances(true);
});

$$("[data-settings-close]").forEach((el) => el.addEventListener("click", closeSettingsModal));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#settingsModal").hidden) closeSettingsModal();
});

const bottomNavButtons = $$("[data-bottom-action]");
const bottomNavTargets = {
  overview: "#homeSection",
};
const viewTransitionMs = 860;
let activePage = "overview";
let viewTransitionTimer = null;

function clearViewTransitionClasses() {
  document.body.classList.remove(
    "view-transitioning",
    "view-transition-forward",
    "view-transition-back",
    "view-transition-side"
  );
  $$("[data-page]").forEach((view) => {
    view.classList.remove(
      "is-view-entering",
      "is-view-leaving",
      "is-view-forward",
      "is-view-back",
      "is-view-side"
    );
  });
}

function transitionDirection(fromPage, toPage) {
  if (toPage === "overview") return "back";
  if (fromPage === "overview") return "forward";
  return "side";
}

function viewHeroHeight(view) {
  const wasHidden = view.hidden;
  const previousVisibility = view.style.visibility;
  const previousPosition = view.style.position;
  const previousPointerEvents = view.style.pointerEvents;

  if (wasHidden) {
    view.style.visibility = "hidden";
    view.style.position = "absolute";
    view.style.pointerEvents = "none";
    view.hidden = false;
  }

  const hero = $(".friends-hero, .history-hero, .ambassador-hero", view);
  const height = hero ? Math.round(hero.getBoundingClientRect().height) : 0;

  if (wasHidden) {
    view.hidden = true;
    view.style.visibility = previousVisibility;
    view.style.position = previousPosition;
    view.style.pointerEvents = previousPointerEvents;
  }

  return height;
}

function showPage(page, options = {}) {
  const { animate = true } = options;
  const views = $$("[data-page]");
  const nextView = views.find((view) => view.dataset.page === page);
  const currentView = views.find((view) => !view.hidden && view.dataset.page === activePage)
    || views.find((view) => !view.hidden);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (!nextView) return;
  if (viewTransitionTimer) {
    clearTimeout(viewTransitionTimer);
    viewTransitionTimer = null;
  }

  if (!animate || reduceMotion || !currentView || currentView === nextView) {
    clearViewTransitionClasses();
    document.body.classList.toggle("page-detail", page !== "overview");
    views.forEach((view) => {
      view.hidden = view !== nextView;
    });
    activePage = page;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    syncHeaderStackHeight();
    return;
  }

  const direction = transitionDirection(activePage, page);
  if (direction === "side") {
    const fromHeight = viewHeroHeight(currentView);
    const toHeight = viewHeroHeight(nextView);
    document.documentElement.style.setProperty("--detail-hero-from-height", `${fromHeight}px`);
    document.documentElement.style.setProperty("--detail-hero-to-height", `${toHeight}px`);
    const safeToHeight = Math.max(1, toHeight);
    const heroScaleFrom = Math.max(0.02, fromHeight / safeToHeight);
    document.documentElement.style.setProperty("--detail-hero-scale-from", `${heroScaleFrom}`);
  }
  clearViewTransitionClasses();
  document.body.classList.toggle("page-detail", page !== "overview");
  document.body.classList.add("view-transitioning", `view-transition-${direction}`);

  views.forEach((view) => {
    if (view !== currentView && view !== nextView) view.hidden = true;
  });
  currentView.hidden = false;
  nextView.hidden = false;
  currentView.classList.add("is-view-leaving", `is-view-${direction}`);
  nextView.classList.add("is-view-entering", `is-view-${direction}`);
  activePage = page;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  syncHeaderStackHeight();

  viewTransitionTimer = setTimeout(() => {
    views.forEach((view) => {
      view.hidden = view !== nextView;
    });
    clearViewTransitionClasses();
    viewTransitionTimer = null;
    syncHeaderStackHeight();
  }, viewTransitionMs);
}

function scrollToTarget(selector) {
  const target = document.querySelector(selector);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

const setBottomNavActive = (action) => {
  bottomNavButtons.forEach((btn) => {
    const isActive = btn.dataset.bottomAction === action;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
};

bottomNavButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.bottomAction;
    if (action === "bonus") {
      openBonusModal();
      return;
    }
    setBottomNavActive(action);
    if (action === "friends") {
      showPage("friends");
      return;
    }
    if (action === "history") {
      showPage("history");
      return;
    }
    if (action === "ambassador") {
      showPage("ambassador");
      return;
    }
    showPage("overview");
    if (action === "overview") return;
    const target = bottomNavTargets[action];
    if (target && scrollToTarget(target)) {
      return;
    }
  });
});

function openBonusModal() {
  const modal = $("#bonusModal");
  if (!modal) return;
  modal.hidden = false;
  setTimeout(() => $("#bonusCodeInput")?.focus(), 50);
}

function closeBonusModal() {
  const modal = $("#bonusModal");
  if (!modal) return;
  modal.hidden = true;
}

$$("[data-bonus-close]").forEach((el) => el.addEventListener("click", closeBonusModal));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#bonusModal")?.hidden) closeBonusModal();
});

$("#copyReferralBtn")?.addEventListener("click", async () => {
  const link = $("#referralLink")?.textContent?.trim();
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    toast("Реферальну силку скопійовано", "ok");
  } catch {
    toast(link, "ok");
  }
});

$("#copyAmbassadorIdBtn")?.addEventListener("click", async () => {
  const id = $("#ambassadorId")?.textContent?.trim();
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    toast("ID амбасадора скопійовано", "ok");
  } catch {
    toast(id, "ok");
  }
});

$("#ambassadorForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const channel = $("#ambassadorChannel")?.value?.trim();
  const description = $("#ambassadorDescription")?.value?.trim();
  const id = $("#ambassadorId")?.textContent?.trim();

  if (!channel || !description) {
    toast("Заповніть канал і опис", "error");
    return;
  }
  if (id && !description.includes(id)) {
    toast(`Додайте ${id} в опис каналу`, "error");
    return;
  }

  toast("Заявку амбасадора відправлено", "ok");
});

const historyFilterLabels = {
  all: "Показано всі операції",
  deposit: "Показано депозити",
  income: "Показано дохід",
  withdraw: "Показано виводи",
};

function applyHistoryFilter(filter) {
  const rows = $$(".history-row");
  let visibleCount = 0;
  rows.forEach((row) => {
    const visible = filter === "all" || row.dataset.historyType === filter;
    row.hidden = !visible;
    if (visible) visibleCount++;
  });
  $$("[data-history-group]").forEach((group) => {
    group.hidden = !$(".history-row:not([hidden])", group);
  });
  $$(".history-filter").forEach((btn) => {
    const active = btn.dataset.historyFilter === filter;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  const countEl = $("#historyVisibleCount");
  const noteEl = $("#historyFilterNote");
  if (countEl) countEl.textContent = String(visibleCount);
  if (noteEl) noteEl.textContent = historyFilterLabels[filter] || historyFilterLabels.all;
}

$$(".history-filter").forEach((btn) => {
  btn.addEventListener("click", () => applyHistoryFilter(btn.dataset.historyFilter || "all"));
});

setBottomNavActive("overview");
showPage("overview", { animate: false });
applyHistoryFilter("all");

// ---------- TOAST ----------
let toastTimer;
function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${kind ? "toast--" + kind : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- TELEGRAM MINI APP ----------
const tg = window.Telegram?.WebApp || null;

function setCssVar(name, value) {
  document.documentElement.style.setProperty(name, `${Math.max(0, Math.round(Number(value) || 0))}px`);
}

function syncTelegramInsets() {
  if (!tg) return;
  const safe = tg.safeAreaInset || {};
  const content = tg.contentSafeAreaInset || {};

  setCssVar("--tg-safe-area-inset-top", safe.top);
  setCssVar("--tg-safe-area-inset-right", safe.right);
  setCssVar("--tg-safe-area-inset-bottom", safe.bottom);
  setCssVar("--tg-safe-area-inset-left", safe.left);

  setCssVar("--tg-content-safe-area-inset-top", content.top);
  setCssVar("--tg-content-safe-area-inset-right", content.right);
  setCssVar("--tg-content-safe-area-inset-bottom", content.bottom);
  setCssVar("--tg-content-safe-area-inset-left", content.left);

  const headerTop = Math.max(Number(safe.top) || 0, Number(content.top) || 0);
  document.documentElement.style.setProperty("--tg-header-offset-top", `${Math.max(0, Math.round(headerTop))}px`);
}

function initTelegramMiniApp() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
  tg.enableClosingConfirmation?.();
  tg.setHeaderColor?.("#ffffff");
  tg.setBackgroundColor?.("#ffffff");
  syncTelegramInsets();
  tg.onEvent?.("safeAreaChanged", syncTelegramInsets);
  tg.onEvent?.("contentSafeAreaChanged", syncTelegramInsets);
  tg.onEvent?.("viewportChanged", syncTelegramInsets);
  tg.onEvent?.("fullscreenChanged", syncTelegramInsets);
  document.body.classList.add("tg-miniapp");
}

function syncHeaderStackHeight() {
  const app = $(".app");
  const header = $(".header-shell");
  if (!app || !header) return;
  if (document.body.classList.contains("page-detail")) return;
  app.style.setProperty("--header-stack-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
}

window.addEventListener("beforeunload", (e) => {
  e.preventDefault();
  e.returnValue = "";
  return "";
});

// ---------- INIT ----------
initTelegramMiniApp();
syncHeaderStackHeight();
if ("ResizeObserver" in window) {
  const header = $(".header-shell");
  if (header) {
    const headerObserver = new ResizeObserver(() => syncHeaderStackHeight());
    headerObserver.observe(header);
  }
  window.addEventListener("load", syncHeaderStackHeight, { once: true });
}
window.addEventListener("resize", syncHeaderStackHeight);
window.addEventListener("resize", updateBotPowerRate);
seedTrades();
renderBalances();
renderTrades();
renderPositions();
buildChart();
updateIncomeCalculator();
setInterval(tick, 1000);

$$(".income-calc__rate").forEach((btn) =>
  btn.addEventListener("click", () => setIncomeCalcRate(Number(btn.dataset.incomeRate)))
);

$("#incomeCalcBalance")?.addEventListener("input", (e) => {
  setIncomeCalcBalance(Number(e.target.value));
});

$("#bonusCodeForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#bonusCodeInput");
  const code = input?.value.trim();
  if (!code) {
    toast("Введіть бонус-код", "error");
    input?.focus();
    return;
  }
  toast(`Бонус-код ${code.toUpperCase()} активовано`, "ok");
  input.value = "";
  closeBonusModal();
});
