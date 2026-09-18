# Kiểm tra quyền riêng tư của tệp phát hành

Phạm vi kiểm tra: Frontend, Server, Test, tài liệu hướng dẫn của phiên bản 1.4.2 và thư mục phát hành GitHub được tạo lại; không thay đổi các phiên bản lịch sử đã đóng băng, cũng không kiểm tra thư mục tài khoản tửu quán thực tế của người dùng.

- API Key mặc định chưa được cấu hình; ID giọng nói mặc định để trống, liên kết nhân vật để trống, danh sách chặn để trống.
- Không phát hiện Fish API Key thực, đường dẫn tài khoản cá nhân, ID giọng nói thực hoặc liên kết nhân vật cá nhân được cài đặt sẵn. Chữ Key trong mã nguồn là logic nhập liệu, truyền tải hoặc ẩn danh; thông tin đăng nhập thử nghiệm là giá trị tổng hợp.
- Tên ví dụ cụ thể trong phần thử nghiệm được đổi thành Nhân vật A/Nhân vật B; thư mục phát hành không bao gồm tệp tạm thời của thử nghiệm, phát triển, lịch sử trò chuyện, nhật ký, âm thanh, cài đặt tài khoản và lịch sử Git.
- Người dùng yêu cầu Worldbook không được sửa đổi, do đó tên nhân vật ví dụ và bối cảnh trong Worldbook được giữ nguyên. Chúng tồn tại trong gói phát hành; không thể tuyên bố rằng toàn bộ gói phát hành hoàn toàn không chứa tên nhân vật. Khi cần ẩn danh Worldbook, nên cung cấp riêng hoặc ủy quyền sửa đổi.
- Key, liên kết nhân vật và âm thanh được tạo sau khi cài đặt thuộc về dữ liệu người dùng cục bộ, không phải mã nguồn. Đừng tải data tửu quán, settings.json, config.yaml, thư viện âm thanh lên GitHub.

Worldbook gốc SHA-256: 9ae5322b6d02fd1bed2f38b56aa6129e32d4daa0781c6f6dade29e44b8a4a3f9