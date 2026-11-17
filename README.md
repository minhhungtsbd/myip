# Cloudmini MyIP

Giao diện HTML, CSS và JavaScript chạy trên Cloudflare Pages. API chạy bằng Pages Functions trên Workers, không yêu cầu VPS hay cơ sở dữ liệu.

- Trang chủ hiển thị IP công khai và thông tin kết nối do Cloudflare trả về. Trình duyệt tự xác định ngôn ngữ và múi giờ.
- `/ip-lookup/?query=185.139.214.144` tra cứu IPv4 hoặc IPv6, so sánh vị trí, ISP và ASN theo nguồn. Bản đồ OpenStreetMap tải khi người dùng chọn hiển thị.
- Cờ được phục vụ trực tiếp từ Pages. Bộ [flag-icons](https://github.com/lipis/flag-icons) 7.3.2 có giấy phép MIT trong `site/flags/LICENSE.txt`, gồm toàn bộ mã ISO 3166-1 alpha-2 và một số mã bổ sung.
- WebRTC dùng Google STUN khi người dùng bấm chạy. Trình duyệt có thể giới hạn kết quả STUN, và phép kiểm tra chỉ so sánh địa chỉ cùng phiên bản IP.
- `/dns-leak/` tạo phiên đo qua API dnsleak.dev. Trình duyệt gửi truy vấn thử cho các tên miền dùng một lần, rồi Pages lấy danh sách resolver quan sát được. Vị trí là ước tính và kết quả chỉ phản ánh trình duyệt trong phiên đó.
- `GET /api/me` trả dữ liệu kết nối từ Cloudflare. `GET /api/lookup?ip=...` trả kết quả theo từng nguồn. `GET /api/health` dùng để kiểm tra phiên bản đang phục vụ.

## Phát triển và triển khai

```sh
npm install
npm run dev
npx wrangler login
npx wrangler deploy --config worker/wrangler.jsonc
npx wrangler pages project create cloudmini-myip --production-branch main
npm run deploy
```

Chỉ chạy lệnh tạo project một lần. Cấu hình và kiểm tra trên `cloudmini-myip.pages.dev` trước khi nối miền `myip.cloudmini.net` vào project.

IP.SB, IPinfo, ipapi.is và IP2Location.io có thể hoạt động không cần khóa. Đặt `IPINFO_API_TOKEN`, `IPAPIIS_API_KEY` hoặc `IP2LOCATION_API_KEY` để dùng tài khoản API riêng. `IPLOCATE_API_KEY`, `IPGEOLOCATION_API_KEY` và `IPREGISTRY_API_KEY` bật thêm nguồn định vị. `ABUSEIPDB_API_KEY` và `SCAMALYTICS_API_KEY` bật điểm uy tín do từng nhà cung cấp trả về. Đặt mỗi khóa bằng `npx wrangler pages secret put TÊN_BIẾN --project-name cloudmini-myip` và triển khai lại.

Worker `cloudmini-myip-lookup-guard` nhận request qua service binding. Nó giới hạn 15 lượt chưa có trong cache mỗi phút trên một IP truy cập, tính tại điểm Cloudflare xử lý request. Khi chạy thử trên máy, chạy `npx wrangler dev --config worker/wrangler.jsonc` cùng với `npm run dev`. Cloudflare chỉ cung cấp đầy đủ metadata kết nối ở môi trường đã triển khai.

IP được gửi tới các nguồn định vị đã bật. API chuẩn hóa IP, dùng đích HTTPS cố định và trả kết quả từng phần nếu một nguồn lỗi hoặc chạm hạn mức. Kết quả tra cứu có thể được lưu ở cache Cloudflare tối đa 15 phút. Thông tin kết nối cá nhân từ `/api/me` không được lưu trong cache.
