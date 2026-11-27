/* Trang công cụ */
renderShell("tools");
let CITY = getCity();

function calcExposure() {
  if (!INS) return;
  const c = INS.cities[CITY], g = id => $(id).value, hrs = +g("hrs");
  $("hrsOut").textContent = vn(hrs);
  const mine = {hrs, when: g("when"), mode: +g("mode"), mask: +g("mask"), indoor: +g("indoor")};
  // Mốc so sánh: cùng số giờ và phương tiện, nhưng ra ngoài chiều tối, không khẩu trang, nhà mở cửa
  const none = doseFor(c, {...mine, when: "eve", mask: 1, indoor: 0.7});
  const now = doseFor(c, mine);
  const best = doseFor(c, {...mine, when: "mid", mask: 0.25, indoor: 0.3});
  const pct = x => Math.max(0, Math.round(100 * (1 - x / none)));
  const saved = pct(now), max = pct(best);

  $("cigNone").textContent = vn(cigYear(none), 0);
  $("cigNow").textContent = vn(cigYear(now), 0);
  $("cigSave").textContent = saved + "%";
  $("saveNote").textContent = saved ? `tức khoảng ${vn(cigYear(none) - cigYear(now), 0)} điếu thuốc mỗi năm` : "chưa có biện pháp nào được chọn";
  $("barNow").style.width = saved + "%";
  $("barMax").style.width = max + "%";
  $("maxNote").textContent = `Tối đa có thể tránh: ${max}%`;

  // Gợi ý: mỗi việc còn chưa làm giúp tránh thêm bao nhiêu
  const options = [
    ["Ra ngoài vào giữa ngày (10–15h)", {when: "mid"}, mine.when === "mid"],
    ["Đeo khẩu trang N95 đeo kín", {mask: 0.25}, mine.mask === 0.25],
    ["Dùng máy lọc không khí trong nhà", {indoor: 0.3}, mine.indoor === 0.3],
  ].filter(o => !o[2]).map(([t, ch]) => ({t, gain: pct(doseFor(c, {...mine, ...ch})) - saved}))
   .filter(o => o.gain > 0).sort((a, b) => b.gain - a.gain);
  $("tips").innerHTML = options.length
    ? `<div class="label" style="margin-bottom:6px">Làm thêm để tránh nhiều hơn</div>` + options.map(o =>
        `<div class="bar" style="grid-template-columns:minmax(0,260px) 1fr 60px"><span>${o.t}</span><span class="track"><span class="fill" style="width:${o.gain}%;background:var(--sky-2)"></span></span><span class="v">+${o.gain}%</span></div>`).join("")
    : `<p class="small" style="color:var(--sky-2)">Bạn đang áp dụng tất cả biện pháp. Đây là mức bảo vệ tốt nhất.</p>`;
}

function renderCalendar() {
  $("calBody").innerHTML = INS.cities[CITY].monthly.map(m => `<tr class="${m.month === curMonth ? "cur" : ""}">
    <td>Tháng ${m.month}</td>
    <td class="t"><span class="sq" style="background:${pmColor(m.best_pm)}"></span> ${pad(m.best_h)}–${pad(m.best_h + 2)}h <span class="small">~${Math.round(m.best_pm)}</span></td>
    <td><span class="sq" style="background:${pmColor(m.worst_pm)}"></span> ${pad(m.worst_h)}–${pad(m.worst_h + 2)}h <span class="small">~${Math.round(m.worst_pm)}</span></td>
    <td><span class="mini" style="width:${m.qcvn_pct}px;background:var(--p3)"></span>${m.qcvn_pct}%</td></tr>`).join("");
}

["hrs", "when", "mode", "mask", "indoor"].forEach(id => $(id).addEventListener("input", calcExposure));
loadInsights().then(() => {
  citySeg($("seg"), k => { CITY = k; calcExposure(); renderCalendar(); });
  calcExposure(); renderCalendar();
});
