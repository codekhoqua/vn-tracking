/**
 * ============================================================================
 * VN-TRACKING — GOOGLE APPS SCRIPT WEB APP (FULL CODE)
 * Hỗ trợ:
 * 1. Upload ảnh xác nhận lên Google Drive (Tránh lỗi Quota Service Account)
 * 2. Tạo sự kiện lịch trên Google Calendar
 * 3. Gửi email thông báo tự động cho Quản lý / Admin (1 hoặc nhiều email)
 * 4. Gửi email kiểm tra kết nối (Test Email)
 * ============================================================================
 */

// ID thư mục Google Drive lưu ảnh đơn nghỉ phép (mặc định)
var DEFAULT_FOLDER_ID = "11p_oV4hZ-7Zt5Y9a7B8w9x0y1z2a3b4c";

/**
 * HÀM CẤP QUYỀN (CHẠY 1 LẦN DUY NHẤT):
 * Chọn hàm "testAuthorization" này rồi bấm nút "Run" (Chạy) ở trên thanh công cụ
 * để cấp quyền Google Drive, Calendar và Gmail/MailApp.
 */
function testAuthorization() {
  Logger.log("Đang kiểm tra và yêu cầu cấp quyền...");
  var myEmail = Session.getActiveUser().getEmail() || "admin@example.com";
  MailApp.sendEmail({
    to: myEmail,
    subject: "[VN-TRACKING] Cấp quyền thành công",
    htmlBody: "<p>Google Apps Script đã được cấp quyền gửi email và tạo lịch thành công!</p>"
  });
  Logger.log("Đã hoàn tất cấp quyền!");
}

/**
 * Xử lý GET request (Dùng để kiểm tra trạng thái Web App)
 */
function doGet(e) {
  var output = {
    status: "ok",
    service: "VN-Tracking Apps Script Web App",
    time: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý POST request từ hệ thống VN-Tracking
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse("Không có dữ liệu gửi lên (Empty body)");
    }

    var data = JSON.parse(e.postData.contents);

    // 0. PING KIỂM TRA KẾT NỐI
    if (data.ping) {
      return jsonResponse({ success: true, pong: true });
    }

    // 1. GỬI THỬ EMAIL (TEST EMAIL)
    if (data.action === "send_test_email") {
      var toEmails = data.notifyEmail || (data.notifyEmails ? data.notifyEmails.join(",") : "");
      if (!toEmails) {
        return errorResponse("Thiếu địa chỉ email nhận thông báo (notifyEmail)");
      }

      var testHtml = [
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">',
        '  <div style="background: #6366f1; padding: 16px 20px; border-radius: 8px; text-align: center; color: #ffffff;">',
        '    <h2 style="margin: 0; font-size: 1.3rem;">VN-Tracking Notification</h2>',
        '    <p style="margin: 4px 0 0; font-size: 0.85rem; opacity: 0.9;">Kiểm tra kết nối Email thông báo</p>',
        '  </div>',
        '  <div style="padding: 20px 10px; color: #334155; line-height: 1.6;">',
        '    <p>Xin chào <b>Quản trị viên</b>,</p>',
        '    <p>Hệ thống <b>VN-Tracking</b> đã kết nối thành công với địa chỉ email của bạn. Mỗi khi có nhân viên nộp đơn đăng ký nghỉ phép mới, email thông báo chi tiết kèm link ảnh xác nhận sẽ được gửi tự động tới địa chỉ này.</p>',
        '    <div style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 0.9rem;">',
        '      <b>Danh sách email nhận thông báo:</b> ' + toEmails,
        '    </div>',
        '    <p style="color: #64748b; font-size: 0.82rem; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">',
        '      Thời gian kiểm tra: ' + Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss") + ' (Giờ VN)',
        '    </p>',
        '  </div>',
        '</div>'
      ].join("\n");

      MailApp.sendEmail({
        to: toEmails,
        subject: "[VN-TRACKING] Kiểm tra kết nối Email nhận thông báo",
        htmlBody: testHtml
      });

      return jsonResponse({ success: true, message: "Đã gửi email test thành công" });
    }

    // 2. TẠO SỰ KIỆN LỊCH VÀ GỬI THÔNG BÁO NGHỈ PHÉP (CREATE EVENT & NOTIFY)
    if (data.action === "create_event") {
      var cal = CalendarApp.getDefaultCalendar();
      var start = new Date(data.startTime);
      var end = new Date(data.endTime);
      var title = data.title || "[NGHỈ PHÉP]";
      var desc = data.description || "";
      var toEmails = data.notifyEmail || (data.notifyEmails ? data.notifyEmails.join(",") : "");

      // Tạo sự kiện trên lịch mà KHÔNG gửi thư mời Calendar (tránh gửi email trùng)
      var event = cal.createEvent(title, start, end, {
        description: desc
      });

      // Chỉ gửi 1 email báo cáo chi tiết duy nhất tới Admin
      if (toEmails) {
        try {
          var leaveHtml = [
            '<div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">',
            '  <div style="background: #0f172a; padding: 18px 24px; border-radius: 8px; border-bottom: 3px solid #6366f1;">',
            '    <h2 style="margin: 0; color: #ffffff; font-size: 1.25rem;">[ĐƠN NGHỈ PHÉP MỚI]</h2>',
            '    <p style="margin: 4px 0 0; color: #94a3b8; font-size: 0.88rem;">' + (data.fullname || "Nhân viên") + ' - ' + (data.department || "DESIGN") + '</p>',
            '  </div>',
            '  <div style="padding: 20px 8px; color: #1e293b; font-size: 0.95rem; line-height: 1.6;">',
            '    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">',
            '      <tr><td style="padding: 8px 0; color: #64748b; width: 140px;"><b>Nhân viên:</b></td><td style="padding: 8px 0; font-weight: 600; color: #0f172a;">' + (data.fullname || "") + '</td></tr>',
            '      <tr><td style="padding: 8px 0; color: #64748b;"><b>Mã số NV:</b></td><td style="padding: 8px 0;">' + (data.staffCode || "---") + '</td></tr>',
            '      <tr><td style="padding: 8px 0; color: #64748b;"><b>Phòng ban:</b></td><td style="padding: 8px 0;">' + (data.department || "---") + '</td></tr>',
            '      <tr><td style="padding: 8px 0; color: #64748b;"><b>Loại nghỉ:</b></td><td style="padding: 8px 0;"><span style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">' + (data.leaveType || "Nghỉ phép") + '</span></td></tr>',
            '      <tr><td style="padding: 8px 0; color: #64748b;"><b>Thời gian:</b></td><td style="padding: 8px 0; font-weight: 600; color: #2563eb;">' + (data.startTimeFormatted || "") + '  đến  ' + (data.endTimeFormatted || "") + ' (' + (data.totalDays || 1) + ' ngày)</td></tr>',
            '      <tr><td style="padding: 8px 0; color: #64748b;"><b>Lý do:</b></td><td style="padding: 8px 0; color: #334155;">' + (data.reason || "Không ghi chú") + '</td></tr>',
            '    </table>',
            data.gdriveLink ? ('    <div style="margin: 20px 0; padding: 14px 18px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center;">' +
                               '      <div style="font-size: 0.88rem; margin-bottom: 8px; color: #475569;"><b>Minh chứng / Ảnh xác nhận của Quản lý:</b></div>' +
                               '      <a href="' + data.gdriveLink + '" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.88rem;">Xem ảnh trên Google Drive ↗</a>' +
                               '    </div>') : '',
            '    <p style="color: #64748b; font-size: 0.8rem; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">',
            '      Đơn đã được tự động lưu vào Google Sheets và Team Calendar trên hệ thống VN-Tracking.',
            '    </p>',
            '  </div>',
            '</div>'
          ].join("\n");

          MailApp.sendEmail({
            to: toEmails,
            subject: title,
            htmlBody: leaveHtml
          });
        } catch (mailErr) {
          Logger.log("Mail error (create_event): " + mailErr.toString());
        }
      }

      return jsonResponse({
        success: true,
        eventId: event.getId(),
        calendarId: cal.getId()
      });
    }

    // 3. UPLOAD FILE ẢNH LÊN GOOGLE DRIVE (MẶC ĐỊNH)
    var b64Data = data.base64 || data.data;
    if (!b64Data) {
      return errorResponse("Đối số không được bằng không: base64/data");
    }

    var filename = data.filename || data.name || ("HR_Leave_" + new Date().getTime() + ".png");
    var mimeType = data.mimeType || "image/png";
    var folderId = data.folderId || DEFAULT_FOLDER_ID;

    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (fErr) {
      folder = DriveApp.getRootFolder();
    }

    var decoded = Utilities.base64Decode(b64Data);
    var blob = Utilities.newBlob(decoded, mimeType, filename);
    var file = folder.createFile(blob);

    // Cấp quyền bất kỳ ai có link đều xem được
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {}

    var fileUrl = file.getUrl();

    return jsonResponse({
      success: true,
      url: fileUrl,
      id: file.getId(),
      name: file.getName()
    });

  } catch (err) {
    return errorResponse(err.toString());
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg) {
  return jsonResponse({
    success: false,
    error: msg
  });
}
