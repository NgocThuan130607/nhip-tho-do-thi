"""Tải dữ liệu PM2.5 + thời tiết lịch sử cho Hà Nội và TP.HCM, tính các chỉ số
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

WHO_DAILY = 15.0  # Hướng dẫn WHO 2021, trung bình 24h
QCVN_DAILY = 50.0  # QCVN 05:2023/BTNMT, trung bình 24h

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_URL = "https://archive-api.open-meteo.com/v1/archive"
OUT = Path(__file__).resolve().parent.parent / "data" / "insights.json"


def get_json(url, params):
    full = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(full, timeout=60) as r:
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
        data = get_json(url, {
            "latitude": lat, "longitude": lon, "timezone": TZ,
            "hourly": ",".join(variables),
            "start_date": s.isoformat(), "end_date": e.isoformat(),
        })
        h = data["hourly"]
        for i, t in enumerate(h["time"]):
            rows.setdefault(t, {})
            for v in variables:
                rows[t][v] = h[v][i]
        print(f"  {url.split('//')[1].split('.')[0]} {s} → {e}: {len(h['time'])} giờ")
        s = e + timedelta(days=1)
    return rows


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(st.fmean(xs), 1) if xs else None


def analyse(key, city):
    print(f"\n== {city['name']} ==")
    aq = fetch_hourly(AQ_URL, city["lat"], city["lon"], ["pm2_5", "pm10", "us_aqi"])
    wx = fetch_hourly(WX_URL, city["lat"], city["lon"],
                      ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation"])

    hours = []  # các giờ có PM2.5 hợp lệ, đã ghép với thời tiết
    for t, a in aq.items():
        if a.get("pm2_5") is None:
            continue
        w = wx.get(t, {})
        hours.append({
            "t": t, "d": t[:10], "m": int(t[5:7]), "h": int(t[11:13]), "y": int(t[:4]),
            "pm": a["pm2_5"], "wind": w.get("wind_speed_10m"),
            "rain": w.get("precipitation"), "rh": w.get("relative_humidity_2m"),
        })
    print(f"  {len(hours)} giờ hợp lệ")

    # --- Theo ngày (chỉ giữ ngày có >= 18 giờ dữ liệu) ---
    by_day = defaultdict(list)
    rain_day = defaultdict(float)
    for r in hours:
        by_day[r["d"]].append(r["pm"])
        if r["rain"] is not None:
            rain_day[r["d"]] += r["rain"]
    daily = {d: st.fmean(v) for d, v in sorted(by_day.items()) if len(v) >= 18}
    days = list(daily.items())
    n = len(days)

    # --- Theo tháng ---
    month_vals = defaultdict(list)
    month_days = defaultdict(list)
    for d, v in days:
        month_days[int(d[5:7])].append(v)
    for r in hours:
        month_vals[r["m"]].append(r["pm"])
    monthly = [{
        "month": m,
        "pm": mean(month_vals[m]),
        "who_pct": round(100 * sum(v > WHO_DAILY for v in month_days[m]) / len(month_days[m]))
        if month_days[m] else None,
    } for m in range(1, 13)]

    # --- Heatmap tháng × giờ ---
    cell = defaultdict(list)
    for r in hours:
        cell[(r["m"], r["h"])].append(r["pm"])
    heatmap = [[mean(cell[(m, h)]) for h in range(24)] for m in range(1, 13)]
    hourly = [mean([r["pm"] for r in hours if r["h"] == h]) for h in range(24)]

    # --- Thời tiết ---
    bins = [(0, 5, "< 5"), (5, 10, "5–10"), (10, 15, "10–15"), (15, 20, "15–20"), (20, 999, "≥ 20")]
    wind = []
    for lo, hi, label in bins:
        vals = [r["pm"] for r in hours if r["wind"] is not None and lo <= r["wind"] < hi]
        wind.append({"label": label, "pm": mean(vals), "hours": len(vals)})
    wet = [v for d, v in days if rain_day.get(d, 0) >= 1.0]
    dry = [v for d, v in days if rain_day.get(d, 0) < 1.0]
    rain = {"wet_pm": mean(wet), "dry_pm": mean(dry), "wet_days": len(wet), "dry_days": len(dry)}

    # --- Theo năm (chỉ năm đủ dữ liệu) ---
    year_vals = defaultdict(list)
    for d, v in days:
        year_vals[int(d[:4])].append(v)
    yearly = [{"year": y, "pm": mean(v), "days": len(v)} for y, v in sorted(year_vals.items())]

    worst = sorted(days, key=lambda x: -x[1])[:5]
    summary = {
        "days": n,
        "mean_pm": mean([v for _, v in days]),
        "who_pct": round(100 * sum(v > WHO_DAILY for _, v in days) / n),
        "qcvn_pct": round(100 * sum(v > QCVN_DAILY for _, v in days) / n, 1),
        "worst_days": [{"date": d, "pm": round(v, 1)} for d, v in worst],
    }
    return {
        "name": city["name"], "lat": city["lat"], "lon": city["lon"],
        "summary": summary, "monthly": monthly, "heatmap": heatmap, "hourly": hourly,
        "wind": wind, "rain": rain, "yearly": yearly,
        "daily": [[d, round(v, 1)] for d, v in days],
    }


def findings(res):
    """Sinh vài câu phát hiện chính bằng tiếng Việt từ số liệu."""
    hn, hcm = res["hanoi"], res["hcmc"]
    out = []
    ratio = hn["summary"]["mean_pm"] / hcm["summary"]["mean_pm"]
    out.append(
        f"Trung bình PM2.5 ở Hà Nội là {hn['summary']['mean_pm']} µg/m³, cao gấp "
        f"{ratio:.1f} lần TP.HCM ({hcm['summary']['mean_pm']} µg/m³) và gấp "
        f"{hn['summary']['mean_pm'] / 5:.0f} lần mức khuyến nghị trung bình năm của WHO (5 µg/m³)."
    )
    worst_m = max(hn["monthly"], key=lambda x: x["pm"])
    best_m = min(hn["monthly"], key=lambda x: x["pm"])
    out.append(
        f"Không có tháng nào thật sự an toàn: {hn['summary']['who_pct']}% số ngày ở Hà Nội và "
        f"{hcm['summary']['who_pct']}% ở TP.HCM vượt ngưỡng 24h của WHO. Tính theo chuẩn Việt Nam "
        f"(QCVN 05:2023, 50 µg/m³) thì Hà Nội vượt {hn['summary']['qcvn_pct']}% số ngày, TP.HCM "
        f"{hcm['summary']['qcvn_pct']}%. Tháng nặng nhất ở Hà Nội là tháng {worst_m['month']} "
        f"({worst_m['pm']} µg/m³), nhẹ nhất là tháng {best_m['month']} ({best_m['pm']} µg/m³)."
    )
    for c in (hn,):
        h = c["hourly"]
        day_h = list(range(6, 22))
        lo = min(day_h, key=lambda i: h[i])
        hi = max(range(24), key=lambda i: h[i])
        out.append(
            f"Trong ngày, PM2.5 ở {c['name']} thường thấp nhất khoảng {lo}h (trong khung 6h–21h) "
            f"và cao nhất khoảng {hi}h. Chọn đúng giờ ra ngoài có thể giảm "
            f"{100 * (1 - h[lo] / h[hi]):.0f}% lượng bụi hít vào."
        )
    w = [x for x in hn["wind"] if x["pm"] is not None]
    out.append(
        f"Gió là yếu tố làm sạch không khí: ở Hà Nội, khi gió dưới 5 km/h PM2.5 trung bình "
        f"{w[0]['pm']} µg/m³, khi gió từ 20 km/h trở lên chỉ còn {w[-1]['pm']} µg/m³. "
        f"Ngày mưa trung bình {hn['rain']['wet_pm']} µg/m³ so với {hn['rain']['dry_pm']} µg/m³ ngày khô."
    )
    return out


def main():
    res = {k: analyse(k, c) for k, c in CITIES.items()}
    payload = {
        "generated": date.today().isoformat(),
        "period": [START.isoformat(), END.isoformat()],
        "thresholds": {"who_daily": WHO_DAILY, "qcvn_daily": QCVN_DAILY},
        "cities": res,
        "findings": findings(res),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nĐã ghi {OUT} ({OUT.stat().st_size // 1024} KB)")
    for f in payload["findings"]:
        print(" •", f)


if __name__ == "__main__":
    main()
