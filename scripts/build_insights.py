"""Tải dữ liệu PM2.5, NO2 và thời tiết lịch sử cho Hà Nội và TP.HCM, tính các chỉ số
và xuất data/insights.json cho trang web.

Chỉ dùng thư viện chuẩn của Python. Chạy:  python scripts/build_insights.py
Nguồn: Open-Meteo Air Quality API (CAMS) và Open-Meteo Historical Weather API (ERA5).
"""

import json
import statistics as st
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

CITIES = {
    "hanoi": {"name": "Hà Nội", "lat": 21.028, "lon": 105.854},
    "hcmc": {"name": "TP. Hồ Chí Minh", "lat": 10.776, "lon": 106.701},
}
START = date(2022, 8, 1)  # dữ liệu CAMS toàn cầu trên Open-Meteo bắt đầu từ đây
END = date.today() - timedelta(days=7)  # ERA5 trễ khoảng 5 ngày
TZ = "Asia/Bangkok"  # GMT+7, trùng giờ Việt Nam

WHO_DAILY = 15.0      # Hướng dẫn WHO 2021, trung bình 24h
SENSITIVE = 35.4      # Ngưỡng US AQI 100 (EPA 2024) - nhóm nhạy cảm bị ảnh hưởng
QCVN_DAILY = 50.0     # QCVN 05:2023/BTNMT, trung bình 24h
CIG = 22.0            # 22 µg/m³ trong 24h ≈ 1 điếu thuốc (Berkeley Earth)
MIN_PM = 2.0          # ngưỡng kiểm soát chất lượng theo giờ (xem analyse())
TET = ["2023-01-22", "2024-02-10", "2025-01-29", "2026-02-17"]  # mùng 1 Tết
DRY = {11, 12, 1, 2, 3, 4}  # mùa khô (miền Bắc: mùa đông xuân)
SECTORS = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"]
WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_URL = "https://archive-api.open-meteo.com/v1/archive"
AQ_VARS = ["pm2_5", "pm10", "nitrogen_dioxide", "carbon_monoxide", "dust"]
WX_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
           "precipitation", "boundary_layer_height"]
OUT = Path(__file__).resolve().parent.parent / "data" / "insights.json"


def get_json(url, params):
    full = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(full, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # mạng chập chờn -> thử lại
            if attempt == 3:
                raise
            print("  thử lại:", e)
            time.sleep(2 * (attempt + 1))


def fetch_hourly(url, lat, lon, variables):
    """Tải theo từng năm để mỗi request không quá lớn. Trả về {time: {var: value}}."""
    rows = {}
    s = START
    while s <= END:
        e = min(date(s.year, 12, 31), END)
        h = get_json(url, {
            "latitude": lat, "longitude": lon, "timezone": TZ, "hourly": ",".join(variables),
            "start_date": s.isoformat(), "end_date": e.isoformat(),
        })["hourly"]
        for i, t in enumerate(h["time"]):
            rows[t] = {v: h[v][i] for v in variables}
        print(f"  {url.split('//')[1].split('.')[0]} {s} → {e}: {len(h['time'])} giờ")
        s = e + timedelta(days=1)
    return rows


def mean(xs, nd=1):
    xs = [x for x in xs if x is not None]
    return round(st.fmean(xs), nd) if xs else None


def pct(part, whole):
    return round(100 * part / whole, 1) if whole else None


def analyse(city):
    print(f"\n== {city['name']} ==")
    aq = fetch_hourly(AQ_URL, city["lat"], city["lon"], AQ_VARS)
    wx = fetch_hourly(WX_URL, city["lat"], city["lon"], WX_VARS)

    hours = []  # các giờ có PM2.5 hợp lệ, đã ghép với thời tiết
    qc_removed = 0
    for t, a in aq.items():
        if a["pm2_5"] is None:
            continue
        # Kiểm soát chất lượng: CAMS có sự cố quanh 13–15/12/2022, PM2.5 rơi xuống ~1 µg/m³ ở mọi điểm.
        # Mức < MIN_PM là phi thực tế với đô thị Việt Nam, nên loại bỏ.
        if a["pm2_5"] < MIN_PM:
            qc_removed += 1
            continue
        w = wx.get(t, {})
        hours.append({
            "d": t[:10], "m": int(t[5:7]), "h": int(t[11:13]),
            "pm": a["pm2_5"], "pm10": a["pm10"], "no2": a["nitrogen_dioxide"],
            "co": a["carbon_monoxide"], "dust": a["dust"],
            "wind": w.get("wind_speed_10m"), "wdir": w.get("wind_direction_10m"),
            "rain": w.get("precipitation"), "blh": w.get("boundary_layer_height"),
        })
    print(f"  {len(hours)} giờ hợp lệ, loại {qc_removed} giờ bất thường")

    # ---------- Theo ngày (chỉ giữ ngày có >= 18 giờ dữ liệu) ----------
    by_day, rain_day = defaultdict(list), defaultdict(float)
    for r in hours:
        by_day[r["d"]].append(r["pm"])
        rain_day[r["d"]] += r["rain"] or 0
    daily = {d: st.fmean(v) for d, v in sorted(by_day.items()) if len(v) >= 18}
    days = list(daily.items())
    n = len(days)
    years = n / 365.25

    # ---------- Theo tháng & heatmap tháng × giờ ----------
    cell = defaultdict(list)
    for r in hours:
        cell[(r["m"], r["h"])].append(r["pm"])
    heatmap = [[mean(cell[(m, h)]) for h in range(24)] for m in range(1, 13)]
    month_days = defaultdict(list)
    for d, v in days:
        month_days[int(d[5:7])].append(v)
    monthly = []
    for m in range(1, 13):
        row = heatmap[m - 1]
        day_h = range(6, 21)  # cửa sổ 2 giờ bắt đầu từ 6h đến 20h
        two = {h: (row[h] + row[h + 1]) / 2 for h in day_h if h + 1 <= 21}
        best = min(two, key=two.get)
        worst = max(two, key=two.get)
        md = month_days[m]
        monthly.append({
            "month": m, "pm": mean(sum((cell[(m, h)] for h in range(24)), [])),
            "who_pct": round(pct(sum(v > WHO_DAILY for v in md), len(md))),
            "sens_pct": round(pct(sum(v > SENSITIVE for v in md), len(md))),
            "qcvn_pct": round(pct(sum(v > QCVN_DAILY for v in md), len(md))),
            "best_h": best, "best_pm": round(two[best], 1),
            "worst_h": worst, "worst_pm": round(two[worst], 1),
        })

    # ---------- Diễn biến trong ngày theo mùa: PM2.5, NO2, BLH ----------
    diurnal = {}
    for season, months in (("dry", DRY), ("wet", set(range(1, 13)) - DRY)):
        rows = [r for r in hours if r["m"] in months]
        diurnal[season] = {
            k: [mean([r[k] for r in rows if r["h"] == h], 0 if k == "blh" else 1) for h in range(24)]
            for k in ("pm", "no2", "blh")
        }
    hourly = [mean([r["pm"] for r in hours if r["h"] == h]) for h in range(24)]

    # ---------- Gió: tốc độ và hướng ----------
    bins = [(0, 5, "< 5"), (5, 10, "5–10"), (10, 15, "10–15"), (15, 20, "15–20"), (20, 999, "≥ 20")]
    wind = []
    for lo, hi, label in bins:
        vals = [r["pm"] for r in hours if r["wind"] is not None and lo <= r["wind"] < hi]
        wind.append({"label": label, "pm": mean(vals), "hours": len(vals)})
    sec = defaultdict(list)
    for r in hours:
        if r["wdir"] is not None and (r["wind"] or 0) >= 3:
            sec[int(((r["wdir"] + 22.5) % 360) // 45)].append(r["pm"])
    total_dir = sum(len(v) for v in sec.values())
    wind_dir = [{"dir": SECTORS[i], "pm": mean(sec[i]), "share": pct(len(sec[i]), total_dir)}
                for i in range(8)]

    # ---------- Mưa ----------
    wet = [v for d, v in days if rain_day[d] >= 1.0]
    dry = [v for d, v in days if rain_day[d] < 1.0]
    after_rain = [daily[d] for d, _ in days
                  if rain_day[(date.fromisoformat(d) - timedelta(days=1)).isoformat()] >= 5.0
                  and (date.fromisoformat(d) - timedelta(days=1)).isoformat() in daily]
    rain = {"wet_pm": mean(wet), "dry_pm": mean(dry), "wet_days": len(wet), "dry_days": len(dry),
            "after_heavy_rain_pm": mean(after_rain), "after_heavy_rain_days": len(after_rain)}

    # ---------- Ngày trong tuần ----------
    wk = defaultdict(list)
    for d, v in days:
        wk[date.fromisoformat(d).weekday()].append(v)
    weekday = [{"day": WEEKDAYS[i], "pm": mean(wk[i])} for i in range(7)]
    weekend = {"weekday_pm": mean(sum((wk[i] for i in range(5)), [])),
               "weekend_pm": mean(wk[5] + wk[6])}

    # ---------- Hiệu ứng Tết ----------
    tet = []
    for t in TET:
        t0 = date.fromisoformat(t)
        holiday = [daily.get((t0 + timedelta(days=k)).isoformat()) for k in range(-3, 4)]
        around = [daily.get((t0 + timedelta(days=k)).isoformat())
                  for k in list(range(-28, -13)) + list(range(14, 29))]
        h, a = mean(holiday), mean(around)
        if h is not None and a is not None:
            tet.append({"year": t0.year, "tet_pm": h, "around_pm": a, "change_pct": round(100 * (h / a - 1))})

    # ---------- Đợt ô nhiễm & tính lì ----------
    episodes, run = [], []
    for d, v in days:
        if v > QCVN_DAILY and run and date.fromisoformat(d) - date.fromisoformat(run[-1][0]) == timedelta(days=1):
            run.append((d, v))
        elif v > QCVN_DAILY:
            run = [(d, v)]
        else:
            run = []
        if len(run) >= 3 and (not episodes or episodes[-1]["start"] != run[0][0]):
            episodes.append({"start": run[0][0], "len": len(run), "peak": 0})
        if episodes and run and episodes[-1]["start"] == run[0][0]:
            episodes[-1].update(len=len(run), end=run[-1][0], peak=round(max(x[1] for x in run), 1))
    ep_months = defaultdict(int)
    for e in episodes:
        ep_months[int(e["start"][5:7])] += 1

    bb = bn = nb = nn = 0
    for (d1, v1), (d2, v2) in zip(days, days[1:]):
        if date.fromisoformat(d2) - date.fromisoformat(d1) != timedelta(days=1):
            continue
        if v1 > QCVN_DAILY:
            bb += v2 > QCVN_DAILY; bn += v2 <= QCVN_DAILY
        else:
            nb += v2 > QCVN_DAILY; nn += v2 <= QCVN_DAILY
    persistence = {"bad_after_bad": pct(bb, bb + bn), "bad_after_ok": pct(nb, nb + nn)}

    # ---------- Theo năm ----------
    year_vals = defaultdict(list)
    for d, v in days:
        year_vals[int(d[:4])].append(v)
    yearly = [{"year": y, "pm": mean(v), "days": len(v)} for y, v in sorted(year_vals.items())]

    mean_pm = mean([v for _, v in days])
    summary = {
        "days": n,
        "hours": len(hours),
        "qc_removed_hours": qc_removed,
        "mean_pm": mean_pm,
        "who_days": sum(v > WHO_DAILY for _, v in days),
        "who_pct": round(pct(sum(v > WHO_DAILY for _, v in days), n)),
        "qcvn_pct": pct(sum(v > QCVN_DAILY for _, v in days), n),
        "sens_days_per_year": round(sum(v > SENSITIVE for _, v in days) / years),
        "qcvn_days_per_year": round(sum(v > QCVN_DAILY for _, v in days) / years),
        "cig_per_day": round(mean_pm / CIG, 1),
        "cig_per_year": round(mean_pm / CIG * 365),
        "no2_mean": mean([r["no2"] for r in hours]),
        "fine_ratio": round(mean([r["pm"] for r in hours if r["pm10"]]) / mean([r["pm10"] for r in hours if r["pm10"]]), 2),
        "worst_days": [{"date": d, "pm": round(v, 1)} for d, v in sorted(days, key=lambda x: -x[1])[:5]],
    }
    return {
        "name": city["name"], "lat": city["lat"], "lon": city["lon"],
        "summary": summary, "monthly": monthly, "heatmap": heatmap, "hourly": hourly,
        "diurnal": diurnal, "wind": wind, "wind_dir": wind_dir, "rain": rain,
        "weekday": weekday, "weekend": weekend, "tet": tet,
        "episodes": {"count": len(episodes), "longest": max(episodes, key=lambda e: e["len"]) if episodes else None,
                     "mean_len": mean([e["len"] for e in episodes]) if episodes else None,
                     "by_month": [ep_months[m] for m in range(1, 13)]},
        "persistence": persistence, "yearly": yearly,
        "daily": [[d, round(v, 1)] for d, v in days],
    }


def vn(x):
    """Định dạng số kiểu Việt Nam: dấu phẩy thập phân."""
    return str(x).replace(".", ",")


def findings(res):
    """Sinh các câu phát hiện chính từ số liệu, theo từng chương của trang."""
    hn, hcm = res["hanoi"], res["hcmc"]
    s, s2 = hn["summary"], hcm["summary"]
    f = {}
    th = lambda x: f"{x:,}".replace(",", ".")
    f["open"] = (f"Trong {th(s['days'])} ngày quan sát, Hà Nội có {th(s['who_days'])} ngày vượt ngưỡng an toàn 24 giờ của WHO. "
                 f"Hít thở không khí Hà Nội trung bình tương đương hút {vn(s['cig_per_day'])} điếu thuốc mỗi ngày, "
                 f"khoảng {s['cig_per_year']} điếu mỗi năm. Ở TP.HCM con số này là {s2['cig_per_year']} điếu.")

    dd = hn["diurnal"]["dry"]
    blh_day = max(dd["blh"]); blh_night = min(dd["blh"][18:] + dd["blh"][:6])
    pm_noon = min(dd["pm"][9:17]); pm_eve = max(dd["pm"][17:24])
    f["evening"] = (f"Mùa khô ở Hà Nội, lớp khí quyển xáo trộn (lớp biên) dày khoảng {blh_day:.0f} m vào buổi trưa, "
                    f"nhưng chỉ còn khoảng {blh_night:.0f} m sau hoàng hôn. Lượng khí thải giờ tan tầm vì thế bị nhốt "
                    f"trong một \"chiếc hộp\" mỏng gấp {blh_day / max(blh_night, 1):.0f} lần, đẩy PM2.5 từ {vn(pm_noon)} lên {vn(pm_eve)} µg/m³. "
                    f"NO₂, chất chỉ dấu của khí thải xe cộ, cũng đạt đỉnh trong cùng khung giờ.")

    w = hn["wind"]
    wd = [x for x in hn["wind_dir"] if x["pm"] is not None and x["share"] >= 3]
    hi_d, lo_d = max(wd, key=lambda x: x["pm"]), min(wd, key=lambda x: x["pm"])
    f["wind"] = (f"Gió quyết định rất nhiều. Ở Hà Nội, khi gió dưới 5 km/h PM2.5 trung bình {vn(w[0]['pm'])} µg/m³, "
                 f"khi gió từ 20 km/h trở lên chỉ còn {vn(w[-1]['pm'])}. Hướng gió cũng quan trọng: gió {hi_d['dir']} "
                 f"đi kèm mức {vn(hi_d['pm'])} µg/m³, còn gió {lo_d['dir']} chỉ {vn(lo_d['pm'])}.")

    r = hn["rain"]
    f["rain"] = (f"Ngày mưa ở Hà Nội trung bình {vn(r['wet_pm'])} µg/m³, ngày khô {vn(r['dry_pm'])}. "
                 f"Sau một ngày mưa to (≥ 5 mm), hôm sau còn {vn(r['after_heavy_rain_pm'])} µg/m³.")

    tet = hn["tet"]
    avg_change = round(st.fmean(t["change_pct"] for t in tet)) if tet else 0
    f["tet"] = ("Tết là một thí nghiệm tự nhiên: thành phố vắng xe hẳn một tuần. Nhưng PM2.5 Hà Nội trong tuần Tết "
                "không giảm đều đặn so với các tuần xung quanh (" +
                ", ".join(f"{t['year']}: {t['change_pct']:+d}%" for t in tet) +
                f", trung bình {avg_change:+d}%). Thời tiết, pháo hoa, hương khói và nguồn bụi từ vùng lân cận "
                "chi phối mạnh hơn lượng xe trong thành phố.")

    p = hn["persistence"]
    ep = hn["episodes"]
    f["persist"] = (f"Ô nhiễm có quán tính: nếu hôm nay Hà Nội vượt QCVN (50 µg/m³) thì {vn(round(p['bad_after_bad']))}% "
                    f"khả năng ngày mai vẫn vượt, so với {vn(round(p['bad_after_ok']))}% khi hôm nay dưới ngưỡng. "
                    f"Có {ep['count']} đợt ô nhiễm kéo dài từ 3 ngày trở lên, đợt dài nhất {ep['longest']['len']} ngày "
                    f"(bắt đầu {'/'.join(reversed(ep['longest']['start'].split('-')))}).")

    we = hn["weekend"]
    f["weekend"] = (f"Cuối tuần ở Hà Nội PM2.5 trung bình {vn(we['weekend_pm'])} µg/m³, ngày thường {vn(we['weekday_pm'])}. "
                    f"Khác biệt này nhỏ, cho thấy bụi không chỉ đến từ giao thông đi làm.")
    return f


def main():
    res = {k: analyse(c) for k, c in CITIES.items()}
    payload = {
        "generated": date.today().isoformat(),
        "period": [START.isoformat(), END.isoformat()],
        "thresholds": {"who_daily": WHO_DAILY, "sensitive": SENSITIVE, "qcvn_daily": QCVN_DAILY, "cig": CIG},
        "cities": res,
        "findings": findings(res),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nĐã ghi {OUT} ({OUT.stat().st_size // 1024} KB)")
    for k, v in payload["findings"].items():
        print(f" • [{k}] {v}")


if __name__ == "__main__":
    main()
