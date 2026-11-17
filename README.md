# Cloudmini MyIP

Giao diện HTML, CSS và JavaScript chạy trên Cloudflare Pages. API chạy bằng Pages Functions trên Workers, không yêu cầu VPS hay cơ sở dữ liệu.

- Trang chủ hiển thị IP công khai và thông tin kết nối do Cloudflare trả về. Trình duyệt tự xác định ngôn ngữ và múi giờ.
- `/ip-lookup/?query=185.139.214.144` tra cứu IPv4 hoặc IPv6, so sánh vị trí, ISP và ASN theo nguồn. Bản đồ OpenStreetMap tải khi người dùng chọn hiển thị.
- `GET /api/me` trả dữ liệu kết nối từ Cloudflare. `GET /api/lookup?ip=...` trả kết quả theo từng nguồn. `GET /api/health` dùng để kiểm tra phiên bản đang phục vụ.

## Phát triển và triển khai

```sh
npm install
npm run dev
npx wrangler login
npx wrangler pages project create cloudmini-myip --production-branch main
npm run deploy
```

Chỉ chạy lệnh tạo project một lần. Cấu hình và kiểm tra trên `cloudmini-myip.pages.dev` trước khi nối miền `myip.cloudmini.net` vào project.

IP.SB, IPinfo và ipapi.is có thể hoạt động không cần khóa. Có thể đặt biến `IPINFO_API_TOKEN` và `IPAPIIS_API_KEY` để dùng tài khoản API riêng. `IP2LOCATION_API_KEY` và `IPLOCATE_API_KEY` bật thêm nguồn tương ứng. Đặt mỗi khóa riêng bằng `npx wrangler pages secret put TÊN_BIẾN --project-name cloudmini-myip` và triển khai lại. Không đưa khóa vào source. Các tín hiệu Proxy, VPN, Tor và trung tâm dữ liệu chỉ hiển thị khi nguồn có trả trường tương ứng.

IP được gửi tới các nguồn định vị đã bật. API chuẩn hóa IP, dùng đích HTTPS cố định và trả kết quả từng phần nếu một nguồn lỗi hoặc chạm hạn mức. Kết quả tra cứu có thể được lưu ở cache Cloudflare tối đa 15 phút. Thông tin kết nối cá nhân từ `/api/me` không được lưu trong cache.
