---
title: Bắt đầu với plugin proposals
plugin: proposals
audience: điều phối viên / tác nhân
order: 1
lang: vi
---

# Bắt đầu với plugin proposals

Hướng dẫn này bắt đầu từ một workspace trống và kết thúc với vòng
lặp đề xuất → lát cắt → triển khai → đóng hoạt động đầy đủ, với
kỷ luật mutex tệp còn nguyên. Giả định rằng plugin `proposals` đã
được bật (xem `plugins/proposals/README.md` để lấy đoạn JSON).

## 0. Mô hình tư duy

**Đề xuất** là một tệp markdown với tiêu đề frontmatter. **Lát cắt**
là một phần được đánh số bên trong. Plugin điều phối hai người viết
mỗi lát cắt: một người yêu cầu, một người giải phóng. `auto_work`
là điểm vào cấp cao "tôi nên làm gì tiếp theo?".

```
docs/mcp-vertex/proposals/
├─ index.json          (được tái tạo bởi sync_proposals)
├─ p<N>-<tiêu-đề>.md  (một đề xuất)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Bắt đầu với `auto_work`

`auto_work` trả về lát cắt có thể thực hiện tiếp theo trong toàn
bộ kho đề xuất, với một kế hoạch gọn gàng và có thứ tự. Kế hoạch
phải được thực hiện nguyên văn — không ứng biến các bước.

```json
// Gọi công cụ MCP
{ "tool": "proposals_auto_work", "args": {} }

// Phản hồi thông thường (rút gọn)
{
  "state": "work",
  "proposalId": "l110",
  "sliceId": "s1-claim",
  "steps": [
    "Mở docs/mcp-vertex/proposals/l110-…md và chọn lát cắt nguyên tử tiếp theo.",
    "Yêu cầu tệp của nó: proposals_agent_lock { action: \"claim\", … }.",
    "Triển khai đúng lát cắt đó — không làm gì ngoài các tệp đã yêu cầu.",
    "Xác thực theo cổng dự án (xem get_validation_matrix nếu có).",
    "Đánh dấu tiến trình trong đề xuất, sau đó proposals_sync_proposals.",
    "Giải phóng: proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Yêu cầu các tệp của lát cắt

Công cụ `proposals_agent_lock` ghi lại ai sở hữu đường dẫn nào
trong suốt thời gian của lát cắt. Không có yêu cầu, `sync_proposals`
sẽ từ chối đánh dấu lát cắt là hoàn thành.

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

Phản hồi mang một `task_id` phải giữ cho đến khi giải phóng. Hai
tác nhân yêu cầu cùng một tệp ⇒ xung đột, không có tiến trình.
Mutex được hỗ trợ bởi fs (không tư vấn) và tồn tại qua các lần
khởi động lại tiến trình.

## 3. Triển khai lát cắt, sau đó xác thực

Chỉ chỉnh sửa các tệp đã yêu cầu. Chạy cổng dự án:

```bash
bun run validate
```

Nếu cổng thất bại, hãy sửa lát cắt — đừng mở rộng yêu cầu trong im lặng.

## 4. Đánh dấu tiến trình và đồng bộ hóa

`sync_proposals` đọc các tệp đề xuất, xác thực frontmatter + kế
hoạch lát cắt, và xây dựng lại `index.json`. Nó nhanh và idempotent.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Đóng lát cắt

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "l110",
    "sliceId": "s1-claim"
  }
}
```

Điều này ghi lại trạng thái lát cắt thành `done` trong đề xuất,
xóa khóa và đồng bộ lại chỉ mục. Sau đó gọi lại `auto_work` —
nó sẽ trả về lát cắt tiếp theo (hoặc `state: "idle"` nếu kho
đã cạn).

## Những lỗi thường gặp

- **Chỉnh sửa tệp ngoài yêu cầu**: `sync_proposals` sẽ từ chối
  đánh dấu lát cắt là hoàn thành. Sử dụng lát cắt thứ hai với
  yêu cầu riêng, hoặc tách đề xuất.
- **Bỏ qua `sync_proposals`**: chỉ mục trở nên cũ. Tác nhân tiếp
  theo yêu cầu "lát cắt tiếp theo" và nhận được lát cắt sai.
- **Quên giải phóng**: khóa cũ chặn điều phối viên tiếp theo trong
  `staleMs` (mặc định 30 giây). Gọi
  `proposals_agent_lock { action: "gc" }` để dọn sạch.

## Bước tiếp theo

- [Plugin agent_worktree cô lập các tác nhân đồng thời như thế nào](#)
- [Chế độ lưu trữ cho auto_work (l109)](../../l109-feat-auto-work-persist-modes.md)
- [Round context cho công việc được tiếp tục](#)
