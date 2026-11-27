# Nhịp Thở Đô Thị

**Trang web:** https://ngocthuan130607.github.io/nhip-tho-do-thi/

Công cụ dữ liệu mở giúp người dân Hà Nội và TP.HCM hiểu rõ chất lượng không khí, đồng thời chủ động giảm lượng bụi mịn PM2.5 mà họ hít vào hằng ngày.

## Trang web làm được gì
1. **Hôm nay thở thế nào?** Hiển thị PM2.5 và US AQI theo thời gian thực, kèm lời khuyên riêng cho người khỏe mạnh, trẻ em và người cao tuổi, người có bệnh hô hấp hoặc tim mạch.
2. **Khung giờ vàng để ra ngoài.** Từ dự báo PM2.5 theo giờ trong 5 ngày, trang tìm ra 2 giờ liền có không khí sạch nhất trong khung 6h–21h mỗi ngày.
3. **Hơn 4 năm bụi mịn qua dữ liệu.** Phân tích khoảng 37.000 giờ dữ liệu cho mỗi thành phố, từ 08/2022 đến 11/2026:
   - tỉ lệ số ngày vượt ngưỡng WHO và vượt QCVN 05:2023
   - heatmap theo tháng × giờ trong ngày
   - ảnh hưởng của gió và mưa
   - xu hướng theo năm
4. **Phương pháp và giới hạn** được trình bày minh bạch ngay trên trang.

## Một số phát hiện
- PM2.5 trung bình ở Hà Nội là **45,1 µg/m³**, cao gấp 1,7 lần TP.HCM và gấp 9 lần mức WHO khuyến nghị cho trung bình năm.
- **98%** số ngày ở Hà Nội và **90%** ở TP.HCM vượt ngưỡng 24h của WHO.
- Ở Hà Nội, ra ngoài vào khoảng 11h thay vì 20h có thể giảm khoảng **39%** lượng bụi hít vào.
- Khi gió dưới 5 km/h, PM2.5 ở Hà Nội trung bình 62,6 µg/m³. Khi gió từ 20 km/h trở lên, con số này chỉ còn 21,9 µg/m³.

## Dữ liệu và kỹ thuật
- **Dữ liệu:** [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (CAMS) và [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5).
- **Xử lý dữ liệu:** [`scripts/build_insights.py`](scripts/build_insights.py), viết bằng Python thuần không cần thư viện ngoài. Script tải dữ liệu, ghép dữ liệu không khí với thời tiết theo giờ, làm sạch (chỉ giữ ngày có từ 18 giờ dữ liệu trở lên), tổng hợp rồi xuất ra `data/insights.json`.
- **Giao diện:** HTML/CSS/JS tĩnh dùng Chart.js, hỗ trợ dark mode và điện thoại. Dự báo được lấy trực tiếp ngay trong trình duyệt.

Chạy lại phần phân tích:
```bash
python scripts/build_insights.py
python -m http.server 8000   # rồi mở http://localhost:8000
```

## Giới hạn
Đây là dữ liệu mô hình CAMS với độ phân giải khoảng 40 km, không phải trạm đo mặt đất. Mô hình có thể lệch so với trạm thực tế. Mỗi thành phố chỉ dùng một điểm lưới.

## Hướng phát triển
- Hiệu chỉnh bằng dữ liệu trạm đo (OpenAQ, trạm quan trắc địa phương).
- Tự huấn luyện mô hình dự báo (gradient boosting với đặc trưng trễ và thời tiết) rồi so sánh với CAMS.
- Thêm bản đồ theo quận và thông báo khi không khí xấu đi.
