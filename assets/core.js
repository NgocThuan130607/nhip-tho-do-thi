/* Nhịp Thở Đô Thị — phần dùng chung cho mọi trang */
const CITIES = {
  hanoi: {name: "Hà Nội", short: "Hà Nội", lat: 21.028, lon: 105.854},
  hcmc:  {name: "TP. Hồ Chí Minh", short: "TP.HCM", lat: 10.776, lon: 106.701},
};
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const vn = (x, d = 1) => x == null ? "–" : Number(x).toLocaleString("vi-VN", {maximumFractionDigits: d});
const pad = n => String(n).padStart(2, "0");
const fmtDay = new Intl.DateTimeFormat("vi-VN", {weekday: "long", day: "numeric", month: "numeric"});
const fmtWeekday = new Intl.DateTimeFormat("vi-VN", {weekday: "long"});
const dmy = s => s.split("-").reverse().join("/");
const curMonth = new Date().getMonth() + 1;

// Thang PM2.5 (µg/m³): xanh trời khi sạch, xám khói khi ô nhiễm
const PM_BINS = [[15, "--p0", "≤ 15 · đạt WHO", "Trong lành"], [25, "--p1", "15–25", "Khá"], [35, "--p2", "25–35", "Trung bình"],
                 [50, "--p3", "35–50", "Kém"], [75, "--p4", "50–75", "Xấu"], [1e9, "--p5", "> 75", "Rất xấu"]];
const pmBin = v => PM_BINS.find(b => v <= b[0]);
const pmVar = v => pmBin(v)[1];
const pmColor = v => v == null ? "transparent" : css(pmVar(v));
const legendHTML = () => PM_BINS.map(b => `<span><span class="sq" style="background:var(${b[1]})"></span>${b[2]}</span>`).join("") + `<span>µg/m³</span>`;

// Thang US AQI
const LEVELS = [
  {max: 50, name: "Tốt", v: "--p0"}, {max: 100, name: "Trung bình", v: "--p1"},
  {max: 150, name: "Kém", v: "--p3"}, {max: 200, name: "Xấu", v: "--p4"},
  {max: 300, name: "Rất xấu", v: "--p5"}, {max: 1e9, name: "Nguy hại", v: "--p5"},
];
const levelIdx = aqi => LEVELS.findIndex(l => aqi <= l.max);

/* ---------- Thành phố đang chọn (nhớ giữa các trang) ---------- */
function getCity() {
  try { const c = localStorage.getItem("ntdt-city"); if (c in CITIES) return c; } catch (e) {}
  return "hanoi";
}
function setCity(c) { try { localStorage.setItem("ntdt-city", c); } catch (e) {} }

function citySeg(el, onChange) {
  const cur = getCity();
  el.innerHTML = `<div class="seg" role="group" aria-label="Chọn thành phố">${Object.entries(CITIES).map(([k, c]) =>
    `<button data-city="${k}" aria-pressed="${k === cur}">${c.short}</button>`).join("")}</div>`;
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    setCity(b.dataset.city); onChange(b.dataset.city);
  });
}

/* ---------- Khung trang: điều hướng + chuyển trang ---------- */
const ICONS = {
  now: '<path d="M3 12h11a3 3 0 1 0-3-3M3 17h15a3 3 0 1 1-3 3M3 7h5"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  story: '<path d="M3 20V10M9 20V4M15 20v-7M21 20V8"/>',
  recs: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  tools: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  road: '<path d="M5 21 9 3M19 21 15 3M12 6v2M12 11v2M12 16v2"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M7 14h3M7 17h3M14 14h3"/>',
};
const PAGES = [
  {href: "index.html", key: "now", label: "Bây giờ", desc: "PM2.5 lúc này, dự báo 5 ngày và việc nên làm ngay."},
  {href: "trai-qua.html", key: "me", label: "Bạn đã trải qua những gì?", desc: "Không khí ngày sinh nhật bạn, tổng lượng bụi bạn đã hít, và thẻ để chia sẻ."},
  {href: "phan-tich.html", key: "story", label: "Phân tích dữ liệu", desc: "Hơn 4 năm dữ liệu: khi nào bụi nhiều nhất, vì sao buổi tối tệ nhất, gió, mưa và Tết."},
  {href: "khuyen-nghi.html", key: "recs", label: "Nên làm gì", desc: "10 khuyến nghị cho gia đình và chính quyền, mỗi khuyến nghị có số liệu làm căn cứ."},
  {href: "lich-tuan.html", key: "week", label: "Lịch tuần", desc: "Bảng bụi dự báo từng giờ trong 7 ngày tới. Thêm hoạt động của bạn, trang tự xếp vào giờ ít bụi nhất."},
  {href: "cong-cu.html", key: "tools", label: "Công cụ", desc: "Tính lượng bụi bạn hít mỗi năm và lịch ra ngoài theo tháng."},
  {href: "lo-trinh.html", key: "road", label: "Lộ trình & phương pháp", desc: "Hướng phát triển, nguồn dữ liệu, cách xử lý và giới hạn."},
];
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

function renderShell(active) {
  const nav = document.createElement("header");
  nav.className = "wrap nav";
  nav.innerHTML = `<div class="bar glass">
    <a class="brand" href="index.html">Nhịp Thở <i>Đô Thị</i></a>
    <nav class="links" aria-label="Các trang">${PAGES.filter(p => p.key !== "me").map(p =>
      `<a href="${p.href}"${p.key === active ? ' aria-current="page"' : ""}>${p.key === "road" ? "Lộ trình" : p.label}</a>`).join("")}</nav>
    <a class="btn primary cta" href="trai-qua.html"${active === "me" ? ' aria-current="page"' : ""}>Bạn đã trải qua những gì?</a></div>`;
  document.body.prepend(nav);

  const i = PAGES.findIndex(p => p.key === active);
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  const foot = document.createElement("footer");
  foot.className = "wrap";
  foot.innerHTML = `<div class="pager">
      ${prev ? `<a class="glass" href="${prev.href}"><span class="label">← Trang trước</span><b>${prev.label}</b></a>` : "<span></span>"}
      ${next ? `<a class="glass next" href="${next.href}"><span class="label">Trang tiếp theo →</span><b>${next.label}</b></a>` : `<a class="glass next" href="index.html"><span class="label">Về đầu →</span><b>Bây giờ</b></a>`}
    </div>
    <div class="foot"><span>Nhịp Thở Đô Thị · Dữ liệu mở: CAMS, ERA5 qua Open-Meteo · <a href="https://github.com/NgocThuan130607/nhip-tho-do-thi" target="_blank" rel="noopener">Mã nguồn trên GitHub</a></span>
    <span>Thông tin chỉ mang tính tham khảo, không thay thế khuyến cáo y tế.</span></div>`;
  document.body.append(foot);
}

/* ---------- Dữ liệu ---------- */
let INS = null;
const DAILY = {};
const loadInsights = () => fetch("data/insights.json").then(r => r.json()).then(j => {
  INS = j;
  for (const k in j.cities) DAILY[k] = Object.fromEntries(j.cities[k].daily);
  return j;
});

const live = {};
async function loadLive(key, days = 5) {
  const id = key + days;
  if (live[id]) return live[id];
  const c = CITIES[key];
  const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}` +
    `&current=pm2_5,us_aqi&hourly=pm2_5&forecast_days=${days}&timezone=Asia%2FBangkok`);
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  live[id] = j;
  if (days === 5) live[key] = j;
  return j;
}

// Các giờ dự báo từ giờ hiện tại trở đi
function futureHours(d) {
  const now = d.current.time.slice(0, 13);
  return d.hourly.time.map((t, i) => ({t, d: t.slice(0, 10), h: +t.slice(11, 13), v: d.hourly.pm2_5[i]}))
    .filter(x => x.v != null && x.t.slice(0, 13) >= now);
}

// Khung `len` giờ tốt nhất và tệ nhất mỗi ngày, trong 6h–22h
function windows(d, len) {
  const byDay = {};
  futureHours(d).filter(x => x.h >= 6 && x.h < 22).forEach(x => (byDay[x.d] ||= []).push(x));
  return Object.entries(byDay).map(([day, hs]) => {
    const opts = [];
    for (let i = 0; i + len <= hs.length; i++) {
      const s = hs.slice(i, i + len);
      if (s[len - 1].h - s[0].h !== len - 1) continue;
      opts.push({start: s[0].h, avg: s.reduce((a, b) => a + b.v, 0) / len});
    }
    if (opts.length < 2) return null;
    opts.sort((a, b) => a.avg - b.avg);
    return {day, best: opts[0], worst: opts[opts.length - 1]};
  }).filter(Boolean);
}

// Mô hình phơi nhiễm đơn giản: nồng độ hiệu dụng trung bình 24h (µg/m³)
const SPANS = {eve: [17, 22], morn: [6, 9], mid: [10, 15], any: [0, 24]};
function doseFor(c, {hrs, when, mode, mask, indoor}) {
  const avg = ([a, b]) => c.hourly.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
  return (hrs * avg(SPANS[when]) * mode * mask + (24 - hrs) * avg([0, 24]) * indoor) / 24;
}
const cigYear = x => x / 22 * 365;

function bars(id, items, max, colorFn) {
  $(id).innerHTML = items.map(it => `<div class="bar"><span>${it.label}</span>
    <span class="track"><span class="fill" style="width:${Math.max(2, 100 * it.v / max)}%;background:${colorFn ? colorFn(it) : pmColor(it.v)}"></span></span>
    <span class="v">${it.text ?? vn(it.v)}</span></div>`).join("");
}

// Mặc định cho Chart.js theo giao diện tối
if (window.Chart) {
  Chart.defaults.color = "rgba(234,244,251,.6)";
  Chart.defaults.font.family = "Lexend";
  Chart.defaults.font.weight = 300;
  Chart.defaults.borderColor = "rgba(255,255,255,.08)";
}
