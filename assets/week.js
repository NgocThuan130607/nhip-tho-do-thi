/* Trang Lịch tuần: bảng bụi 7 ngày + tự xếp lịch hoạt động */
renderShell("week");

const PRESETS = {
  run:     {name: "Chạy bộ, tập thể dục", len: 1, from: 5, to: 21, usual: 18},
  kids:    {name: "Cho trẻ chơi ngoài trời", len: 2, from: 7, to: 19, usual: 16},
  market:  {name: "Đi chợ, việc vặt", len: 1, from: 6, to: 20, usual: 17},
  commute: {name: "Đi làm, đi học", len: 1, from: 6, to: 10, usual: 7},
  window:  {name: "Mở cửa sổ thông gió", len: 2, from: 6, to: 22, usual: 19},
  other:   {name: "", len: 1, from: 6, to: 21, usual: -1},
};
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
let CITY = getCity(), GRID = null, ACTS = [], PLAN = [];

const store = {
  load() { try { return JSON.parse(localStorage.getItem("ntdt-acts") || "[]"); } catch (e) { return []; } },
  save() { try { localStorage.setItem("ntdt-acts", JSON.stringify(ACTS)); } catch (e) {} },
};

/* ---------- Form ---------- */
function initForm() {
  const hours = (a, b, sel, extra = "") => extra + Array.from({length: b - a + 1}, (_, i) => a + i)
    .map(h => `<option value="${h}"${h === sel ? " selected" : ""}>${pad(h)}:00</option>`).join("");
  const apply = () => {
    const p = PRESETS[$("aType").value];
    $("nameWrap").hidden = $("aType").value !== "other";
    $("aLen").value = p.len;
    $("aFrom").innerHTML = hours(0, 23, p.from);
    $("aTo").innerHTML = hours(1, 24, p.to);
    $("aUsual").innerHTML = hours(0, 23, p.usual, `<option value="-1"${p.usual < 0 ? " selected" : ""}>Không cố định</option>`);
  };
  $("aType").addEventListener("change", apply);
  apply();
  // Chọn ngày: mặc định cả tuần
  $("aDays").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d =>
    `<label><input type="checkbox" value="${d}" checked><span>${d === 0 ? "Chủ nhật" : "Thứ " + (d + 1)}</span></label>`).join("");
  $("aAdd").addEventListener("click", addActivity);
  $("ics").addEventListener("click", downloadICS);
  $("clear").addEventListener("click", () => { ACTS = []; store.save(); refresh(); });
  $("actsList").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    ACTS = ACTS.filter(a => a.id !== b.dataset.id); store.save(); refresh();
  });
}

function addActivity() {
  const type = $("aType").value;
  const name = type === "other" ? ($("aName").value.trim() || "Hoạt động") : PRESETS[type].name;
  const len = +$("aLen").value, from = +$("aFrom").value, to = +$("aTo").value;
  const days = [...$("aDays").querySelectorAll("input:checked")].map(i => +i.value);
  if (to - from < len) { alert(`Khoảng từ ${from}h đến ${to}h ngắn hơn ${len} giờ. Hãy nới rộng khoảng thời gian.`); return; }
  if (!days.length) { alert("Hãy chọn ít nhất một ngày."); return; }
  ACTS.push({id: Date.now().toString(36), name, len, from, to, usual: +$("aUsual").value, days});
  store.save(); refresh();
  $("summary").scrollIntoView({behavior: "smooth", block: "center"});
}

/* ---------- Dữ liệu bảng ---------- */
function buildGrid(d) {
  const clim = INS.cities[CITY].heatmap;
  const nowH = d.current.time.slice(0, 13);
  const byDay = {};
  d.hourly.time.forEach((t, i) => {
    const day = t.slice(0, 10), h = +t.slice(11, 13);
    const f = d.hourly.pm2_5[i];
    (byDay[day] ||= [])[h] = f != null
      ? {v: f, est: false, past: t.slice(0, 13) < nowH}
      : {v: clim[+day.slice(5, 7) - 1][h], est: true, past: t.slice(0, 13) < nowH};
  });
  return Object.entries(byDay).slice(0, 7).map(([day, hrs]) => ({day, wd: new Date(day + "T12:00").getDay(), hrs}));
}

/* ---------- Xếp lịch ---------- */
function schedule() {
  PLAN = GRID.map(g => ({...g, items: []}));
  for (const day of PLAN) {
    const used = new Set();
    for (const a of ACTS.filter(a => a.days.includes(day.wd))) {
      const avg = s => { let t = 0; for (let h = s; h < s + a.len; h++) t += day.hrs[h].v; return t / a.len; };
      const ok = s => { for (let h = s; h < s + a.len; h++) if (!day.hrs[h] || day.hrs[h].past || used.has(h)) return false; return true; };
      const cands = [];
      for (let s = a.from; s + a.len <= a.to; s++) if (ok(s)) cands.push({s, v: avg(s)});
      if (!cands.length) continue;
      cands.sort((x, y) => x.v - y.v || x.s - y.s);
      const best = cands[0];
      const usualOk = a.usual >= 0 && a.usual + a.len <= 24 && day.hrs[a.usual] && !day.hrs[a.usual].past;
      const ref = usualOk ? {s: a.usual, v: avg(a.usual), kind: "usual"} : {...cands[cands.length - 1], kind: "worst"};
      for (let h = best.s; h < best.s + a.len; h++) used.add(h);
      day.items.push({a, s: best.s, v: best.v, est: day.hrs.slice(best.s, best.s + a.len).some(x => x.est), ref});
    }
    day.items.sort((x, y) => x.s - y.s);
  }
}

/* ---------- Vẽ ---------- */
function renderGrid() {
  const marks = {};
  PLAN.forEach((d, di) => d.items.forEach(it => { for (let h = it.s; h < it.s + it.a.len; h++) marks[di + "-" + h] = it.a.name; }));
  const today = GRID[0].day;
  let html = `<div></div>` + Array.from({length: 24}, (_, h) => `<div class="hh">${h}h</div>`).join("");
  GRID.forEach((g, di) => {
    const label = g.day === today ? "Hôm nay" : fmtWeekday.format(new Date(g.day + "T12:00")).replace(/^\w/, c => c.toUpperCase());
    html += `<div class="dd"><b>${label}</b>${dmy(g.day).slice(0, 5)}</div>`;
    g.hrs.forEach((c, h) => {
      const dark = PM_BINS.indexOf(pmBin(c.v)) >= 3;
      const m = marks[di + "-" + h];
      html += `<div class="c${dark ? " dark" : ""}${c.est ? " est" : ""}${c.past ? " past" : ""}${m ? " act" : ""}" style="background-color:${pmColor(c.v)}"
        title="${label} ${h}:00 · ${vn(c.v, 0)} µg/m³${c.est ? " (ước tính theo lịch sử)" : ""}${m ? " · " + m : ""}">${m ? `<span class="tag">●</span>` : ""}${Math.round(c.v)}</div>`;
    });
  });
  $("grid").innerHTML = html;
  const estFrom = GRID.flatMap(g => g.hrs.map((c, h) => c.est ? `${dmy(g.day).slice(0, 5)} ${h}h` : null)).find(Boolean);
  $("gridNote").innerHTML = `Mỗi ô là PM2.5 dự kiến (µg/m³) trong giờ đó. Ô viền trắng là hoạt động đã được xếp lịch. ` +
    (estFrom ? `Dự báo CAMS chỉ có đến khoảng ${estFrom}. Sau mốc đó, ô có <i>vạch chéo</i> là <b>ước tính theo trung bình nhiều năm</b> của cùng tháng và cùng giờ, nên kém chính xác hơn.` : "");
  $("legend").innerHTML = legendHTML();
}

function renderPlan() {
  $("actsList").innerHTML = ACTS.map(a => `<span class="pill">${a.name} · ${a.len} giờ · ${a.days.length === 7 ? "mỗi ngày" : a.days.map(d => WD[d]).join(", ")}
    <button data-id="${a.id}" aria-label="Xoá ${a.name}">×</button></span>`).join("");
  $("ics").disabled = $("clear").disabled = !ACTS.length;
  if (!ACTS.length) { $("summary").textContent = "Thêm một hoạt động ở Bước 1 để xem lịch."; $("plan").innerHTML = ""; return; }

  const items = PLAN.flatMap(d => d.items);
  const tot = items.reduce((x, i) => x + i.v * i.a.len, 0), ref = items.reduce((x, i) => x + i.ref.v * i.a.len, 0);
  const gain = ref ? Math.round(100 * (1 - tot / ref)) : 0;
  $("summary").innerHTML = items.length
    ? `Lịch tuần có <b>${items.length}</b> lượt hoạt động. Làm theo lịch này, bạn hít ít hơn <b>${gain}%</b> bụi so với ${ACTS.some(a => a.usual >= 0) ? "giờ bạn hay làm" : "khung giờ bụi nhất"}.`
    : "Không còn khung giờ phù hợp trong tuần. Hãy nới rộng khoảng thời gian.";
  const today = GRID[0].day;
  $("plan").innerHTML = PLAN.filter(d => d.items.length).map(d => `<div class="day-plan">
    <div><b style="font-weight:400">${d.day === today ? "Hôm nay" : fmtWeekday.format(new Date(d.day + "T12:00")).replace(/^\w/, c => c.toUpperCase())}</b><div class="small">${dmy(d.day)}</div></div>
    <div>${d.items.map(it => {
      const g = Math.max(0, Math.round(100 * (1 - it.v / it.ref.v)));
      return `<div class="it"><span><span class="sq" style="background:${pmColor(it.v)}"></span> <span class="t">${pad(it.s)}:00–${pad(it.s + it.a.len)}:00</span> · ${it.a.name}
        <span class="small">~${Math.round(it.v)} µg/m³ · ${pmBin(it.v)[3].toLowerCase()}${it.est ? " · ước tính" : ""}</span></span>
        <span class="gain">${g > 0 ? `−${g}% so với ${it.ref.kind === "usual" ? `${pad(it.ref.s)}:00` : "giờ bụi nhất"}` : it.ref.kind === "usual" ? "đúng giờ bạn hay làm" : ""}</span></div>`;
    }).join("")}</div></div>`).join("");
}

function refresh() { if (!GRID) return; schedule(); renderGrid(); renderPlan(); }

/* ---------- Xuất lịch .ics ---------- */
function downloadICS() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev = PLAN.flatMap(d => d.items.map(it => {
    const ymd = d.day.replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:${ymd}-${it.s}-${it.a.id}@nhip-tho-do-thi`, `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${pad(it.s)}0000`, `DTEND:${ymd}T${pad(it.s + it.a.len === 24 ? 23 : it.s + it.a.len)}${it.s + it.a.len === 24 ? "5900" : "0000"}`,
      `SUMMARY:${it.a.name}`, `DESCRIPTION:PM2.5 dự kiến khoảng ${Math.round(it.v)} µg/m³ (${CITIES[CITY].name}). Lịch từ Nhịp Thở Đô Thị.`, "END:VEVENT"].join("\r\n");
  }));
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nhip Tho Do Thi//VI", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], {type: "text/calendar"}));
  Object.assign(document.createElement("a"), {href: url, download: "lich-tuan-it-bui.ics"}).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- Khởi động ---------- */
async function loadCity() {
  try {
    GRID = buildGrid(await loadLive(CITY, 7));
    refresh();
  } catch (e) { $("gridNote").innerHTML = `<span class="err">Không tải được dự báo, hãy thử tải lại trang.</span>`; }
}

ACTS = store.load();
initForm();
loadInsights().then(() => { citySeg($("seg"), k => { CITY = k; loadCity(); }); loadCity(); });
