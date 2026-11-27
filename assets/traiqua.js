/* Trang "Bạn đã trải qua những gì?" */
renderShell("me");

const HABIT = {hrs: 2, when: "eve", mode: 1.3, mask: 1, indoor: 0.7};  // thói quen phổ biến
const PLEDGES = [
  ["run", "Chạy bộ, đi lại vào giữa ngày thay vì chiều tối", {when: "mid"}],
  ["n95", "Đeo khẩu trang N95 khi đi xe máy", {mask: 0.25}],
  ["purifier", "Đặt máy lọc không khí trong phòng ngủ", {indoor: 0.3}],
  ["window", "Đóng cửa sổ từ 17h đến sáng hôm sau", {indoor: 0.55}],
];
let TQ = null;

function onThisDay() {
  const now = new Date(), md = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const years = [...new Set(INS.cities.hanoi.daily.map(r => r[0].slice(0, 4)))];
  const parts = years.map(y => `${y}-${md}`).filter(d => DAILY.hanoi[d] != null)
    .map(d => `<b>${dmy(d)}</b>: Hà Nội ${vn(DAILY.hanoi[d], 0)}, TP.HCM ${vn(DAILY.hcmc[d], 0)} µg/m³`);
  $("otd").innerHTML = `<span class="label" style="margin-right:8px">Ngày này các năm trước</span> ` + (parts.length ? parts.join(" · ") : "chưa có dữ liệu.");
}

function initForm() {
  const opt = (v, t, sel) => `<option value="${v}"${sel ? " selected" : ""}>${t}</option>`;
  $("tqCity").value = getCity();
  $("tqDay").innerHTML = [...Array(31).keys()].map(i => opt(i + 1, i + 1, i === 0)).join("");
  $("tqMonth").innerHTML = [...Array(12).keys()].map(i => opt(i + 1, "Tháng " + (i + 1), i === 0)).join("");
  const y0 = +INS.period[0].slice(0, 4), y1 = +INS.period[1].slice(0, 4);
  $("tqYear").innerHTML = opt(y0, `${y0} hoặc trước đó`, true) + [...Array(y1 - y0).keys()].map(i => opt(y0 + i + 1, y0 + i + 1)).join("");
  $("tqGo").addEventListener("click", run);
  $("tqDownload").addEventListener("click", downloadCard);
  if (navigator.canShare) $("tqShare").hidden = false;
  $("tqShare").addEventListener("click", shareCard);
}

function run() {
  const key = $("tqCity").value, c = INS.cities[key];
  setCity(key);
  const bd = +$("tqDay").value, bm = +$("tqMonth").value, y = +$("tqYear").value;
  const start = y <= +INS.period[0].slice(0, 4) ? INS.period[0] : `${y}-01-01`;
  const days = c.daily.filter(r => r[0] >= start);
  const total = days.reduce((a, r) => a + r[1], 0);
  const good = days.filter(r => r[1] <= 15).length;
  const sorted = [...days].sort((a, b) => a[1] - b[1]);
  const md = `${pad(bm)}-${pad(bd)}`;
  const bdays = [...new Set(days.map(r => r[0].slice(0, 4)))].map(yr => `${yr}-${md}`)
    .filter(d => DAILY[key][d] != null).map(d => ({d, pm: DAILY[key][d]}));
  TQ = {city: c, start, n: days.length, cig: Math.round(total / 22), good, clean: sorted[0], dirty: sorted[sorted.length - 1], bdays, bd, bm, days, pledge: null};

  $("tqLede").innerHTML = `Từ ${dmy(start)} đến nay, ở ${c.name}, bạn đã hít lượng bụi mịn tương đương <b>${vn(TQ.cig, 0)} điếu thuốc</b>. ` +
    `Trong ${vn(TQ.n, 0)} ngày, chỉ có <b>${vn(good, 0)}</b> ngày bạn được thở không khí đạt chuẩn của WHO.`;
  $("tqBday").innerHTML = bdays.length ? bdays.map(b =>
    `<div style="border-top-color:${pmColor(b.pm)}">Sinh nhật ${b.d.slice(0, 4)}<b>${vn(b.pm, 0)}</b>µg/m³ · ${b.pm <= 15 ? "đạt chuẩn WHO" : `gấp ${vn(b.pm / 15)} lần WHO`}</div>`).join("")
    : `<p class="small">Ngày ${bd}/${bm} không có trong khoảng dữ liệu (hoặc không tồn tại, như 30/2).</p>`;

  const bset = new Set(bdays.map(b => b.d));
  $("tqStripe").innerHTML = `<svg viewBox="0 0 ${days.length} 12" preserveAspectRatio="none" role="img" aria-label="Dải ngày của bạn">` +
    days.map((r, i) => `<rect x="${i}" y="3" width="1.02" height="9" fill="${pmColor(r[1])}"/>` +
      (bset.has(r[0]) ? `<rect x="${i - 2}" y="0" width="5" height="2.2" fill="#fff"/>` : "")).join("") + `</svg>`;
  $("tqLegend").innerHTML = legendHTML();

  $("tqExtremes").innerHTML = [["Ngày bạn thở sạch nhất", TQ.clean], ["Ngày bạn thở bẩn nhất", TQ.dirty]].map(([t, r]) =>
    `<div><div class="label">${t}</div><span class="stat num" style="color:${r[1] > 35 ? "var(--smog)" : pmColor(r[1])}">${vn(r[1], 0)}</span> <span class="small">µg/m³</span>
     <p class="small" style="margin:6px 0 0">${fmtDay.format(new Date(r[0] + "T12:00"))}/${r[0].slice(0, 4)} · tương đương ${r[1] / 22 < 0.1 ? "dưới 0,1" : vn(r[1] / 22)} điếu thuốc trong ngày</p></div>`).join("") +
    `<div><div class="label">Số ngày bạn được thở sạch</div><span class="stat num">${vn(good, 0)}</span> <span class="small">/ ${vn(TQ.n, 0)} ngày</span>
     <p class="small" style="margin:6px 0 0">Ngày có trung bình 24h không quá 15 µg/m³ (chuẩn WHO)</p></div>`;

  const base = doseFor(c, HABIT);
  $("tqPledge").innerHTML = PLEDGES.map(([id, text, change]) =>
    `<label><input type="radio" name="pledge" value="${id}"><span>${text}</span><span class="gain">−${vn(cigYear(base) - cigYear(doseFor(c, {...HABIT, ...change})), 0)} điếu/năm</span></label>`).join("");
  document.querySelectorAll("#tqPledge input").forEach(inp => inp.addEventListener("change", () => {
    TQ.pledge = PLEDGES.find(p => p[0] === inp.value); drawCard();
  }));

  $("tqResult").hidden = false;
  drawCard();
  $("tqResult").scrollIntoView({behavior: "smooth", block: "start"});
}

function wrapText(ctx, text, x, y, maxW, lh) {
  let line = "";
  for (const w of text.split(" ")) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; }
    else line = test;
  }
  ctx.fillText(line, x, y);
  return y + lh;
}

// Thẻ chia sẻ 1080×1350 theo phong cách bầu trời của trang
async function drawCard() {
  if (!TQ) return;
  await Promise.all(["200 80px Lexend", "300 30px Lexend", "400 30px Lexend"].map(f => document.fonts.load(f, "Ạ")));
  const cv = $("card"), ctx = cv.getContext("2d");
  const W = 1080, H = 1350, M = 80, TXT = "#eaf4fb", TXT2 = "rgba(234,244,251,.7)", SKY = "#8fd8ff";
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f3a66"); bg.addColorStop(.45, "#0a2342"); bg.addColorStop(1, "#061220");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * .8, 0, 0, W * .8, 0, 700);
  glow.addColorStop(0, "rgba(76,184,245,.45)"); glow.addColorStop(1, "rgba(76,184,245,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // lớp sương xám theo mức bụi trung bình
  const avg = TQ.days.reduce((a, r) => a + r[1], 0) / TQ.n;
  ctx.fillStyle = `rgba(140,148,156,${Math.min(.45, Math.max(0, (avg - 10) / 120))})`; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = TXT2; ctx.font = "400 26px Lexend";
  ctx.fillText("NHỊP THỞ ĐÔ THỊ  ·  BẠN ĐÃ TRẢI QUA NHỮNG GÌ?", M, 110);
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(M, 135, W - 2 * M, 1);

  ctx.fillStyle = TXT; ctx.font = "300 48px Lexend";
  ctx.fillText(`Sống ở ${TQ.city.name} từ ${dmy(TQ.start)},`, M, 225);
  ctx.font = "100 240px Lexend"; ctx.fillText(vn(TQ.cig, 0), M - 12, 450);
  ctx.font = "300 54px Lexend"; ctx.fillStyle = SKY; ctx.fillText("điếu thuốc", M, 525);
  ctx.font = "300 32px Lexend"; ctx.fillStyle = TXT2;
  let y = wrapText(ctx, `là lượng bụi mịn PM2.5 tôi đã hít, quy đổi. Chỉ ${vn(TQ.good, 0)} trong ${vn(TQ.n, 0)} ngày đạt chuẩn của WHO.`, M, 590, W - 2 * M, 46);

  y += 16;
  const sw = (W - 2 * M) / TQ.days.length;
  TQ.days.forEach((r, i) => { ctx.fillStyle = pmColor(r[1]); ctx.fillRect(M + i * sw, y, sw + 0.6, 90); });
  y += 145;

  ctx.fillStyle = TXT2; ctx.font = "400 24px Lexend";
  ctx.fillText(`KHÔNG KHÍ NGÀY SINH NHẬT ${pad(TQ.bd)}/${pad(TQ.bm)}`, M, y);
  y += 26;
  const bw = (W - 2 * M - 20 * 4) / 5;
  TQ.bdays.slice(-5).forEach((b, i) => {
    const x = M + i * (bw + 20);
    ctx.fillStyle = pmColor(b.pm); ctx.fillRect(x, y, bw, 8);
    ctx.fillStyle = TXT2; ctx.font = "300 26px Lexend"; ctx.fillText(b.d.slice(0, 4), x, y + 50);
    ctx.fillStyle = TXT; ctx.font = "200 64px Lexend"; ctx.fillText(vn(b.pm, 0), x, y + 120);
  });
  if (!TQ.bdays.length) { ctx.fillStyle = TXT2; ctx.font = "300 28px Lexend"; ctx.fillText("Không có trong khoảng dữ liệu.", M, y + 50); }
  y += 185;

  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(M, y, W - 2 * M, 1); y += 58;
  ctx.font = "400 24px Lexend"; ctx.fillStyle = SKY; ctx.fillText("CAM KẾT CỦA TÔI", M, y); y += 54;
  ctx.fillStyle = TXT; ctx.font = "300 42px Lexend";
  wrapText(ctx, TQ.pledge ? TQ.pledge[1] + "." : "Chọn một cam kết trên trang để thêm vào đây.", M, y, W - 2 * M, 54);

  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(M, H - 150, W - 2 * M, 1);
  ctx.fillStyle = TXT; ctx.font = "400 30px Lexend";
  ctx.fillText("Bạn thì sao?  ngocthuan130607.github.io/nhip-tho-do-thi", M, H - 100);
  ctx.fillStyle = TXT2; ctx.font = "300 21px Lexend";
  ctx.fillText("Dữ liệu: CAMS, Open-Meteo · Quy đổi 22 µg/m³ trong 24 giờ ≈ 1 điếu thuốc (Berkeley Earth)", M, H - 62);
}

const cardBlob = () => new Promise(r => $("card").toBlob(r, "image/png"));
async function downloadCard() {
  const url = URL.createObjectURL(await cardBlob());
  Object.assign(document.createElement("a"), {href: url, download: "ban-da-trai-qua-nhung-gi.png"}).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function shareCard() {
  const file = new File([await cardBlob()], "ban-da-trai-qua-nhung-gi.png", {type: "image/png"});
  const data = {files: [file], title: "Bạn đã trải qua những gì?", text: "Xem không khí đã đi qua phổi bạn thế nào:", url: location.href};
  try { if (navigator.canShare(data)) await navigator.share(data); else downloadCard(); } catch (e) { /* người dùng huỷ */ }
}

loadInsights().then(() => { onThisDay(); initForm(); })
  .catch(() => { $("otd").innerHTML = `<span class="err">Không tải được dữ liệu lịch sử.</span>`; });
