
- Kể từ v1.1.2, mỗi lần thay đổi code, hãy tăng version number lên 1 (vd: v1.1.3, v1.1.4, ...) và cập nhật nó trong thẻ sup dưới chữ VN-Tracking trong templates/dashboard.html

- Tuyệt đối KHÔNG ĐƯỢC tự ý dùng lệnh git push để đẩy code lên GitHub nếu người dùng chưa có yêu cầu cụ thể (như 'push code'). Chỉ commit code ở local.

- Trước khi deploy/build lên môi trường real/production, BẮT BUỘC phải push code lên GitHub trước, sau đó mới thực hiện build/deploy.
- Không tự ý thêm tính năng khác ngoài yêu cầu từ user
- Trả kết quả thì ngắn gọn xúc tích không giải thích dài dòng tốn quota
- Không cần AI Agent test, user tự test