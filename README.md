# Tư tưởng đạo đức Hồ Chí Minh trên không gian số — Lớp 10.11

Website đa trang (Dynamic CMS) cho dự án truyền thông số của Lớp 10.11, THPT Võ Minh Đức.

## Cấu trúc thư mục
```
├── index.html          # Trang chủ: Hero, Timeline, AI Chatbot, Bức tường Cảm nghĩ
├── media.html           # Xưởng Media: TTS, Podcast, Infographic, AI Phục hồi ảnh, Dịch AI
├── interactive.html     # Mini-Quiz AI & Chứng nhận Số (Digital Badge)
├── forum.html           # Thảo luận nội bộ & Task Tracker (yêu cầu đăng nhập)
├── admin.html           # Quản trị: Tài khoản, Analytics, CMS, Kiểm duyệt (Super Admin)
├── css/style.css        # Theme Tailwind tuỳ biến (biến CSS cho Visual Live Editor)
├── js/app.js             # Auth nghiêm ngặt, RBAC, Visual Live Editor, 10 tính năng AI
├── js/api.js             # Kết nối Google Sheets API + LocalStorage cache
└── google-apps-script.gs # Backend Google Apps Script (CSDL Google Sheets)
```

## Cách triển khai (miễn phí, tối ưu máy yếu)

### 1. Thiết lập CSDL Google Sheets
1. Tạo Google Sheet mới, thêm các Tab: `Users`, `Posts`, `Quiz`, `Reflections`, `Discussions`, `Analytics`, `SiteConfig` — đúng tên cột như mô tả trong `google-apps-script.gs`.
2. Ở Tab `Users`, tự tay (Super Admin) thêm dòng đầu tiên cho chính mình, Role = `SuperAdmin`, Status = `Approved`.
3. Vào **Extensions → Apps Script**, dán nội dung `google-apps-script.gs`, **Deploy → New deployment → Web app** (Execute as: Me, Access: Anyone).
4. Copy URL `.../exec`, dán vào biến `GAS_ENDPOINT` trong `js/api.js`.

### 2. Cấu hình đăng nhập Google (Gmail SSO)
- Trong `js/app.js`, thay `GOOGLE_CLIENT_ID` bằng Client ID thật tạo tại [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
- Gắn nút chính thức của **Google Identity Services** (`<script src="https://accounts.google.com/gsi/client">`) thay cho nút demo (`Auth.loginDemo()`) hiện tại — nút demo chỉ để kiểm thử nhanh khi chưa có Client ID.
- **Không có luồng tự đăng ký**: mọi tài khoản chỉ được Super Admin tạo tại `admin.html`.

### 3. Deploy miễn phí
- **GitHub Pages**: đẩy toàn bộ thư mục lên 1 repo, bật Pages tại nhánh chính.
- **Vercel**: kéo-thả thư mục vào [vercel.com/new](https://vercel.com/new), không cần cấu hình build (static site).

## Ghi chú về các tính năng AI
Toàn bộ 10 tính năng AI (Chatbot, Semantic Search, Content Moderation, Reflection Assistant, Text-to-Speech, Media Summarizer, Personalized Learning Path, Multilingual Translator, Image Restoration Slider, Digital Badge Generator) được cài đặt **chạy hoàn toàn phía trình duyệt (client-side)** để đảm bảo tốc độ tải < 1.5 giây trên máy cấu hình yếu, không cần API key. Mỗi hàm trong `js/app.js` (object `AI`) đều có chú thích rõ vị trí có thể thay bằng lệnh gọi API AI thật (OpenAI, Gemini, Anthropic...) nếu dự án muốn nâng cấp độ chính xác.

## Bảo mật
- Không có đăng ký công khai.
- Mỗi lần đăng nhập, hệ thống đối chiếu Email với Sheet `Users`; nếu không có hoặc `Status = Disabled` → tự động đăng xuất + cảnh báo đỏ.
- Trang `admin.html` và `forum.html` kiểm tra Role phía client (`data-require-role`) — khi triển khai thật, nên bổ sung kiểm tra quyền tại Apps Script (`doPost`/`doGet`) để chống giả mạo request trực tiếp.
