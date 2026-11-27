/* Trang công cụ */
renderShell("tools");
let CITY = getCity(), fcChart;

function calcExposure() {
  if (!INS) return;
  const c = INS.cities[CITY], g = id => $(id).value, hrs = +g("hrs");
  $("hrsOut").textContent = vn(hrs);
  const now = doseFor(c, {hrs, when: g("when"), mode: +g("mode"), mask: +g("mask"), indoor: +g("indoor")});
  const best = doseFor(c, {hrs, when: "mid", mode: +g("mode"), mask: 0.25, indoor: 0.3});
  $("cigNow").textContent = vn(cigYear(now), 0);
  $("cigBest").textContent = vn(cigYear(best), 0);
  $("cigSave").textContent = Math.max(0, Math.round(100 * (1 - best / now))) + "%";
}

function renderPlan() {
  const d = live[CITY], body = $("planBody");
  if (!d) { body.innerHTML = `<tr><td colspan="4" class="err">Chưa tải được dự báo, hãy thử tải lại trang.</td></tr>`; return; }
  const len = +$("act").value;
  body.innerHTML = windows(d, len).map(w => `<tr><td>${fmtDay.format(new Date(w.day + "T12:00"))}</td>
    <td class="t"><span class="sq" style="background:${pmColor(w.best.avg)}"></span> ${pad(w.best.start)}:00–${pad(w.best.start + len)}:00 <span class="small">~${Math.round(w.best.avg)} µg/m³</span></td>
    <td><span class="sq" style="background:${pmColor(w.worst.avg)}"></span> ${pad(w.worst.start)}:00–${pad(w.worst.start + len)}:00 <span class="small">~${Math.round(w.worst.avg)}</span></td>
    <td><b>−${Math.round(100 * (1 - w.best.avg / w.worst.avg))}%</b></td></tr>`).join("");
  const fut = futureHours(d);
  fcChart?.destroy();
  fcChart = new Chart($("fcChart"), {
    type: "bar",
    data: {labels: fut.map(x => `${x.t.slice(8, 10)}/${x.t.slice(5, 7)} ${x.h}h`),
      datasets: [{data: fut.map(x => x.v), backgroundColor: fut.map(x => pmColor(x.v)), borderRadius: 2, barPercentage: .9, categoryPercentage: 1}]},
    options: {maintainAspectRatio: false, plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `${vn(c.raw)} µg/m³`}}},
      scales: {x: {ticks: {maxTicksLimit: 6, maxRotation: 0}, grid: {display: false}}, y: {beginAtZero: true}}},
  });
}

function renderCalendar() {
  $("calBody").innerHTML = INS.cities[CITY].monthly.map(m => `<tr class="${m.month === curMonth ? "cur" : ""}">
    <td>Tháng ${m.month}</td>
    <td class="t"><span class="sq" style="background:${pmColor(m.best_pm)}"></span> ${pad(m.best_h)}–${pad(m.best_h + 2)}h <span class="small">~${Math.round(m.best_pm)}</span></td>
    <td><span class="sq" style="background:${pmColor(m.worst_pm)}"></span> ${pad(m.worst_h)}–${pad(m.worst_h + 2)}h <span class="small">~${Math.round(m.worst_pm)}</span></td>
    <td><span class="mini" style="width:${m.qcvn_pct}px;background:var(--p3)"></span>${m.qcvn_pct}%</td></tr>`).join("");
}

function renderAll() {
  calcExposure(); renderCalendar();
  loadLive(CITY).then(renderPlan).catch(renderPlan);
}

["hrs", "when", "mode", "mask", "indoor"].forEach(id => $(id).addEventListener("input", calcExposure));
$("act").addEventListener("change", renderPlan);
loadInsights().then(() => { citySeg($("seg"), k => { CITY = k; renderAll(); }); renderAll(); });
