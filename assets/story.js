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

function renderCity(k) { const c = INS.cities[k]; renderC1(c); renderC2(c); renderC3(c); renderC4(c); }

loadInsights().then(() => {
  renderLede(); renderStripes();
  citySeg($("seg"), renderCity);
  renderCity(getCity());
}).catch(() => { $("lede").textContent = "Không tải được dữ liệu lịch sử."; });
