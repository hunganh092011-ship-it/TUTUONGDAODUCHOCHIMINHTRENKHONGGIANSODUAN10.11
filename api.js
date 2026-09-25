/* =====================================================================
   api.js — Lớp giao tiếp với Google Sheets API (qua Google Apps Script
   Web App) đóng vai trò CSDL đám mây siêu nhẹ, có LocalStorage Cache
   để trang chạy mượt ngay cả khi mạng chậm hoặc máy yếu.

   CÁCH KẾT NỐI THẬT:
   1. Mở Google Sheet của Ban Dự án, vào Extensions > Apps Script.
   2. Dán nội dung file `google-apps-script.gs` vào, Deploy > New deployment
      > Web app > Execute as: Me > Who has access: Anyone.
   3. Copy URL Web App (dạng https://script.google.com/macros/s/xxx/exec)
      và dán vào biến GAS_ENDPOINT bên dưới.
   ===================================================================== */

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxoeoO7AReWmOav-SgoTCKlyguir1asCs0UaWvHwxe2A1_0gyMKuIYwIL6vOE20GIM8/exec"; // TODO: thay bằng URL thật sau khi Deploy

const CACHE_PREFIX = "hcm10_11_cache_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

const SheetsAPI = {
  /** Gọi GET tới Apps Script với tham số sheet + action, có cache LocalStorage */
  async fetchSheet(sheetName, { forceRefresh = false } = {}) {
    const cacheKey = CACHE_PREFIX + sheetName;
    if (!forceRefresh) {
      const cached = this._readCache(cacheKey);
      if (cached) return cached;
    }
    try {
      const url = `${GAS_ENDPOINT}?action=read&sheet=${encodeURIComponent(sheetName)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("Network error " + res.status);
      const data = await res.json();
      this._writeCache(cacheKey, data);
      return data;
    } catch (err) {
      console.warn(`[SheetsAPI] Không gọi được Google Sheets cho '${sheetName}', dùng dữ liệu mẫu / cache cũ.`, err);
      const stale = this._readCache(cacheKey, true);
      if (stale) return stale;
      return this._mockData(sheetName);
    }
  },

  /** Gửi POST (thêm/sửa dòng) tới Apps Script */
  async writeSheet(sheetName, payload, action = "append") {
    try {
      const res = await fetch(GAS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // tránh preflight CORS với Apps Script
        body: JSON.stringify({ action, sheet: sheetName, data: payload }),
      });
      const json = await res.json().catch(() => ({ ok: true }));
      this._invalidate(sheetName);
      return json;
    } catch (err) {
      console.warn(`[SheetsAPI] Không ghi được lên '${sheetName}', lưu tạm LocalStorage (Offline Queue).`, err);
      this._queueOffline(sheetName, payload, action);
      return { ok: false, queued: true };
    }
  },

  _readCache(key, ignoreTTL = false) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const { ts, data } = JSON.parse(raw);
      if (!ignoreTTL && Date.now() - ts > CACHE_TTL_MS) return null;
      return data;
    } catch { return null; }
  },
  _writeCache(key, data) {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  },
  _invalidate(sheetName) {
    localStorage.removeItem(CACHE_PREFIX + sheetName);
  },
  _queueOffline(sheetName, payload, action) {
    const key = "hcm10_11_offline_queue";
    const q = JSON.parse(localStorage.getItem(key) || "[]");
    q.push({ sheetName, payload, action, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(q));
  },

  /** Dữ liệu mẫu để trang vẫn hoạt động khi chưa cấu hình GAS_ENDPOINT */
  _mockData(sheetName) {
    const mocks = {
      Users: [
        { UserID: "U001", FullName: "Trưởng dự án", Email: "superadmin@example.com", Role: "SuperAdmin", Group: "Admin", Status: "Approved" },
      ],
      Posts: [
        { PostID: "P001", Title: "Bác Hồ với tinh thần tự học suốt đời", Category: "Góc Trẻ", Content: "Từ những năm tháng bôn ba tìm đường cứu nước, Chủ tịch Hồ Chí Minh đã tự học ngoại ngữ, văn hóa các dân tộc để phục vụ sự nghiệp cách mạng...", MediaURL: "", Author: "Ban 3", Views: 128, Status: "Published" },
        { PostID: "P002", Title: "Lối sống giản dị, gần gũi thiên nhiên", Category: "Sống xanh", Content: "Ngôi nhà sàn đơn sơ giữa vườn cây ao cá là hình ảnh tiêu biểu cho lối sống hòa hợp thiên nhiên của Bác...", MediaURL: "", Author: "Ban 3", Views: 96, Status: "Published" },
      ],
      Quiz: [
        { QuizID: "Q1", Question: "Bác Hồ ra đi tìm đường cứu nước vào năm nào?", OptionA: "1911", OptionB: "1920", OptionC: "1930", OptionD: "1945", CorrectAnswer: "A", Explanation: "Ngày 5/6/1911, Nguyễn Tất Thành rời bến cảng Nhà Rồng ra đi tìm đường cứu nước." },
        { QuizID: "Q2", Question: "Bản Tuyên ngôn Độc lập được đọc tại đâu?", OptionA: "Huế", OptionB: "Quảng trường Ba Đình", OptionC: "Sài Gòn", OptionD: "Hà Giang", CorrectAnswer: "B", Explanation: "Ngày 2/9/1945 tại Quảng trường Ba Đình, Hà Nội." },
        { QuizID: "Q3", Question: "Một trong những phẩm chất đạo đức Bác luôn nhắc nhở cán bộ là gì?", OptionA: "Cần, Kiệm, Liêm, Chính", OptionB: "Giàu sang, quyền lực", OptionC: "Hưởng thụ", OptionD: "Danh vọng cá nhân", CorrectAnswer: "A", Explanation: "\"Cần, Kiệm, Liêm, Chính\" là bốn đức tính Bác thường xuyên căn dặn." },
        { QuizID: "Q4", Question: "Bác Hồ mất vào năm nào?", OptionA: "1965", OptionB: "1969", OptionC: "1975", OptionD: "1954", CorrectAnswer: "B", Explanation: "Chủ tịch Hồ Chí Minh qua đời ngày 2/9/1969." },
        { QuizID: "Q5", Question: "Chiến dịch nào gắn liền với chiến thắng Điện Biên Phủ?", OptionA: "1954", OptionB: "1945", OptionC: "1975", OptionD: "1930", CorrectAnswer: "A", Explanation: "Chiến thắng Điện Biên Phủ diễn ra năm 1954, \"lừng lẫy năm châu, chấn động địa cầu\"." },
      ],
      Reflections: [
        { ID: "R1", StudentName: "Nguyễn Văn A", Class: "10.11", Content: "Em hứa sẽ chăm chỉ tự học mỗi ngày như lời Bác dạy.", Status: "Approved" },
      ],
      Discussions: [],
      Analytics: [
        { MetricName: "TotalViews", Value: 1024 },
        { MetricName: "QuizAttempts", Value: 312 },
        { MetricName: "Reflections", Value: 47 },
      ],
    };
    return mocks[sheetName] || [];
  },
};

/* ---------------------------------------------------------------------
   Live View Counter — cộng dồn lượt xem, đồng bộ (debounce) lên Sheets
   --------------------------------------------------------------------- */
const LiveCounter = {
  async bump(page = "global") {
    const key = "hcm10_11_view_" + page;
    let n = parseInt(localStorage.getItem(key) || "0", 10) + 1;
    localStorage.setItem(key, String(n));
    // Đồng bộ nhẹ, không chặn UI
    SheetsAPI.writeSheet("Analytics", { MetricName: "Views_" + page, Value: n }, "increment").catch(() => {});
    return n;
  },
  get(page = "global") {
    return parseInt(localStorage.getItem("hcm10_11_view_" + page) || "0", 10) + 1024; // +1024 nền tảng mẫu ban đầu
  },
};

window.SheetsAPI = SheetsAPI;
window.LiveCounter = LiveCounter;
