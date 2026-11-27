/* Trang chủ: không khí lúc này */
renderShell("now");

const HEADLINES = [[15, "Trời trong", "cứ thoải mái ra ngoài"], [25, "Khá ổn", "phù hợp để ra ngoài"], [35, "Hơi mờ bụi", "ra ngoài có chừng mực"],
                   [50, "Bụi dày", "nên đeo khẩu trang"], [75, "Ô nhiễm", "hạn chế ra ngoài"], [1e9, "Ô nhiễm nặng", "nên ở trong nhà"]];

// Đường cong mượt qua các điểm (Catmull-Rom → Bézier)
function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function renderSpark(d) {
  const fut = futureHours(d).slice(0, 24), vals = fut.map(x => x.v);
  const lo = Math.min(...vals), hi = Math.max(...vals), n = vals.length;
  const pts = vals.map((v, i) => [i / (n - 1) * 200, 90 - (v - lo) / Math.max(hi - lo, 1) * 75]);
  const stops = vals.map((v, i) => `<stop offset="${i / (n - 1)}" stop-color="${pmColor(v)}"/>`).join("");
  const avg6 = vals.slice(1, 7).reduce((a, b) => a + b, 0) / 6;
  const ch = Math.round(100 * (avg6 / vals[0] - 1));
  const lv = HEADLINES.find(h => vals[0] <= h[0]);
  $("spark").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span class="pill">${ch >= 0 ? "↑" : "↓"} ${Math.abs(ch)}% trong 6 giờ</span>
      <span class="small">${fut[0].h}h → ${fut[n - 1].h}h</span></div>
    <div style="position:relative">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-label="Diễn biến PM2.5 24 giờ tới">
        <defs><linearGradient id="sg" x1="0" x2="1">${stops}</linearGradient></defs>
        <path d="${smoothPath(pts)}" fill="none" stroke="url(#sg)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      </svg>
      <span style="position:absolute;left:0;top:${pts[0][1] * 1.1}px;width:10px;height:10px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 12px 4px rgba(143,216,255,.6)"></span>
      <span class="pill" style="position:absolute;left:14px;top:${Math.max(4, pts[0][1] * 1.1 - 36)}px;background:var(--text);color:#0a2342">Bây giờ: ${lv[1]}</span>
    </div>
    <div class="small" style="display:flex;justify-content:space-between"><span>Thấp nhất ${Math.round(lo)}</span><span>Cao nhất ${Math.round(hi)}</span></div>`;
}

function renderWave(d) {
  const byDay = {};
  d.hourly.time.forEach((t, i) => { const v = d.hourly.pm2_5[i]; if (v != null) (byDay[t.slice(0, 10)] ||= []).push(v); });
  const days = Object.entries(byDay).slice(0, 5).map(([day, vs]) => ({day, v: vs.reduce((a, b) => a + b, 0) / vs.length}));
  const today = d.current.time.slice(0, 10);
  const lo = Math.min(...days.map(x => x.v)), hi = Math.max(...days.map(x => x.v));
  const pts = days.map((x, i) => [(i + .5) / days.length * 1000, 72 - (x.v - lo) / Math.max(hi - lo, 1) * 52]);
  const path = smoothPath([[0, pts[0][1] + 8], ...pts, [1000, pts[pts.length - 1][1] + 8]]);
  const ti = Math.max(0, days.findIndex(x => x.day === today));
  $("wave").innerHTML = `
    <div class="wave-days">${days.map((x, i) => `<span class="${i === ti ? "on" : ""}">${i === ti ? "Hôm nay" : fmtWeekday.format(new Date(x.day + "T12:00")).replace(/^\w/, c => c.toUpperCase())}</span>`).join("")}</div>
    <div style="position:relative">
      <svg viewBox="0 0 1000 90" preserveAspectRatio="none" aria-label="PM2.5 trung bình 5 ngày tới">
        <path d="${path}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        <line x1="${pts[ti][0]}" x2="${pts[ti][0]}" y1="${pts[ti][1]}" y2="90" stroke="rgba(255,255,255,.4)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
      </svg>
      <span style="position:absolute;left:${(ti + .5) / days.length * 100}%;top:${pts[ti][1]}px;width:12px;height:12px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 18px 6px rgba(143,216,255,.7)"></span>
    </div>
    <div class="wave-vals">${days.map((x, i) => `<span class="${i === ti ? "on" : ""}" title="${pmBin(x.v)[3]}">${Math.round(x.v)}</span>`).join("")}</div>
    <div class="small" style="text-align:center;margin-top:6px">PM2.5 trung bình theo ngày, µg/m³</div>`;
}

function renderActions(d) {
  const cur = d.current, fut = futureHours(d), next6 = fut.slice(1, 7);
  const avg6 = next6.reduce((a, b) => a + b.v, 0) / next6.length;
  const w = windows(d, 2)[0];
  const trend = avg6 > cur.pm2_5 * 1.1 ? "tăng" : avg6 < cur.pm2_5 * 0.9 ? "giảm" : "đi ngang";
  const home = cur.pm2_5 <= 25 ? "Có thể mở cửa sổ cho thoáng nhà."
    : cur.pm2_5 <= 50 ? "Đóng cửa sổ phía mặt đường. Người nhạy cảm hạn chế gắng sức."
    : "Đóng cửa sổ, bật máy lọc nếu có. Trẻ nhỏ và người già nên ở trong nhà.";
  const out = cur.pm2_5 <= 25 ? "Không cần biện pháp đặc biệt." : cur.pm2_5 <= 50 ? "Nên đeo khẩu trang khi đi xe máy." : "Đeo N95 nếu buộc phải ra ngoài, tránh tập luyện mạnh.";
  const wDay = w ? (w.day === cur.time.slice(0, 10) ? "hôm nay" : fmtDay.format(new Date(w.day + "T12:00")).toLowerCase()) : "";
  $("acts").innerHTML =
    (w ? `<li><span class="label">Ra ngoài</span>Đẹp nhất: <b>${pad(w.best.start)}:00–${pad(w.best.start + 2)}:00 ${wDay}</b>, khoảng ${Math.round(w.best.avg)} µg/m³</li>` : "") +
    `<li><span class="label">Ở nhà</span>${home}</li>
     <li><span class="label">Đi đường</span>${out}</li>
     <li><span class="label">6 giờ tới</span>Bụi có xu hướng <b>${trend}</b>, khoảng ${Math.round(avg6)} µg/m³</li>`;
}

function renderCity(key) {
  const d = live[key];
  if (!d) { $("loc").innerHTML = `<span class="err">Không tải được dữ liệu ${CITIES[key].name}.</span>`; return; }
  const cur = d.current, lv = LEVELS[levelIdx(cur.us_aqi)];
  const next24 = futureHours(d).slice(0, 24).map(x => x.v);
  const h = HEADLINES.find(x => cur.pm2_5 <= x[0]);
  $("loc").innerHTML = `<b>${CITIES[key].name}, Việt Nam</b> (${fmtDay.format(new Date(cur.time))} · ${cur.time.slice(11)})`;
  $("bigN").textContent = Math.round(cur.pm2_5);
  $("aqi").innerHTML = `US AQI ${cur.us_aqi} · <span class="sq" style="background:var(${lv.v})"></span> ${lv.name}`;
  $("hl").innerHTML = `<span>Cao<b>${Math.round(Math.max(...next24))}</b></span><span>Thấp<b>${Math.round(Math.min(...next24))}</b></span>`;
  $("headline").innerHTML = `${h[1]}<span>${h[2]}</span>`;
  document.documentElement.style.setProperty("--haze", (0.06 + Math.min(1, Math.max(0, (cur.pm2_5 - 10) / 90)) * 0.7).toFixed(2));
  renderSpark(d); renderWave(d); renderActions(d);

  $("cityBtns").innerHTML = Object.keys(CITIES).map(k => `<button class="city-btn" data-city="${k}" aria-pressed="${k === key}">${CITIES[k].short}
    <span>${live[k] ? `<span class="sq" style="background:${pmColor(live[k].current.pm2_5)}"></span>${Math.round(live[k].current.pm2_5)}` : "–"}</span></button>`).join("");
  const o = Object.keys(CITIES).find(k => k !== key), od = live[o];
  $("other").dataset.city = o;
  $("other").innerHTML = od ? `<div class="row"><span>${CITIES[o].name}</span><span class="v num">${Math.round(od.current.pm2_5)}</span></div>
    <div class="row small"><span>${pmBin(od.current.pm2_5)[3]}</span><span>µg/m³</span></div>` : `<span class="small">${CITIES[o].name}: chưa tải được</span>`;
}

function switchCity(k) { setCity(k); renderCity(k); }
$("cityBtns").addEventListener("click", e => { const b = e.target.closest("button"); if (b) switchCity(b.dataset.city); });
$("other").addEventListener("click", () => switchCity($("other").dataset.city));

$("explore").innerHTML = PAGES.filter(p => p.key !== "now").map(p =>
  `<a class="ex glass${["me", "week"].includes(p.key) ? " feature" : ""}" href="${p.href}">${icon(p.key)}<h3>${p.label}</h3><p>${p.desc}</p><span class="go">Xem trang →</span></a>`).join("");

Promise.allSettled(Object.keys(CITIES).map(k => loadLive(k))).then(() => renderCity(getCity()));
