/* =====================================================================
   app.js — Lõi ứng dụng: Xác thực Gmail SSO nghiêm ngặt, RBAC,
   Visual Live Editor, và các hàm AI dùng chung cho toàn hệ thống.

   BẢO MẬT: Không có bất kỳ hàm "tự đăng ký" nào trong file này.
   Tài khoản CHỈ được tạo bởi Super Admin tại admin.html (Tab Users),
   ghi thẳng vào Sheet `Users` với Status mặc định "Approved"/"Disabled".
   ===================================================================== */

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"; // TODO: cấu hình tại Google Cloud Console

const Auth = {
  SESSION_KEY: "hcm10_11_session",

  currentUser() {
    try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } catch { return null; }
  },

  isLoggedIn() { return !!this.currentUser(); },

  hasRole(...roles) {
    const u = this.currentUser();
    return !!u && roles.includes(u.Role);
  },

  /** Được gọi từ callback của Google Identity Services (credential = JWT trả về) */
  async handleGoogleCredential(credentialResponse) {
    const profile = this._decodeJwt(credentialResponse.credential);
    return this.loginWithEmail(profile.email, profile.name, profile.picture);
  },

  /** Luồng xác thực: đối chiếu Email với Sheet Users. Đây là chốt bảo mật duy nhất. */
  async loginWithEmail(email, displayName = "", picture = "") {
    const users = await SheetsAPI.fetchSheet("Users", { forceRefresh: true });
    const match = users.find(u => (u.Email || "").toLowerCase() === email.toLowerCase());

    if (!match) {
      this.showAuthToast(
        "Tài khoản Gmail của bạn chưa được Super Admin khởi tạo hoặc phê duyệt. Vui lòng liên hệ Trưởng dự án Lớp 10.11 để được cấp quyền.",
        "error"
      );
      this.logout();
      return null;
    }
    if ((match.Status || "").toLowerCase() !== "approved") {
      this.showAuthToast(
        "Tài khoản Gmail của bạn đang ở trạng thái tạm khóa (Disabled). Vui lòng liên hệ Trưởng dự án Lớp 10.11 để được cấp quyền.",
        "error"
      );
      this.logout();
      return null;
    }

    const session = {
      Email: match.Email, FullName: match.FullName || displayName, Role: match.Role,
      Group: match.Group, Picture: picture, loginAt: Date.now(),
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    this.showAuthToast(`Xin chào ${session.FullName || session.Email}! Đăng nhập thành công với vai trò ${session.Role}.`, "success");
    this.renderAuthState();
    return session;
  },

  /** Dành cho môi trường demo/local không có Google Client ID thật: nhập email để mô phỏng SSO */
  async loginDemo() {
    const email = prompt("MÔ PHỎNG GOOGLE SSO\n(Khi Deploy thật, nút này sẽ được thay bằng nút 'Đăng nhập bằng Google' chính thức của Google Identity Services)\n\nNhập Gmail để kiểm tra:");
    if (!email) return;
    return this.loginWithEmail(email.trim());
  },

  logout() {
    localStorage.removeItem(this.SESSION_KEY);
    this.renderAuthState();
  },

  showAuthToast(message, type = "success") {
    const el = document.getElementById("auth-toast");
    if (!el) { alert(message); return; }
    const color = type === "error" ? "#C8102E" : "#10B981";
    el.innerHTML = `<div class="card fade-in-once" style="border-left:5px solid ${color}; padding:14px 16px;">
      <p class="text-sm font-semibold" style="color:${color}">${type === "error" ? "⚠ Truy cập bị từ chối" : "✓ Thành công"}</p>
      <p class="text-sm mt-1 text-neutral-700">${message}</p>
    </div>`;
    el.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add("hidden"), 6000);
  },

  /** Cập nhật giao diện Header + ẩn/hiện khối theo Role (RBAC hiển thị) */
  renderAuthState() {
    const u = this.currentUser();
    document.querySelectorAll("[data-auth='guest']").forEach(el => el.classList.toggle("hidden", !!u));
    document.querySelectorAll("[data-auth='user']").forEach(el => el.classList.toggle("hidden", !u));
    document.querySelectorAll("[data-user-name]").forEach(el => { if (u) el.textContent = u.FullName || u.Email; });

    document.querySelectorAll("[data-require-role]").forEach(el => {
      const allowed = el.getAttribute("data-require-role").split(",").map(s => s.trim());
      const show = u && allowed.includes(u.Role);
      el.style.display = show ? "" : "none";
    });

    // Nút bật Visual Live Editor chỉ dành riêng Super Admin
    const editBtn = document.getElementById("toggle-edit-mode");
    if (editBtn) editBtn.classList.toggle("hidden", !this.hasRole("SuperAdmin"));
  },

  _decodeJwt(token) {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(base64).split("").map(c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
  },
};

/* =====================================================================
   VISUAL LIVE EDITOR — chỉ Super Admin, bật/tắt qua nút nổi
   ===================================================================== */
const LiveEditor = {
  active: false,

  toggle() {
    if (!Auth.hasRole("SuperAdmin")) {
      Auth.showAuthToast("Chỉ Super Admin mới có quyền dùng Visual Live Editor.", "error");
      return;
    }
    this.active = !this.active;
    document.body.classList.toggle("edit-mode", this.active);
    document.querySelectorAll("[data-editable]").forEach(el => el.setAttribute("contenteditable", this.active));
    const toolbar = document.getElementById("edit-toolbar");
    if (toolbar) toolbar.classList.toggle("hidden", !this.active);
  },

  /** Lưu toàn bộ nội dung [data-editable] + theme hiện tại vào LocalStorage & Sheets */
  async save() {
    const content = {};
    document.querySelectorAll("[data-editable]").forEach(el => {
      const key = el.getAttribute("data-editable");
      content[key] = el.innerHTML;
    });
    const theme = {
      "--color-primary": getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim(),
      "--color-accent": getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
      "--color-green": getComputedStyle(document.documentElement).getPropertyValue("--color-green").trim(),
    };
    localStorage.setItem("hcm10_11_site_content", JSON.stringify(content));
    localStorage.setItem("hcm10_11_site_theme", JSON.stringify(theme));
    await SheetsAPI.writeSheet("SiteConfig", { content, theme }, "upsert");
    Auth.showAuthToast("Đã lưu cấu hình giao diện và đồng bộ lên Google Sheets.", "success");
  },

  /** Khôi phục nội dung đã lưu khi tải trang */
  loadSaved() {
    try {
      const content = JSON.parse(localStorage.getItem("hcm10_11_site_content") || "{}");
      Object.entries(content).forEach(([key, html]) => {
        const el = document.querySelector(`[data-editable="${key}"]`);
        if (el) el.innerHTML = html;
      });
      const theme = JSON.parse(localStorage.getItem("hcm10_11_site_theme") || "{}");
      Object.entries(theme).forEach(([varName, val]) => {
        if (val) document.documentElement.style.setProperty(varName, val);
      });
    } catch (e) { console.warn("Không khôi phục được cấu hình giao diện.", e); }
  },

  setColor(varName, value) {
    document.documentElement.style.setProperty(varName, value);
  },
};

/* =====================================================================
   10 TÍNH NĂNG AI — cài đặt nhẹ, chạy hoàn toàn phía client (không cần
   API key) để đảm bảo tốc độ trên máy yếu; có điểm cắm (hook) rõ ràng
   để thay bằng gọi API thật (OpenAI/Gemini/Anthropic...) khi cần.
   ===================================================================== */
const AI = {
  /* 1. AI Semantic Search — tìm theo ngữ cảnh chủ đề, không chỉ khớp chữ */
  SEMANTIC_MAP: {
    "sống xanh": ["thiên nhiên", "giản dị", "vườn cây", "ao cá", "môi trường"],
    "tự học": ["học tập", "ngoại ngữ", "sách", "kiên trì", "tri thức"],
    "cần kiệm": ["tiết kiệm", "giản dị", "liêm chính"],
    "độc lập": ["1945", "tuyên ngôn", "cách mạng"],
  },
  semanticSearch(query, posts) {
    const q = query.toLowerCase().trim();
    if (!q) return posts;
    const expanded = new Set([q]);
    Object.entries(this.SEMANTIC_MAP).forEach(([key, syns]) => {
      if (q.includes(key) || syns.some(s => q.includes(s))) {
        expanded.add(key); syns.forEach(s => expanded.add(s));
      }
    });
    return posts.filter(p => {
      const hay = (p.Title + " " + p.Content + " " + (p.Category || "")).toLowerCase();
      return [...expanded].some(term => hay.includes(term));
    });
  },

  /* 2. AI Chatbot — Cố vấn Tư tưởng Số, trả lời dựa trên CSDL bài viết + FAQ đã kiểm duyệt */
  FAQ: [
    { k: ["ra đi tìm đường", "1911", "bến nhà rồng"], a: "Ngày 5/6/1911, tại bến cảng Nhà Rồng (Sài Gòn), người thanh niên Nguyễn Tất Thành lên tàu Amiral Latouche-Tréville ra đi tìm đường cứu nước." },
    { k: ["tuyên ngôn độc lập", "2/9", "1945"], a: "Ngày 2/9/1945, tại Quảng trường Ba Đình, Chủ tịch Hồ Chí Minh đọc bản Tuyên ngôn Độc lập, khai sinh nước Việt Nam Dân chủ Cộng hòa." },
    { k: ["cần kiệm liêm chính", "đạo đức"], a: "\"Cần, Kiệm, Liêm, Chính\" là bốn đức tính Bác thường xuyên căn dặn cán bộ, đảng viên: Cần là siêng năng; Kiệm là tiết kiệm; Liêm là trong sạch; Chính là ngay thẳng." },
    { k: ["tự học", "học tập suốt đời"], a: "Bác Hồ là tấm gương tự học ngoại ngữ và văn hóa các dân tộc trong suốt hành trình bôn ba tìm đường cứu nước, luôn coi học tập là việc suốt đời." },
    { k: ["sống giản dị", "nhà sàn"], a: "Ngôi nhà sàn đơn sơ giữa vườn cây, ao cá tại Phủ Chủ tịch là biểu tượng cho lối sống giản dị, gần gũi thiên nhiên của Bác." },
  ],
  chatbotReply(question) {
    const q = question.toLowerCase();
    const hit = this.FAQ.find(item => item.k.some(k => q.includes(k)));
    if (hit) return hit.a;
    return "Câu hỏi của bạn rất hay! Hiện Cố vấn Tư tưởng Số chưa có dữ liệu đã-kiểm-duyệt cho câu hỏi này. Bạn có thể tham khảo mục Dòng thời gian Lịch sử hoặc Góc Trẻ, hoặc đặt câu hỏi khác liên quan đến cuộc đời, sự nghiệp và tư tưởng đạo đức Hồ Chí Minh nhé.";
  },

  /* 3. AI Content Moderation — quét từ ngữ không phù hợp trước khi gửi duyệt */
  BLOCKLIST: ["đm", "vcl", "ngu", "chửi", "spam", "địt", "fuck", "shit"],
  moderate(text) {
    const lower = (text || "").toLowerCase();
    const found = this.BLOCKLIST.filter(w => lower.includes(w));
    return { clean: found.length === 0, flaggedWords: found };
  },

  /* 4. AI Reflection Assistant — gợi ý từ vựng/cấu trúc câu hay cho lời hứa học tập */
  SUGGESTIONS: [
    "Em nguyện noi gương Bác, rèn luyện đức tính Cần – Kiệm – Liêm – Chính mỗi ngày.",
    "Em hứa sẽ kiên trì tự học, đọc sách và trau dồi ngoại ngữ như tinh thần Bác đã dạy.",
    "Em sẽ sống giản dị, gần gũi bạn bè và bảo vệ môi trường xung quanh mình.",
    "Em nguyện học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh trong từng việc nhỏ hằng ngày.",
  ],
  suggestReflection() { return this.SUGGESTIONS[Math.floor(Math.random() * this.SUGGESTIONS.length)]; },

  /* 5. AI Text-to-Speech — dùng Web Speech API có sẵn trên trình duyệt (miễn phí, không cần key) */
  speak(text, onEnd) {
    if (!("speechSynthesis" in window)) { alert("Trình duyệt không hỗ trợ đọc văn bản."); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "vi-VN"; utter.rate = 0.98; utter.pitch = 1;
    if (onEnd) utter.onend = onEnd;
    window.speechSynthesis.speak(utter);
  },
  stopSpeaking() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); },

  /* 6. AI Media Summarizer — tóm tắt 3 ý chính (rút trích câu quan trọng, nhẹ, chạy client-side) */
  summarize(text, maxPoints = 3) {
    const sentences = (text || "").split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 12);
    if (sentences.length <= maxPoints) return sentences;
    const step = Math.floor(sentences.length / maxPoints);
    const picked = [];
    for (let i = 0; i < maxPoints; i++) picked.push(sentences[Math.min(i * step, sentences.length - 1)]);
    return picked;
  },

  /* 7. AI Personalized Learning Path — gợi ý bài viết dựa trên lịch sử đọc lưu ở LocalStorage */
  trackRead(postId) {
    const key = "hcm10_11_read_history";
    const hist = JSON.parse(localStorage.getItem(key) || "[]");
    hist.push({ postId, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(hist.slice(-30)));
  },
  recommend(posts, limit = 3) {
    const hist = JSON.parse(localStorage.getItem("hcm10_11_read_history") || "[]");
    const readIds = new Set(hist.map(h => h.postId));
    const readCats = new Set(
      posts.filter(p => readIds.has(p.PostID)).map(p => p.Category)
    );
    const unread = posts.filter(p => !readIds.has(p.PostID));
    const scored = unread.sort((a, b) => (readCats.has(b.Category) ? 1 : 0) - (readCats.has(a.Category) ? 1 : 0));
    return (scored.length ? scored : posts).slice(0, limit);
  },

  /* 8. AI Multilingual Translator — từ điển cụm từ giao diện (demo nhẹ, không cần API) */
  DICT_EN: {
    "Trang chủ": "Home", "Xưởng Media": "Media Hub", "Tương tác": "Interactive",
    "Thảo luận": "Forum", "Quản trị": "Admin", "Đăng nhập bằng Google": "Sign in with Google",
    "Gửi cảm nghĩ": "Submit reflection", "Bắt đầu Quiz": "Start Quiz",
  },
  DICT_FR: {
    "Trang chủ": "Accueil", "Xưởng Media": "Espace Média", "Tương tác": "Interactif",
    "Thảo luận": "Forum", "Quản trị": "Administration", "Đăng nhập bằng Google": "Se connecter avec Google",
    "Gửi cảm nghĩ": "Envoyer un message", "Bắt đầu Quiz": "Commencer le Quiz",
  },
  translateUI(lang) {
    const dict = lang === "en" ? this.DICT_EN : lang === "fr" ? this.DICT_FR : null;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const original = el.getAttribute("data-i18n-vi") || el.textContent;
      el.setAttribute("data-i18n-vi", original);
      el.textContent = dict ? (dict[original] || original) : original;
    });
  },

  /* 9. AI Image Restoration Slider — logic kéo-so-sánh (giao diện xử lý trong media.html) */
  initCompareSlider(container) {
    const handle = container.querySelector(".compare-handle");
    const afterImg = container.querySelector(".after-img");
    let dragging = false;
    const move = (clientX) => {
      const rect = container.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      afterImg.style.width = pct + "%";
      handle.style.left = pct + "%";
    };
    handle.addEventListener("mousedown", () => dragging = true);
    window.addEventListener("mouseup", () => dragging = false);
    window.addEventListener("mousemove", e => dragging && move(e.clientX));
    handle.addEventListener("touchstart", () => dragging = true, { passive: true });
    window.addEventListener("touchend", () => dragging = false);
    window.addEventListener("touchmove", e => dragging && move(e.touches[0].clientX), { passive: true });
  },

  /* 10. AI Digital Badge Generator — vẽ Canvas chứng nhận số (dùng ở interactive.html) */
  drawBadge(canvas, { name, className, score }) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#C8102E"); grad.addColorStop(1, "#8c0c21");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#FFCD00"; ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    ctx.fillStyle = "#FFCD00";
    ctx.font = "bold 30px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CHỨNG NHẬN NHẬN THỨC TƯ TƯỞNG SỐ", W / 2, 90);

    ctx.fillStyle = "#fff";
    ctx.font = "600 22px Inter, sans-serif";
    ctx.fillText("Tư tưởng đạo đức Hồ Chí Minh trên không gian số", W / 2, 130);

    ctx.font = "bold 40px Inter, sans-serif";
    ctx.fillText(name || "Học sinh", W / 2, 220);

    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillText(`Lớp: ${className || "10.11"}`, W / 2, 265);
    ctx.fillText(`Kết quả Quiz: ${score}%`, W / 2, 300);

    ctx.font = "italic 16px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText("Dự án truyền thông số — Lớp 10.11, THPT Võ Minh Đức", W / 2, H - 40);
    ctx.fillText(new Date().toLocaleDateString("vi-VN"), W / 2, H - 18);
  },
};

/* =====================================================================
   Khởi tạo chung khi mỗi trang tải xong
   ===================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  Auth.renderAuthState();
  LiveEditor.loadSaved();

  const bumpTarget = document.body.getAttribute("data-page") || "global";
  LiveCounter.bump(bumpTarget).then(() => {
    document.querySelectorAll("[data-live-views]").forEach(el => {
      el.textContent = LiveCounter.get(bumpTarget).toLocaleString("vi-VN");
    });
  });

  const editBtn = document.getElementById("toggle-edit-mode");
  if (editBtn) editBtn.addEventListener("click", () => LiveEditor.toggle());
  const saveBtn = document.getElementById("save-edit-mode");
  if (saveBtn) saveBtn.addEventListener("click", () => LiveEditor.save());
  const loginBtn = document.getElementById("btn-login");
  if (loginBtn) loginBtn.addEventListener("click", () => Auth.loginDemo());
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.logout());
});

window.Auth = Auth;
window.LiveEditor = LiveEditor;
window.AI = AI;
