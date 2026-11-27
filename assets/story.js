/* Trang phân tích dữ liệu */
renderShell("story");

function renderLede() {
  const s = INS.cities.hanoi.summary, s2 = INS.cities.hcmc.summary;
  $("lede").innerHTML = `Trong ${vn(s.days, 0)} ngày quan sát, Hà Nội có <b>${vn(s.who_days, 0)}</b> ngày vượt ngưỡng an toàn của WHO. ` +
    `Chỉ riêng việc hít thở ở đây mỗi năm đã tương đương hút khoảng <b>${s.cig_per_year} điếu thuốc</b>. Ở TP.HCM, con số đó là ${s2.cig_per_year}.`;
}

function renderStripes() {
  const n = INS.cities.hanoi.daily.length;
  let html = Object.keys(CITIES).map(k => {
    const days = INS.cities[k].daily;
    return `<div class="stripe-row"><span class="label">${CITIES[k].short}</span>
      <svg viewBox="0 0 ${days.length} 10" preserveAspectRatio="none" role="img" aria-label="Mỗi vạch là một ngày ở ${CITIES[k].name}">${days.map((r, i) =>
        `<rect x="${i}" y="0" width="1.02" height="10" fill="${pmColor(r[1])}"><title>${dmy(r[0])}: ${vn(r[1])} µg/m³</title></rect>`).join("")}</svg></div>`;
  }).join("");
  const ticks = INS.cities.hanoi.daily.map((r, i) => [r[0], i]).filter(([d]) => d.endsWith("-01-01"))
    .map(([d, i]) => `<span style="left:${100 * i / n}%">${d.slice(0, 4)}</span>`).join("");
  html += `<div class="stripe-axis"><i></i><div>${ticks}</div></div><div class="legend">${legendHTML()}</div>`;
  $("stripes").innerHTML = html;
}

function renderC1(c) {
  const worst = [...c.monthly].sort((a, b) => b.pm - a.pm), h = c.hourly;
  const lo = [...Array(16).keys()].map(i => i + 6).reduce((a, b) => h[b] < h[a] ? b : a);
  const hi = [...Array(24).keys()].reduce((a, b) => h[b] > h[a] ? b : a);
  $("c1-text").innerHTML = `Ở ${c.name}, tháng nặng nhất là tháng ${worst[0].month} và tháng ${worst[1].month}, với PM2.5 trung bình ${vn(worst[0].pm)} và ${vn(worst[1].pm)} µg/m³. ` +
    `Nhưng khác biệt lớn hơn nằm <i>trong một ngày</i>: PM2.5 thường thấp nhất khoảng ${lo}h (${vn(h[lo])} µg/m³) và cao nhất khoảng ${hi}h (${vn(h[hi])} µg/m³). ` +
    `Chỉ cần đổi giờ ra ngoài đã giảm được khoảng <b>${Math.round(100 * (1 - h[lo] / h[hi]))}%</b> lượng bụi hít vào.`;
  let html = `<div class="lab"></div>` + Array.from({length: 24}, (_, i) => `<div class="hl">${i}</div>`).join("");
  c.heatmap.forEach((row, mi) => {
    html += `<div class="lab">T${mi + 1}</div>` + row.map((v, hr) =>
      `<div class="${mi + 1 === curMonth ? "now-m" : ""}" style="background:${pmColor(v)}" title="Tháng ${mi + 1}, ${hr}h: ${vn(v)} µg/m³"></div>`).join("");
  });
  $("heat").innerHTML = html;
  $("legend1").innerHTML = legendHTML();
}

let eveChart;
function renderC2(c) {
  const d = c.diurnal.dry;
  const blhDay = Math.max(...d.blh), blhNight = Math.min(...d.blh.slice(18), ...d.blh.slice(0, 6));
  const pmNoon = Math.min(...d.pm.slice(9, 17)), pmEve = Math.max(...d.pm.slice(17));
  const no2Lo = Math.min(...d.no2), no2Hi = Math.max(...d.no2);
  $("c2-text").innerHTML = `Ban ngày, mặt trời làm nóng mặt đất và khuấy trộn một lớp không khí dày khoảng <b>${vn(blhDay, 0)} m</b>, gọi là lớp biên. ` +
    `Sau hoàng hôn, lớp này sụp xuống chỉ còn khoảng <b>${vn(blhNight, 0)} m</b>. Đúng lúc đó, khí thải giờ tan tầm đổ ra đường: NO₂, chất chỉ dấu của khói xe, tăng từ ${vn(no2Lo)} lên ${vn(no2Hi)} µg/m³ vào khoảng ${d.no2.indexOf(no2Hi)}h. ` +
    `Lượng khí thải ấy bị nhốt trong một "chiếc hộp" mỏng hơn ${vn(blhDay / blhNight, 0)} lần, nên PM2.5 vọt từ ${vn(pmNoon)} lên ${vn(pmEve)} µg/m³. ` +
    `Vì vậy buổi tối là lúc tệ nhất để chạy bộ hay mở cửa sổ, kể cả khi đường đã vắng.`;
  eveChart?.destroy();
  eveChart = new Chart($("eveChart"), {
    data: {labels: [...Array(24).keys()].map(h => h + "h"), datasets: [
      {type: "line", label: "PM2.5", data: d.pm, borderColor: css("--p2"), borderWidth: 2.5, pointRadius: 0, tension: .4, yAxisID: "y"},
      {type: "line", label: "NO₂ (khói xe)", data: d.no2, borderColor: "rgba(255,255,255,.55)", borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: .4, yAxisID: "y"},
      {type: "line", label: "Độ cao lớp biên (m)", data: d.blh, borderColor: css("--sky"), borderWidth: 1, backgroundColor: "rgba(76,184,245,.22)", fill: true, pointRadius: 0, tension: .4, yAxisID: "y2"},
    ]},
    options: {maintainAspectRatio: false, interaction: {mode: "index", intersect: false},
      plugins: {legend: {position: "top", align: "start", labels: {boxWidth: 18, boxHeight: 2}}},
      scales: {x: {ticks: {maxTicksLimit: 12, maxRotation: 0}, grid: {display: false}},
        y: {beginAtZero: true, title: {display: true, text: "µg/m³"}},
        y2: {position: "right", beginAtZero: true, title: {display: true, text: "mét"}, grid: {display: false}}}},
  });
}

function renderC3(c) {
  const w = c.wind, r = c.rain, wd = c.wind_dir.filter(x => x.pm != null);
  const tetAvg = c.tet.reduce((a, t) => a + t.change_pct, 0) / c.tet.length;
  $("c3-text").innerHTML = `Gió là "máy lọc" miễn phí của thành phố. Khi gió dưới 5 km/h, PM2.5 ở ${c.name} trung bình ${vn(w[0].pm)} µg/m³. Khi gió từ 20 km/h trở lên, con số này chỉ còn ${vn(w[w.length - 1].pm)}. ` +
    `Ngày mưa sạch hơn ngày khô (${vn(r.wet_pm)} so với ${vn(r.dry_pm)} µg/m³). ` +
    `Bất ngờ nhất là Tết: dù thành phố vắng xe cả tuần, PM2.5 trong tuần Tết thay đổi trung bình <b>${tetAvg > 0 ? "+" : ""}${Math.round(tetAvg)}%</b> so với các tuần xung quanh và không giảm đều đặn qua các năm. ` +
    `Thời tiết, pháo hoa, hương khói và bụi từ vùng lân cận nặng ký không kém giao thông nội đô. Ô nhiễm vì thế là bài toán của <i>cả vùng</i>.`;
  bars("windBars", w.map(x => ({label: x.label + " km/h", v: x.pm})), Math.max(...w.map(x => x.pm)));
  bars("dirBars", [...wd].sort((a, b) => b.pm - a.pm).map(x => ({label: `${x.dir} <span class="small">· ${vn(x.share, 0)}%</span>`, v: x.pm})), Math.max(...wd.map(x => x.pm)));
  bars("rainBars", [{label: "Ngày khô", v: r.dry_pm}, {label: "Ngày mưa", v: r.wet_pm}, {label: "Sau mưa to", v: r.after_heavy_rain_pm}], Math.max(r.dry_pm, r.wet_pm));
  bars("tetBars", c.tet.map(t => ({label: "Tết " + t.year, v: Math.abs(t.change_pct), text: (t.change_pct > 0 ? "+" : "") + t.change_pct + "%"})), 30,
    it => it.text.startsWith("+") ? css("--p4") : css("--p0"));
}

function renderC4(c) {
  const p = c.persistence, e = c.episodes;
  const peakM = e.by_month.indexOf(Math.max(...e.by_month)) + 1;
  $("c4-text").innerHTML = `Ô nhiễm có quán tính. Ở ${c.name}, nếu hôm nay trung bình vượt 50 µg/m³ (chuẩn QCVN) thì khả năng ngày mai vẫn vượt là <b>${vn(p.bad_after_bad, 0)}%</b>. ` +
    `Nếu hôm nay dưới ngưỡng, khả năng đó chỉ là ${vn(p.bad_after_ok, 0)}%. Từ 2022 đến nay có <b>${e.count}</b> đợt ô nhiễm kéo dài từ 3 ngày trở lên` +
    (e.longest ? `, đợt dài nhất kéo dài ${e.longest.len} ngày từ ${dmy(e.longest.start)} với đỉnh ${vn(e.longest.peak)} µg/m³` : "") +
    `. Các đợt hay bắt đầu nhất vào tháng ${peakM}. Ngày đầu tiên vượt ngưỡng chính là tín hiệu cảnh báo sớm tốt nhất.`;
  $("persistStat").textContent = vn(p.bad_after_bad, 0) + "%";
  bars("epBars", e.by_month.map((v, i) => ({label: "Tháng " + (i + 1), v, text: String(v)})), Math.max(1, ...e.by_month), () => css("--p3"));
}

const sign = x => (x > 0 ? "+" : x < 0 ? "−" : "") + vn(Math.abs(x)) + "%";

function renderC5(c) {
  const dw = c.advanced.deweather;
  const worst = [...dw.years].sort((a, b) => b.adj_pct - a.adj_pct)[0];
  $("c5-text").innerHTML = `Một năm có thể "bẩn" chỉ vì ít gió và ít mưa. Để tách điều đó ra, mô hình hồi quy học cách thời tiết (gió, hướng gió, mưa, độ ẩm, nhiệt độ, độ cao lớp biên) và mùa trong năm ảnh hưởng tới PM2.5 mỗi ngày ở ${c.name}. ` +
    `Riêng thời tiết đã giải thích được <b>${vn(dw.r2_weather_only * 100, 0)}%</b> biến động bụi. Phần còn lại, sau khi trừ đi thời tiết, mới phản ánh lượng khí thải thực sự. ` +
    `Năm ${worst.year} vẫn bẩn hơn trung bình <b>${sign(worst.adj_pct)}</b> ngay cả khi đã loại bỏ thời tiết, so với ${sign(worst.raw_pct)} nếu nhìn số thô. ` +
    (worst.adj_pct >= worst.raw_pct * 0.5 ? "Vậy là phần lớn chênh lệch đến từ nguồn thải, không phải do trời." : "Vậy là phần lớn chênh lệch năm đó là do thời tiết bất lợi.");
  $("c5-r2").textContent = vn(dw.r2 * 100, 0) + "%";
  $("c5-wind").textContent = sign(dw.wind5_pct);
  $("c5-rain").textContent = sign(dw.rain_pct);
  const mx = Math.max(...dw.years.flatMap(y => [Math.abs(y.raw_pct), Math.abs(y.adj_pct)]), 5);
  const half = (v, strong) => `<span class="track" style="display:grid;grid-template-columns:1fr 1fr;background:none;overflow:visible">
      <span style="position:relative;height:10px;background:rgba(255,255,255,.06);border-radius:99px 0 0 99px">${v < 0 ? `<span class="fill" style="left:auto;right:0;width:${100 * -v / mx}%;background:${strong ? "var(--sky)" : "rgba(76,184,245,.35)"};border-radius:99px 0 0 99px"></span>` : ""}</span>
      <span style="position:relative;height:10px;background:rgba(255,255,255,.06);border-radius:0 99px 99px 0">${v > 0 ? `<span class="fill" style="width:${100 * v / mx}%;background:${strong ? "var(--p3)" : "rgba(153,162,171,.4)"};border-radius:0 99px 99px 0"></span>` : ""}</span></span>`;
  $("c5-years").innerHTML = dw.years.map(y => `
    <div class="bar"><span>${y.year} <span class="small">thô${y.n < 300 ? "*" : ""}</span></span>${half(y.raw_pct, false)}<span class="v small">${sign(y.raw_pct)}</span></div>
    <div class="bar" style="margin-bottom:8px"><span><span class="small">đã hiệu chỉnh</span></span>${half(y.adj_pct, true)}<span class="v">${sign(y.adj_pct)}</span></div>`).join("") +
    `<p class="small" style="margin:6px 0 0">* Năm không đủ dữ liệu: 2022 bắt đầu từ tháng 8, nửa đầu 2024 thiếu dữ liệu độ cao lớp biên từ ERA5, 2026 tính đến tháng 11. Xanh: sạch hơn trung bình. Xám: bẩn hơn.</p>`;
}

function renderRose(rose) {
  const R = 150, cx = 170, cy = 170, maxF = Math.max(...rose.map(s => s.reduce((a, c) => a + c.freq, 0)));
  const pt = (ang, r) => [cx + r * Math.sin(ang), cy - r * Math.cos(ang)];
  let svg = [0.25, 0.5, 0.75, 1].map(f => `<circle cx="${cx}" cy="${cy}" r="${R * Math.sqrt(f)}" fill="none" stroke="rgba(255,255,255,.1)"/>`).join("");
  rose.forEach((cells, s) => {
    const a0 = (s * 45 - 19) * Math.PI / 180, a1 = (s * 45 + 19) * Math.PI / 180;
    let cum = 0;
    cells.forEach(cell => {
      if (!cell.freq) return;
      const r0 = R * Math.sqrt(cum / maxF); cum += cell.freq; const r1 = R * Math.sqrt(cum / maxF);
      const [x0, y0] = pt(a0, r0), [x1, y1] = pt(a0, r1), [x2, y2] = pt(a1, r1), [x3, y3] = pt(a1, r0);
      svg += `<path d="M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0}Z" fill="${pmColor(cell.pm)}" stroke="rgba(6,18,32,.6)" stroke-width=".8"><title>${vn(cell.freq)}% thời gian · ${vn(cell.pm)} µg/m³</title></path>`;
    });
  });
  ["B", "ĐB", "Đ", "ĐN", "N", "TN", "T", "TB"].forEach((l, s) => {
    const [x, y] = pt(s * 45 * Math.PI / 180, R + 14);
    svg += `<text x="${x}" y="${y}" fill="rgba(234,244,251,.7)" font-size="12" text-anchor="middle" dominant-baseline="middle">${l}</text>`;
  });
  $("rose").innerHTML = `<svg viewBox="0 0 340 340" width="100%" role="img" aria-label="Hoa gió ô nhiễm">${svg}</svg>`;
}

function renderC6(c) {
  const a = c.advanced, fp = a.fingerprint;
  const sec = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  const tot = a.rose.map((cells, s) => ({s, f: cells.reduce((x, y) => x + y.freq, 0)}));
  const main = [...tot].sort((x, y) => y.f - x.f)[0];
  const calm = a.rose.reduce((x, cells) => x + cells[0].freq, 0);
  const calmPm = a.rose.reduce((x, cells) => x + cells[0].freq * cells[0].pm, 0) / calm;
  const hiCO = [...fp].sort((x, y) => y.co_no2 - x.co_no2).slice(0, 3).map(x => x.month).sort((x, y) => x - y);
  const hiDust = [...fp].sort((x, y) => y.dust_pct - x.dust_pct)[0];
  $("c6-text").innerHTML = `Ở ${c.name}, gió thổi từ hướng <b>${sec[main.s]}</b> nhiều nhất (${vn(main.f, 0)}% thời gian). Nhưng điều đáng chú ý nhất nằm ở vòng trong cùng của hoa gió: ` +
    `khi gió lặng (dưới 5 km/h, chiếm ${vn(calm, 0)}% thời gian), PM2.5 trung bình tới <b>${vn(calmPm, 0)} µg/m³</b>. Bụi chủ yếu là bụi "tại chỗ", tích tụ khi không có gió mang đi. ` +
    `Tỉ lệ CO/NO₂ cao nhất vào tháng ${hiCO.join(", ")}, gợi ý khói đốt (đun nấu, rơm rạ, rác) đóng góp nhiều hơn trong các tháng này. Bụi khoáng cao nhất vào tháng ${hiDust.month} (${vn(hiDust.dust_pct)}% PM10). ` +
    `<span class="small">Đây là các chỉ dấu gợi ý, cần dữ liệu thành phần hoá học từ trạm đo để kết luận chắc chắn.</span>`;
  renderRose(a.rose);
  const mx = Math.max(...fp.map(x => x.co_no2));
  $("fpBars").innerHTML = fp.map(x => `<div class="bar"><span>Tháng ${x.month} <span class="small">· bụi khoáng ${vn(x.dust_pct)}%</span></span>
    <span class="track"><span class="fill" style="width:${100 * x.co_no2 / mx}%;background:${x.co_no2 >= [...fp].sort((p, q) => q.co_no2 - p.co_no2)[2].co_no2 ? "var(--p3)" : "var(--p1)"}"></span></span>
    <span class="v">${vn(x.co_no2, 0)}</span></div>`).join("");
}

let pastChart;
function renderC7(c) {
  const a = c.advanced, ci = a.ci, f = a.forecast, m = f.cls.model, p = f.cls.persistence;
  const imp = Math.round(100 * (1 - f.mae.model / f.mae.persistence));
  $("c7-text").innerHTML = `Một phát hiện chỉ đáng tin khi nó vượt qua được sự ngẫu nhiên. Dùng bootstrap (lấy mẫu lại 1.000 lần), ta thấy ở ${c.name}: ` +
    `ảnh hưởng của mưa là <b>${ci.rain.significant ? "có ý nghĩa thống kê" : "chưa đủ bằng chứng"}</b>, còn hiệu ứng Tết và cuối tuần <b>${ci.tet.significant ? "có" : "không"}</b> và <b>${ci.weekend.significant ? "có" : "không"}</b> ý nghĩa thống kê. ` +
    (ci.tet.significant ? "" : `Nói cách khác, "Tết bớt bụi" là cảm giác, chưa phải là điều dữ liệu chứng minh được.`) + `<br><br>` +
    `Mô hình dự báo ngày mai (hồi quy logistic và hồi quy tuyến tính, dùng PM2.5 hôm nay cùng thời tiết ngày mai) được huấn luyện trên dữ liệu 2022–2025 và kiểm tra trên ${f.test_days} ngày của năm 2026 mà nó chưa từng thấy. ` +
    `Kết quả: sai số trung bình <b>${vn(f.mae.model)} µg/m³</b>, giảm <b>${imp}%</b> so với cách đoán "mai giống hôm nay" (${vn(f.mae.persistence)} µg/m³). ` +
    `Mô hình báo đúng ${vn(m.hit, 0)}% số ngày vượt ${vn(f.threshold)} µg/m³, với tỉ lệ báo động nhầm ${vn(m.false_alarm, 0)}%.`;

  const rows = [["Mưa so với ngày khô", ci.rain], ["Cuối tuần so với ngày thường", ci.weekend], ["Tuần Tết so với các tuần xung quanh", ci.tet]];
  const lim = Math.max(30, ...rows.map(r => Math.max(Math.abs(r[1].lo), Math.abs(r[1].hi)))) * 1.1;
  const X = v => 50 + 50 * v / lim;
  $("forest").innerHTML = rows.map(([l, r]) => `<div class="bar" style="grid-template-columns:200px 1fr 150px">
    <span>${l}</span>
    <span style="position:relative;height:22px">
      <span style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.3)"></span>
      <span style="position:absolute;top:10px;height:2px;left:${X(r.lo)}%;width:${X(r.hi) - X(r.lo)}%;background:${r.significant ? "var(--sky)" : "var(--smog)"}"></span>
      <span style="position:absolute;top:6px;width:10px;height:10px;border-radius:50%;left:calc(${X(r.est)}% - 5px);background:${r.significant ? "var(--sky)" : "var(--smog)"}"></span>
    </span>
    <span class="v small">${sign(r.est)} [${sign(r.lo)}; ${sign(r.hi)}]<br>${r.significant ? "có ý nghĩa" : "chưa đủ bằng chứng"}</span></div>`).join("") +
    `<p class="small">Vạch dọc là 0%. Nếu khoảng tin cậy cắt qua vạch dọc, chưa thể khẳng định hiệu ứng có thật.</p>`;

  const L = {model: "Mô hình của trang", persistence: `"Mai giống hôm nay"`, climatology: "Trung bình theo tháng", always_no: `Luôn đoán "không vượt"`};
  $("fcTable").innerHTML = `<thead><tr><th>Cách dự báo</th><th>Sai số TB (µg/m³)</th><th>Đúng/sai vượt ${vn(f.threshold)}</th><th>Báo đúng ngày vượt</th><th>Báo động nhầm</th><th>Brier ↓</th></tr></thead><tbody>` +
    Object.entries(f.cls).map(([k, s]) => `<tr${k === "model" ? ' class="cur"' : ""}><td class="t">${L[k]}</td><td>${f.mae[k] != null ? vn(f.mae[k]) : "–"}</td><td>${vn(s.acc)}%</td><td>${s.hit != null ? vn(s.hit) + "%" : "–"}</td><td>${s.false_alarm != null ? vn(s.false_alarm) + "%" : "–"}</td><td>${vn(s.brier, 3)}</td></tr>`).join("") + "</tbody>";

  pastChart?.destroy();
  pastChart = new Chart($("fcPast"), {
    type: "line",
    data: {labels: f.recent.map(r => dmy(r.d).slice(0, 5)), datasets: [
      {label: "Thực tế (CAMS)", data: f.recent.map(r => r.obs), borderColor: css("--p2"), borderWidth: 2, pointRadius: 0, tension: .3},
      {label: "Mô hình dự báo trước 1 ngày", data: f.recent.map(r => r.pred), borderColor: css("--sky"), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: .3},
    ]},
    options: {maintainAspectRatio: false, interaction: {mode: "index", intersect: false},
      plugins: {legend: {position: "top", align: "start", labels: {boxWidth: 18, boxHeight: 2}}},
      scales: {x: {ticks: {maxTicksLimit: 8, maxRotation: 0}, grid: {display: false}}, y: {beginAtZero: true, title: {display: true, text: "µg/m³"}}}},
  });

  const mx = Math.max(...f.importance.map(x => Math.abs(x.coef)));
  bars("impBars", f.importance.slice(0, 6).map(x => ({label: x.name, v: Math.abs(x.coef), text: (x.coef > 0 ? "+" : "−") + vn(Math.abs(x.coef), 2)})), mx,
    it => it.text.startsWith("+") ? css("--p3") : css("--sky"));
  $("fcNote").innerHTML = `Mô hình đang dùng thời tiết <i>thực tế</i> của ngày mai (ERA5) thay cho dự báo thời tiết, nên độ chính xác trong thực tế sẽ thấp hơn một chút. ` +
    `"Thực tế" ở đây là giá trị mô hình CAMS, chưa phải trạm đo. Bước tiếp theo là kiểm chứng bằng dữ liệu trạm OpenAQ và chạy dự báo tự động mỗi ngày (xem trang Lộ trình).`;
}

function renderCity(k) { const c = INS.cities[k]; renderC1(c); renderC2(c); renderC3(c); renderC4(c); renderC5(c); renderC6(c); renderC7(c); }

loadInsights().then(() => {
  renderLede(); renderStripes();
  citySeg($("seg"), renderCity);
  renderCity(getCity());
}).catch(() => { $("lede").textContent = "Không tải được dữ liệu lịch sử."; });
