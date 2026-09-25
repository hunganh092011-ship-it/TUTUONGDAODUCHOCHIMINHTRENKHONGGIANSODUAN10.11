/**
 * =====================================================================
 * google-apps-script.gs
 * Backend Headless CSDL cho Dự án "Tư tưởng đạo đức Hồ Chí Minh
 * trên không gian số" — Lớp 10.11, THPT Võ Minh Đức.
 *
 * HƯỚNG DẪN TRIỂN KHAI:
 * 1. Tạo 1 Google Sheet mới, đặt tên "HCM_10_11_Database".
 * 2. Tạo các Tab (Sheet con) đúng tên và đúng thứ tự cột như bên dưới:
 *
 *    Users:        UserID | FullName | Email | Role | Group | Status | CreatedBy | CreatedAt
 *    Posts:        PostID | Title | Category | Content | MediaURL | Author | Views | CreatedAt | Status
 *    Quiz:         QuizID | Question | OptionA | OptionB | OptionC | OptionD | CorrectAnswer | Explanation
 *    Reflections:  ID | StudentName | Class | Content | Status | SubmittedAt
 *    Discussions:  ThreadID | Title | Content | AuthorEmail | GroupTag | Likes | CreatedAt
 *    Analytics:    MetricName | Value | LastUpdated
 *    SiteConfig:   Key | Value (dùng để lưu JSON nội dung Visual Live Editor)
 *
 * 3. Vào Extensions > Apps Script, xoá code mặc định, dán toàn bộ file này vào.
 * 4. Bấm Deploy > New deployment > chọn loại "Web app":
 *      - Execute as: Me (tài khoản sở hữu Sheet)
 *      - Who has access: Anyone
 * 5. Copy URL Web App (.../exec) và dán vào biến GAS_ENDPOINT trong js/api.js.
 * 6. LƯU Ý BẢO MẬT: Chỉ Super Admin (người sở hữu Sheet) mới có quyền sửa
 *    trực tiếp Tab "Users" trên Google Sheets, hoặc qua giao diện /admin.html.
 * =====================================================================
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();

/** Điểm vào cho các yêu cầu GET (đọc dữ liệu) */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const sheetName = e.parameter.sheet;

    if (action === "read") {
      return jsonResponse(readSheet(sheetName));
    }
    return jsonResponse({ error: "Hành động không hợp lệ." }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/** Điểm vào cho các yêu cầu POST (ghi/sửa/xoá dữ liệu) */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, sheet: sheetName, data } = body;

    let result;
    switch (action) {
      case "append":
        result = appendRow(sheetName, data);
        break;
      case "upsert":
        result = upsertRow(sheetName, data);
        break;
      case "delete":
        result = deleteRow(sheetName, data);
        break;
      case "increment":
        result = incrementMetric(sheetName, data);
        break;
      default:
        return jsonResponse({ error: "Hành động không hợp lệ." }, 400);
    }
    return jsonResponse({ ok: true, result });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/* ---------------------------------------------------------------------
   Hàm tiện ích thao tác Sheet
   --------------------------------------------------------------------- */

function getSheet(name) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) throw new Error("Không tìm thấy Sheet: " + name);
  return sheet;
}

/** Đọc toàn bộ dữ liệu 1 sheet thành mảng object (dòng 1 = header) */
function readSheet(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

/** Thêm 1 dòng mới (dùng cho Posts, Reflections, Discussions, tạo User mới...) */
function appendRow(name, data) {
  const sheet = getSheet(name);
  const headers = sheet.getDataRange().getValues()[0];
  const row = headers.map(h => data[h] !== undefined ? data[h] : "");
  sheet.appendRow(row);
  return { appended: true };
}

/** Cập nhật dòng đã tồn tại (khớp theo cột khóa: UserID/Email cho Users, ID cho Reflections...) */
function upsertRow(name, data) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyCol = headers.includes("Email") ? "Email" : headers[0]; // Users khớp theo Email; các bảng khác khớp cột đầu
  const keyIdx = headers.indexOf(keyCol);

  for (let r = 1; r < values.length; r++) {
    if (values[r][keyIdx] === data[keyCol]) {
      headers.forEach((h, c) => {
        if (data[h] !== undefined) sheet.getRange(r + 1, c + 1).setValue(data[h]);
      });
      return { updated: true, row: r + 1 };
    }
  }
  // Không tìm thấy -> thêm mới
  return appendRow(name, data);
}

/** Xoá dòng theo khóa (Email cho Users, ID cho các bảng khác) */
function deleteRow(name, data) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyCol = headers.includes("Email") ? "Email" : headers[0];
  const keyIdx = headers.indexOf(keyCol);

  for (let r = values.length - 1; r >= 1; r--) {
    if (values[r][keyIdx] === data[keyCol]) {
      sheet.deleteRow(r + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

/** Cộng dồn giá trị số (dùng cho Live View Counter, Quiz Attempts...) */
function incrementMetric(name, data) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const nameIdx = headers.indexOf("MetricName");
  const valueIdx = headers.indexOf("Value");

  for (let r = 1; r < values.length; r++) {
    if (values[r][nameIdx] === data.MetricName) {
      const newVal = Number(values[r][valueIdx] || 0) + Number(data.Value || 1);
      sheet.getRange(r + 1, valueIdx + 1).setValue(newVal);
      sheet.getRange(r + 1, headers.indexOf("LastUpdated") + 1).setValue(new Date());
      return { incremented: true, value: newVal };
    }
  }
  sheet.appendRow([data.MetricName, Number(data.Value || 1), new Date()]);
  return { incremented: true, value: Number(data.Value || 1) };
}

function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
