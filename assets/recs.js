/* Trang khuyến nghị */
renderShell("recs");

function renderRecs(k) {
  const c = INS.cities[k], s = c.summary, m = c.monthly, h = c.hourly, d = c.diurnal.dry;
  const lo = [...Array(16).keys()].map(i => i + 6).reduce((a, b) => h[b] < h[a] ? b : a);
  const eveHi = [...Array(7).keys()].map(i => i + 17).reduce((a, b) => h[b] > h[a] ? b : a);
  const maskMonths = [...m].sort((a, b) => b.qcvn_pct - a.qcvn_pct).slice(0, 4).filter(x => x.qcvn_pct >= 15).map(x => x.month).sort((a, b) => a - b);
  const sensMonths = m.filter(x => x.sens_pct >= 50).map(x => x.month);
  const sensText = sensMonths.length >= 10 ? ", gần như quanh năm." : sensMonths.length ? `, dồn vào tháng ${sensMonths.join(", ")}.` : ".";
  const ep = c.episodes, p = c.persistence;
  const topEp = ep.by_month.map((v, i) => [v, i + 1]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]).sort((a, b) => a - b);
  const tetAvg = Math.round(c.tet.reduce((a, t) => a + t.change_pct, 0) / c.tet.length);
  const personal = [
    ["Tập thể dục giữa ngày, không phải buổi tối",
     `Dời giờ chạy bộ sang khoảng ${lo}h–${lo + 2}h thay vì ${eveHi}h giúp giảm khoảng ${Math.round(100 * (1 - h[lo] / h[eveHi]))}% lượng bụi hít vào.`,
     `PM2.5 trung bình lúc ${lo}h là ${vn(h[lo])} µg/m³, lúc ${eveHi}h là ${vn(h[eveHi])} µg/m³.`],
    ["Mở cửa sổ buổi trưa, đóng cửa sổ từ chiều tối",
     "Thông gió nhà vào khoảng 11h–15h, khi lớp không khí dày nhất. Đóng cửa sổ phía mặt đường từ khoảng 17h đến sáng hôm sau.",
     `Mùa khô, lớp biên ban trưa dày khoảng ${vn(Math.max(...d.blh), 0)} m, ban đêm chỉ khoảng ${vn(Math.min(...d.blh.slice(18)), 0)} m.`],
    ["Đeo khẩu trang N95 khi đi xe máy trong các tháng cao điểm",
     maskMonths.length ? `Đặc biệt trong tháng ${maskMonths.join(", ")}. Khẩu trang vải hầu như không lọc được PM2.5.` : "Đặc biệt vào những ngày PM2.5 trên 50 µg/m³.",
     `Đây là những tháng có tỉ lệ ngày vượt chuẩn Việt Nam 50 µg/m³ cao nhất (${maskMonths.map(x => m[x - 1].qcvn_pct + "%").join(", ")}).`],
    ["Máy lọc không khí cho phòng ngủ của người nhạy cảm",
     `Trẻ nhỏ, người già, người có bệnh hô hấp hay tim mạch cần được bảo vệ khoảng ${s.sens_days_per_year} ngày mỗi năm${sensText}`,
     `Số ngày có trung bình 24h vượt 35,4 µg/m³ (mức "kém với người nhạy cảm" của US EPA).`],
    ["Một ngày xấu, chuẩn bị cho cả tuần",
     "Khi PM2.5 hôm nay vượt 50 µg/m³, hãy lên kế hoạch cho 2–3 ngày tới, như dời buổi dã ngoại hay chuẩn bị khẩu trang cho con đi học.",
     `Có ${vn(p.bad_after_bad, 0)}% khả năng ngày mai vẫn vượt ngưỡng, so với ${vn(p.bad_after_ok, 0)}% bình thường.`],
  ];
  const pub = [
    ["Ưu tiên cắt giảm phát thải khung 17h–22h",
     `Điều tiết xe tải, công trường và lò đốt rác vào buổi tối, khi khí quyển "đóng nắp", để mỗi tấn khí thải cắt được có tác dụng lớn nhất.`,
     `NO₂ đạt đỉnh khoảng ${d.no2.indexOf(Math.max(...d.no2))}h, PM2.5 buổi tối cao hơn buổi trưa khoảng ${Math.round(100 * (Math.max(...d.pm.slice(17)) / Math.min(...d.pm.slice(9, 17)) - 1))}%.`],
    ["Kích hoạt ứng phó ngay từ ngày đầu tiên vượt ngưỡng",
     `Thông báo sớm qua Zalo, loa phường và trường học, tập trung vào tháng ${topEp.join(" và ")} khi các đợt ô nhiễm hay bắt đầu nhất.`,
     `${ep.count} đợt kéo dài từ 3 ngày trở lên kể từ 2022, đợt dài nhất ${ep.longest ? ep.longest.len : "–"} ngày.`],
    ["Trường học dời giờ thể dục ngoài trời sang giữa ngày",
     `Trong các tháng cao điểm, giờ thể dục và ra chơi ngoài trời nên đặt vào khoảng ${lo}h–${lo + 2}h, tránh đầu giờ sáng và cuối giờ chiều.`,
     "Theo lịch tháng ở trang Công cụ, khung sạch nhất mỗi tháng đều nằm quanh giữa trưa."],
    ["Hợp tác vùng, không chỉ hạn chế xe trong nội đô",
     "Kiểm soát đốt rơm rạ, đốt rác và các nguồn công nghiệp ở các tỉnh lân cận, nhất là vào mùa khô.",
     `Tuần Tết vắng xe nhưng PM2.5 thay đổi trung bình ${tetAvg > 0 ? "+" : ""}${tetAvg}%, nên giao thông không phải nguồn duy nhất.`],
    ["Công khai dữ liệu trạm đo theo thời gian thực",
     "Mở API dữ liệu quan trắc để cộng đồng và doanh nghiệp xây những công cụ như trang này, với độ chính xác đến từng quận.",
     "Hiện các phân tích mở vẫn phải dựa vào mô hình toàn cầu với độ phân giải khoảng 40 km."],
  ];
  const tpl = arr => arr.map((r, i) => `<div class="rec"><span class="n">${pad(i + 1)}</span><div><h4>${r[0]}</h4><p>${r[1]}</p><span class="why">Căn cứ: ${r[2]}</span></div></div>`).join("");
  $("recsPersonal").innerHTML = tpl(personal);
  $("recsPublic").innerHTML = tpl(pub);
}

loadInsights().then(() => { citySeg($("seg"), renderRecs); renderRecs(getCity()); })
  .catch(() => { $("recsPersonal").innerHTML = `<p class="err">Không tải được dữ liệu.</p>`; });
