# Nhịp Thở Đô Thị

**Trang web:** https://ngocthuan130607.github.io/nhip-tho-do-thi/

Công cụ dữ liệu mở về bụi mịn PM2.5 ở Hà Nội và TP.HCM. Trang trả lời bốn câu hỏi:
- Bây giờ không khí ra sao?
- Không khí đã đi qua *bạn* như thế nào?
- Vì sao lại như vậy?
- Người dân và chính quyền nên làm gì?

## Các phần của trang
1. **Bây giờ.** PM2.5 và AQI theo thời gian thực, quy ra số điếu thuốc trong ngày. Kèm 4 việc nên làm ngay: giờ ra ngoài đẹp nhất sắp tới, ở nhà, đi đường, xu hướng 6 giờ tới.
2. **Bạn đã trải qua những gì?** Tính năng cá nhân hóa riêng của trang. Bạn nhập thành phố, ngày sinh nhật và năm bắt đầu sống ở đó, trang sẽ cho biết:
   - không khí trong ngày sinh nhật của bạn qua từng năm
   - tổng lượng bụi bạn đã hít, quy ra điếu thuốc
   - số ngày bạn được thở không khí đạt chuẩn WHO
   - ngày sạch nhất và ngày bẩn nhất bạn đã trải qua
   - dải ngày của riêng bạn

   Cuối cùng là một lời cam kết thay đổi thói quen, kèm **thẻ chia sẻ PNG** để đăng mạng xã hội. Mọi tính toán chạy ngay trong trình duyệt, không gửi dữ liệu cá nhân đi đâu.
3. **Câu chuyện dữ liệu**, gồm 4 chương:
   - Khi nào bụi dày nhất: heatmap tháng × giờ.
   - Vì sao buổi tối luôn tệ nhất: độ cao lớp biên khí quyển sụp sau hoàng hôn, trong khi NO₂ từ khói xe lên đỉnh.
   - Gió, mưa và Tết: tuần Tết vắng xe nhưng bụi không giảm đều, vì ô nhiễm là bài toán của cả vùng.
   - Quán tính ô nhiễm: một ngày vượt QCVN thì 66% khả năng ngày mai vẫn vượt.
4. **Nên làm gì.** 5 khuyến nghị cho cá nhân và 5 cho cộng đồng hoặc chính quyền. Mỗi khuyến nghị kèm con số làm căn cứ.
5. **Công cụ.**
   - Máy tính phơi nhiễm theo thói quen (điếu thuốc mỗi năm).
   - Lên lịch hoạt động theo dự báo 5 ngày.
   - Lịch ra ngoài theo tháng.
6. **Lộ trình phát triển.** Các bước tiếp theo, từ cảnh báo qua Zalo, hiệu chỉnh bằng trạm đo, mô hình ML riêng, đến chế độ trường học…

## Một số phát hiện (Hà Nội, 08/2022 – 11/2026)
- **1.536 / 1.567** ngày vượt ngưỡng 24h của WHO. Hít thở tương đương khoảng **748 điếu thuốc mỗi năm** (TP.HCM: 443).
- Mùa khô, lớp biên dày khoảng 1.000 m vào buổi trưa nhưng chỉ còn khoảng 240 m về đêm. PM2.5 vì thế tăng từ khoảng 38 lên 59 µg/m³.
- Ra ngoài lúc 11h thay vì 20h giảm khoảng **39%** lượng bụi hít vào.
- Có 67 đợt ô nhiễm kéo dài từ 3 ngày trở lên. Đợt dài nhất kéo dài 16 ngày, bắt đầu 30/03/2026.

## Dữ liệu và kỹ thuật
- **Dữ liệu:** PM2.5, PM10, NO₂, CO và bụi khoáng từ [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (CAMS). Gió, hướng gió, mưa và độ cao lớp biên từ [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5).
- **Xử lý dữ liệu:** [`scripts/build_insights.py`](scripts/build_insights.py), viết bằng Python thuần, không cần thư viện ngoài. Các bước:
  1. Tải khoảng 75.000 giờ dữ liệu.
  2. Kiểm soát chất lượng: loại các giờ dưới 2 µg/m³ do sự cố CAMS ngày 13–15/12/2022, và chỉ giữ ngày có từ 18 giờ dữ liệu trở lên.
  3. Ghép dữ liệu không khí với thời tiết theo giờ.
  4. Phân tích theo mùa, giờ, hướng gió, mưa, ngày trong tuần, Tết; tìm các đợt ô nhiễm và tính quán tính.
  5. Xuất ra `data/insights.json`.
- **Giao diện:** HTML/CSS/JS tĩnh theo phong cách báo dữ liệu. Dùng Chart.js cho biểu đồ và Canvas cho thẻ chia sẻ. Có dark mode và hiển thị tốt trên điện thoại.

```bash
python scripts/build_insights.py   # chạy lại phân tích
python -m http.server 8000         # rồi mở http://localhost:8000
```

## Giới hạn
Đây là dữ liệu mô hình CAMS với độ phân giải khoảng 40 km, không phải trạm đo. Mỗi thành phố chỉ có một điểm lưới. Phép quy đổi ra điếu thuốc (22 µg/m³ trong 24h ≈ 1 điếu, theo Berkeley Earth) và các hệ số phơi nhiễm chỉ là ước lượng để so sánh, không phải chẩn đoán y khoa.
