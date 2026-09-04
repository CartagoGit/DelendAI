---
title: Trung tâm cấu hình
description: Cấu hình plugin delendai và xem nguồn gốc tạo tác an toàn từ VS Code.
order: 2
navLabel: Cấu hình
---

# Trung tâm cấu hình

Chạy **DelendAI: Open Configuration Center** trong VS Code và chọn dự án ở cửa sổ multi-root. Các phần hiển thị thiết lập chung, plugin, nhà cung cấp, tác nhân, kỹ năng, prompt, tài nguyên và kiến thức cùng chủ sở hữu và nguồn gốc.

## Chỉnh sửa an toàn

Trung tâm chỉ sửa `delendai.config.json`; lệnh máy chủ, đối số, tiền tố, giao diện và ngôn ngữ vẫn là tùy chọn VS Code. Khi lưu, hệ thống kiểm tra digest, chỉ hợp nhất các đường dẫn đã sửa, xác thực toàn bộ tài liệu và thay tệp nguyên tử. Trường chưa biết và máy chủ ngoài bị tắt vẫn được giữ nguyên. Khi xung đột, hãy tải lại rồi áp dụng thay đổi lần nữa.

Giá trị bí mật bị ẩn; `env` chỉ chứa tên biến. Khởi động lại máy chủ sau khi thay đổi.

## Tác giả plugin

Công bố `optionsSchema` trong cùng `definePlugin(...)` dùng để kiểm tra `ctx.options` và giữ `configExample.options` hợp lệ. Plugin cục bộ qua `plugins.<id>.path` và MCP con bên ngoài tự động xuất hiện cùng schema và nguồn gốc.
