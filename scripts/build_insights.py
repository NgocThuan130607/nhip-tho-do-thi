"""Tải dữ liệu PM2.5, NO2 và thời tiết lịch sử cho Hà Nội và TP.HCM, tính các chỉ số
và xuất data/insights.json cho trang web.

Chỉ dùng thư viện chuẩn của Python. Chạy:  python scripts/build_insights.py
Nguồn: Open-Meteo Air Quality API (CAMS) và Open-Meteo Historical Weather API (ERA5).
"""

import hashlib
import json
import math
import random
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


CACHE = Path(__file__).resolve().parent.parent / ".cache"


def fetch_hourly(url, lat, lon, variables):
    """Tải theo từng năm để mỗi request không quá lớn. Trả về {time: {var: value}}.
    Kết quả được lưu đệm trong .cache/ (không đưa lên git) để chạy lại nhanh trong cùng ngày."""
    key = hashlib.md5(f"{url}{lat}{lon}{variables}{START}{END}".encode()).hexdigest()
    cf = CACHE / f"{key}.json"
    if cf.exists():
        return json.loads(cf.read_text(encoding="utf-8"))
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
    CACHE.mkdir(exist_ok=True)
    cf.write_text(json.dumps(rows), encoding="utf-8")
    return rows


# ================= Thống kê tự viết (chỉ dùng thư viện chuẩn) =================
def solve(A, b):
    """Giải hệ A x = b bằng khử Gauss có chọn trụ."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        if abs(M[c][c]) < 1e-12:
            continue
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] if abs(M[i][i]) > 1e-12 else 0.0 for i in range(n)]


def ols(X, y, ridge=1e-6):
    """Hồi quy tuyến tính bình phương tối thiểu (X đã có cột hằng số)."""
    k = len(X[0])
    XtX = [[sum(r[i] * r[j] for r in X) + (ridge if i == j and i > 0 else 0) for j in range(k)] for i in range(k)]
    Xty = [sum(r[i] * yy for r, yy in zip(X, y)) for i in range(k)]
    return solve(XtX, Xty)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def r2(y, yhat):
    my = st.fmean(y)
    ss_tot = sum((v - my) ** 2 for v in y)
    return 1 - sum((v - p) ** 2 for v, p in zip(y, yhat)) / ss_tot


def standardize(rows, stats=None):
    """Chuẩn hoá từng cột (trừ cột hằng số đầu tiên)."""
    k = len(rows[0])
    if stats is None:
        stats = [(0.0, 1.0)] + [(st.fmean(r[j] for r in rows), st.pstdev([r[j] for r in rows]) or 1.0) for j in range(1, k)]
    return [[r[0]] + [(r[j] - stats[j][0]) / stats[j][1] for j in range(1, k)] for r in rows], stats


def logistic(X, y, iters=4000, lr=0.2, l2=1e-3):
    """Hồi quy logistic bằng gradient descent."""
    w = [0.0] * len(X[0])
    n = len(X)
    for _ in range(iters):
        g = [0.0] * len(w)
        for r, t in zip(X, y):
            p = 1 / (1 + math.exp(-max(-30, min(30, dot(w, r)))))
            for j, x in enumerate(r):
                g[j] += (p - t) * x
        w = [wj - lr * (gj / n + (l2 * wj if j else 0)) for j, (wj, gj) in enumerate(zip(w, g))]
    return w


def sigmoid(z):
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


def boot_ratio(a, b, n=1000, seed=42):
    """Khoảng tin cậy 95% (bootstrap) cho mean(a)/mean(b) - 1, tính bằng %."""
    rnd = random.Random(seed)
    est = st.fmean(a) / st.fmean(b) - 1
    sims = sorted(st.fmean(rnd.choices(a, k=len(a))) / st.fmean(rnd.choices(b, k=len(b))) - 1 for _ in range(n))
    lo, hi = sims[int(0.025 * n)], sims[int(0.975 * n) - 1]
    return {"est": round(100 * est, 1), "lo": round(100 * lo, 1), "hi": round(100 * hi, 1),
            "significant": lo > 0 or hi < 0, "n_a": len(a), "n_b": len(b)}


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
            "temp": w.get("temperature_2m"), "rh": w.get("relative_humidity_2m"),
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

    adv = advanced(hours, daily, rain_day, wk, QCVN_DAILY if city["name"] == "Hà Nội" else SENSITIVE)

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
        "persistence": persistence, "yearly": yearly, "advanced": adv,
        "daily": [[d, round(v, 1)] for d, v in days],
    }


FEATURE_NAMES = ["PM2.5 hôm nay", "Độ cao lớp biên", "Tốc độ gió", "Hướng gió (Đông–Tây)", "Hướng gió (Bắc–Nam)",
                 "Mưa", "Độ ẩm", "Nhiệt độ", "Mùa (sin)", "Mùa (cos)"]


def advanced(hours, daily, rain_day, wk, thr):
    """Phân tích nâng cao: loại bỏ ảnh hưởng thời tiết, hoa gió, dấu vân tay nguồn,
    khoảng tin cậy bootstrap và mô hình dự báo ngày mai."""
    # ---- Thời tiết theo ngày ----
    agg = defaultdict(lambda: defaultdict(list))
    for r in hours:
        a = agg[r["d"]]
        for k in ("blh", "wind", "rh", "temp", "co", "no2", "pm10", "dust", "pm"):
            if r[k] is not None:
                a[k].append(r[k])
        if r["wdir"] is not None:
            a["s"].append(math.sin(math.radians(r["wdir"])))
            a["c"].append(math.cos(math.radians(r["wdir"])))
    wx = {}
    for d in daily:
        a = agg[d]
        if all(a[k] for k in ("blh", "wind", "rh", "temp", "s")):
            wx[d] = [math.log(st.fmean(a["blh"]) + 1), st.fmean(a["wind"]), st.fmean(a["s"]), st.fmean(a["c"]),
                     math.log1p(rain_day[d]), st.fmean(a["rh"]), st.fmean(a["temp"])]
    ds = sorted(wx)

    # ---- A1: loại bỏ ảnh hưởng thời tiết (deweathering) ----
    def design(d, months=True):
        row = [1.0] + wx[d]
        if months:
            row += [1.0 if int(d[5:7]) == m else 0.0 for m in range(2, 13)]
        return row
    y = [math.log(daily[d]) for d in ds]
    X = [design(d) for d in ds]
    b = ols(X, y)
    yhat = [dot(b, r) for r in X]
    Xw = [design(d, False) for d in ds]
    bw = ols(Xw, y)
    resid = defaultdict(list)
    raw = defaultdict(list)
    overall = st.fmean(y)
    for d, yy, p in zip(ds, y, yhat):
        resid[d[:4]].append(yy - p)
        raw[d[:4]].append(yy - overall)
    deweather = {
        "r2": round(r2(y, yhat), 3),
        "r2_weather_only": round(r2(y, [dot(bw, r) for r in Xw]), 3),
        "wind5_pct": round(100 * (math.exp(5 * b[2]) - 1), 1),       # gió mạnh thêm 5 km/h
        "blh_double_pct": round(100 * (2 ** b[1] - 1), 1),            # lớp biên dày gấp đôi
        "rain_pct": round(100 * (math.exp(b[5] * math.log1p(10)) - 1), 1),  # mưa 10 mm so với không mưa
        "years": [{"year": int(yr), "n": len(resid[yr]),
                   "raw_pct": round(100 * (math.exp(st.fmean(raw[yr])) - 1), 1),
                   "adj_pct": round(100 * (math.exp(st.fmean(resid[yr])) - 1), 1)} for yr in sorted(resid)],
    }

    # ---- A2: hoa gió ô nhiễm ----
    speed_bins = [(0, 5), (5, 10), (10, 20), (20, 999)]
    cells = defaultdict(list)
    tot = 0
    for r in hours:
        if r["wdir"] is None or r["wind"] is None:
            continue
        s = int(((r["wdir"] + 22.5) % 360) // 45)
        k = next(i for i, (lo, hi) in enumerate(speed_bins) if lo <= r["wind"] < hi)
        cells[(s, k)].append(r["pm"])
        tot += 1
    rose = [[{"freq": round(100 * len(cells[(s, k)]) / tot, 2), "pm": mean(cells[(s, k)])} for k in range(4)] for s in range(8)]

    # ---- A3: dấu vân tay nguồn bụi theo tháng ----
    fp = []
    for m in range(1, 13):
        rs = [r for r in hours if r["m"] == m and r["pm10"] and r["no2"] and r["co"] is not None and r["dust"] is not None]
        fp.append({"month": m,
                   "fine": round(sum(r["pm"] for r in rs) / sum(r["pm10"] for r in rs), 3),
                   "co_no2": round(sum(r["co"] for r in rs) / sum(r["no2"] for r in rs), 1),
                   "dust_pct": round(100 * sum(r["dust"] for r in rs) / sum(r["pm10"] for r in rs), 1)})

    # ---- A4: khoảng tin cậy bootstrap ----
    hol, around = [], []
    for t in TET:
        t0 = date.fromisoformat(t)
        hol += [daily[x] for x in ((t0 + timedelta(days=k)).isoformat() for k in range(-3, 4)) if x in daily]
        around += [daily[x] for x in ((t0 + timedelta(days=k)).isoformat() for k in list(range(-28, -13)) + list(range(14, 29))) if x in daily]
    weekday_v = sum((wk[i] for i in range(5)), [])
    weekend_v = wk[5] + wk[6]
    wet = [v for d, v in daily.items() if rain_day[d] >= 1.0]
    dry = [v for d, v in daily.items() if rain_day[d] < 1.0]
    ci = {"tet": boot_ratio(hol, around), "weekend": boot_ratio(weekend_v, weekday_v), "rain": boot_ratio(wet, dry)}

    # ---- A5: dự báo ngày mai ----
    samples = []
    for d in ds:
        d1 = (date.fromisoformat(d) + timedelta(days=1)).isoformat()
        if d1 in wx:
            doy = date.fromisoformat(d1).timetuple().tm_yday
            samples.append((d1, [1.0, math.log(daily[d])] + wx[d1] +
                            [math.sin(2 * math.pi * doy / 365.25), math.cos(2 * math.pi * doy / 365.25)],
                            daily[d1], daily[d]))
    train = [s for s in samples if s[0] < "2026-01-01"]
    test = [s for s in samples if s[0] >= "2026-01-01"]
    Xtr, stats = standardize([s[1] for s in train])
    Xte, _ = standardize([s[1] for s in test], stats)
    ytr_c = [1.0 if s[2] > thr else 0.0 for s in train]
    yte_c = [1.0 if s[2] > thr else 0.0 for s in test]
    w = logistic(Xtr, ytr_c, iters=1500, lr=0.3)
    p_model = [sigmoid(dot(w, r)) for r in Xte]
    month_rate = defaultdict(list)
    for s, t in zip(train, ytr_c):
        month_rate[s[0][5:7]].append(t)
    p_clim = [st.fmean(month_rate[s[0][5:7]]) for s in test]
    p_pers = [1.0 if s[3] > thr else 0.0 for s in test]
    p_no = [0.0] * len(test)

    def scores(p):
        tp = sum(1 for a, t in zip(p, yte_c) if a >= .5 and t)
        fn = sum(1 for a, t in zip(p, yte_c) if a < .5 and t)
        fpos = sum(1 for a, t in zip(p, yte_c) if a >= .5 and not t)
        return {"acc": round(100 * sum((a >= .5) == bool(t) for a, t in zip(p, yte_c)) / len(p), 1),
                "brier": round(st.fmean((a - t) ** 2 for a, t in zip(p, yte_c)), 3),
                "hit": round(100 * tp / (tp + fn), 1) if tp + fn else None,
                "false_alarm": round(100 * fpos / (tp + fpos), 1) if tp + fpos else None}

    # Hồi quy giá trị ngày mai (log) so với "mai giống hôm nay"
    breg = ols(Xtr, [math.log(s[2]) for s in train])
    pred = [math.exp(dot(breg, r)) for r in Xte]
    mae_model = st.fmean(abs(p - s[2]) for p, s in zip(pred, test))
    mae_pers = st.fmean(abs(s[3] - s[2]) for s in test)
    mclim = defaultdict(list)
    for s in train:
        mclim[s[0][5:7]].append(s[2])
    mae_clim = st.fmean(abs(st.fmean(mclim[s[0][5:7]]) - s[2]) for s in test)
    importance = sorted(({"name": n, "coef": round(c, 3)} for n, c in zip(FEATURE_NAMES, breg[1:])),
                        key=lambda x: -abs(x["coef"]))
    forecast = {
        "threshold": thr, "train_days": len(train), "test_days": len(test),
        "test_from": test[0][0] if test else None, "test_to": test[-1][0] if test else None,
        "base_rate": round(100 * st.fmean(yte_c), 1) if test else None,
        "cls": {"model": scores(p_model), "persistence": scores(p_pers), "climatology": scores(p_clim), "always_no": scores(p_no)},
        "mae": {"model": round(mae_model, 1), "persistence": round(mae_pers, 1), "climatology": round(mae_clim, 1)},
        "r2_test": round(r2([math.log(s[2]) for s in test], [math.log(p) for p in pred]), 3),
        "importance": importance,
        "recent": [{"d": s[0], "obs": round(s[2], 1), "pred": round(p, 1), "prob": round(q, 2)}
                   for s, p, q in list(zip(test, pred, p_model))[-60:]],
    }
    print(f"  deweather R²={deweather['r2']} · dự báo MAE model {forecast['mae']['model']} vs persistence {forecast['mae']['persistence']}")
    return {"deweather": deweather, "rose": rose, "fingerprint": fp, "ci": ci, "forecast": forecast}


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
