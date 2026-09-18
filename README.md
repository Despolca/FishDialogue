# Fish Âm thanh đối thoại 1.4.2

Trích xuất các đoạn âm thanh Talk-Emo trong trò chuyện, tổng hợp và lưu âm thanh thông qua Fish Audio. Hỗ trợ phát từng đoạn, nghe thử giọng mặc định, liên kết giọng với nhân vật, chặn nhiều nhân vật, tạo dưới nền, quản lý tiến trình và số lượng âm thanh cục bộ được giữ lại. Bản thân plugin không gọi LLM.

## Worldbook ba ngôn ngữ

Fish-Dialogue.json khớp từng byte với tệp được cung cấp. Plugin chỉ thay đổi trạng thái kích hoạt, khi nâng cấp có thể phân bổ UID mới để tránh xung đột UID; sẽ không ghi đè tiêu đề, nội dung, prompt, ví dụ hoặc các thông số khác.

| Tùy chọn ngôn ngữ | Mục kích hoạt duy nhất |
| --- | --- |
| Tiếng Trung | FA_FORMAT · Tiếng Trung |
| Tiếng Nhật | FA_FORMAT · Tiếng Nhật |
| Tiếng Anh | FA_FORMAT · Tiếng Anh |
| Văn bản gốc (Đóng Worldbook lồng tiếng) | Cả ba mục đều đóng |

Cài đặt mới mặc định là tiếng Trung; giữ nguyên cài đặt ngôn ngữ của người dùng cũ. Chế độ văn bản gốc dùng để tương thích với tin nhắn cũ và dấu ngoặc kép thông thường, không cung cấp prompt thứ tư. Sau khi thay đổi tùy chọn trong menu thả xuống, phải nhấp vào "Áp dụng ngôn ngữ" mới thay đổi trạng thái Worldbook.

Giao thức: `<Talk-Emo>Tên nhân vật|zh|"[happy] Lời thoại"</Talk-Emo>`, trường ngôn ngữ có thể là zh, en, ja. Tất cả các thẻ âm thanh được gửi nguyên vẹn. Các nút hiển thị/ẩn và phát từng đoạn giữ nguyên logic hiện tại. Regex chỉ lọc các đoạn âm thanh khi gửi lịch sử cho mô hình, không xóa tin nhắn gốc.

## Cài đặt

Frontend cần một thành phần máy chủ độc lập, trình cài đặt tiện ích mở rộng sẽ không cài đặt máy chủ.

1. Cài đặt tiện ích mở rộng này trong SillyTavern.
1. Khởi động Sillytavern\public\scripts\extensions\third-party\Fishdialogue\install-server.cmd
3. Kích hoạt cấu hình sau trong config.yaml của tửu quán và khởi động lại:

```yaml
enableServerPlugins: true
requestProxy:
  enabled: true
  url: socks5://127.0.0.1:Cổng_tửu_quán
  bypass:
    - localhost
    - 127.0.0.1
```

Địa chỉ proxy điền theo cấu hình thực tế. Yêu cầu đi qua máy chủ sẽ kế thừa proxy của tửu quán; từ chối kết nối trực tiếp nếu không tìm thấy proxy. Máy chủ HTTPS tùy chỉnh cần được cho phép trong biến môi trường FISH_ALLOWED_HOSTS của tiến trình tửu quán.

5. Điền API Key và ID giọng nói của riêng bạn. Hộp văn bản mô hình mặc định là s2.1-pro-free. Chọn tiếng Trung, tiếng Nhật hoặc tiếng Anh, nhấp vào "Cài đặt / Gắn Worldbook" và "Thêm Regex".

## Sử dụng và dữ liệu

- "Tự động lồng tiếng cho phản hồi mới" và "Tạo âm thanh theo số thứ tự trò chuyện" chỉ tạo và lưu, không tự động phát; nút trong trò chuyện điều khiển việc phát.
- "Nghe thử giọng mặc định" bên cạnh giọng mặc định sẽ bắt đầu phát thử, nhấp lại để dừng.
- Âm thanh được lưu theo tài khoản tại data/<tài khoản>/fish-dialogue-audio/, bao gồm âm thanh và các chỉ mục như nhân vật/giọng nói, mặc định giữ lại 200 tệp, có thể chọn từ 1–10000.
- "Lưu API KEY" sẽ lưu Key vào cài đặt tài khoản tửu quán, xóa trống rồi lưu lại để xóa Key. Cấu hình cục bộ của người dùng hiện tại sẽ không bị xóa khi cập nhật.
- Khả năng tương thích với dấu ngoặc kép thông thường chỉ có tác dụng trong chế độ văn bản gốc; các thẻ FA và talk cũ không còn được hỗ trợ.
- Mở thư mục cần truy cập trên máy tính đang chạy tửu quán, nếu không hãy sử dụng chức năng tải xuống.

## Phát hành và xác minh

Vui lòng đọc Hướng dẫn phát hành GITHUB.md và PRIVACY.md.

## Tuyên bố
Cấm sử dụng cho mục đích thương mại.
Để tạo các tác phẩm phái sinh, vui lòng liên hệ bài đăng trên discord.
Toàn bộ là nhờ ép GPT viết ra, bug còn nhiều hơn cả gián trong phòng trọ, tác giả không đưa ra bất kỳ bảo đảm rõ ràng hay ngụ ý nào về nó; người dùng tự chịu trách nhiệm cho mọi vấn đề phát sinh khi sử dụng.
Script này là công cụ miễn phí hướng tới người chơi tửu quán, không liên quan đến SillyTavern và đội ngũ chính thức của trợ lý tửu quán.