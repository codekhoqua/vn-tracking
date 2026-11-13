/**
 * VN-TRACKING — TASK ASSIGNEE WRITE PROXY
 * ============================================================================
 * Dùng khi cột 作業者 trong tab "Schedule management - ALL" bị Protect khiến
 * service account không ghi trực tiếp được.
 *
 * Script này chạy dưới quyền Google account của bạn (owner/edit của Sheet),
 * nên có thể ghi vào ô đang Protect.
 *
 * CÁCH DEPLOY (1 lần):
 * 1. Mở Google Sheet JP → Extensions → Apps Script.
 * 2. Dán toàn bộ file này (hoặc tạo file mới) và sửa WRITE_TOKEN bên dưới.
 * 3. Deploy → New deployment → chọn loại "Web app":
 *      - Execute as: Me (account của bạn)
 *      - Who has access: Anyone (hoặc Anyone with Google account)
 * 4. Copy URL dạng https://script.google.com/macros/s/.../exec
 * 5. Thêm vào env_vars.yaml của VN-Tracking:
 *
 *      ASSIGNEE_WRITE_URL: "https://script.google.com/macros/s/.../exec"
 *      ASSIGNEE_WRITE_TOKEN: "chuoi-bi-mat-giong-WRITE_TOKEN-ben-duoi"
 *
 * 6. Khởi động lại app. Tool Task Assignee sẽ ghi qua URL này.
 * ============================================================================
 */

// Đổi thành một chuỗi bí mật bất kỳ, và điền y hệt vào ASSIGNEE_WRITE_TOKEN.
var WRITE_TOKEN = 'doi-thanh-chuoi-bi-mat-cua-ban';

// Có thể để trống để dùng sheet_id/sheet_name gửi từ app.
var DEFAULT_SHEET_ID = '1dkCu_HUs12DTas--yZlDTB9M17DKnUGBvWJ6vdVuIGU';
var DEFAULT_SHEET_NAME = 'LS受注_all';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'Empty body' });
    }

    var data = JSON.parse(e.postData.contents);

    if (data.action !== 'assign_task') {
      return jsonResponse({ success: false, message: 'Unknown action: ' + data.action });
    }

    if (!WRITE_TOKEN || data.token !== WRITE_TOKEN) {
      return jsonResponse({ success: false, message: 'Invalid token' });
    }

    var sheetId = data.sheet_id || DEFAULT_SHEET_ID;
    var sheetName = data.sheet_name || DEFAULT_SHEET_NAME;
    if (!sheetId) {
      return jsonResponse({ success: false, message: 'Missing sheet_id' });
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonResponse({ success: false, message: 'Sheet not found: ' + sheetName });
    }

    var row = Number(data.row);
    var column = Number(data.column);
    if (!row || !column || row < 1 || column < 1) {
      return jsonResponse({ success: false, message: 'Invalid row/column' });
    }

    var range = sheet.getRange(row, column);
    var value = String(data.value == null ? '' : data.value);

    // Chống ghi nhầm dòng nếu người khác vừa sửa.
    if (data.expected_worker !== undefined) {
      var current = String(range.getValue() == null ? '' : range.getValue());
      if (current !== String(data.expected_worker == null ? '' : data.expected_worker)) {
        return jsonResponse({
          success: false,
          code: 'conflict',
          message: 'Dòng đã bị thay đổi. Hiện tại: "' + current + '"'
        });
      }
    }

    range.setValue(value);

    return jsonResponse({
      success: true,
      row: row,
      column: column,
      value: value
    });
  } catch (err) {
    return jsonResponse({ success: false, message: String(err && err.stack ? err.stack : err) });
  }
}

function doGet(e) {
  return jsonResponse({ success: true, service: 'vn-tracking-task-assignee' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
