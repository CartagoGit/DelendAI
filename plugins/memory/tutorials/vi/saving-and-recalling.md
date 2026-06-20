---
title: Lưu và gọi lại ghi chú bộ nhớ
plugin: memory
audience: bất kỳ tác nhân nào cần tính liên tục giữa các phiên
order: 1
lang: vi
---

# Lưu và gọi lại ghi chú bộ nhớ

Hướng dẫn này cho thấy bốn công cụ `memory_*` hoạt động thực tế.
Ghi chú là các bản ghi JSON nhỏ dưới `.cache/mcp-vertex/memory/notes.json`
— đủ nhỏ để xuất toàn bộ, được lập chỉ mục theo id, có thể lấy theo
thẻ hoặc truy vấn toàn văn bản.

## 0. Mô hình tư duy

**Ghi chú** là `{ id, title, body, tags, createdAt, updatedAt }`.
Tiêu đề là duy nhất (không phân biệt chữ hoa/thường) — `memory_save`
thực hiện upsert theo tiêu đề. Không có schema cho `body`; hãy coi
nó như một trường văn bản tự do ngắn. Bí mật được tự động biên tập
bởi `redactSecrets` trước khi ghi chú được lưu trữ (xem
`packages/core/src/lib/shared/redact.ts`).

## 1. Lưu ghi chú

```json
{
  "tool": "memory_save",
  "args": {
    "title": "thứ tự xuất bản monorepo",
    "body": "core trước, sau đó các plugin cùng lúc. derive-version.ts đọc Conventional Commits kể từ tag vX.Y.Z cuối cùng.",
    "tags": ["release", "monorepo"]
  }
}
```

Phản hồi: `{ id: "<uuid>", createdAt: "..." }`. Save trả về id để bạn
có thể `forget` sau.

## 2. Gọi lại theo truy vấn

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "thứ tự xuất bản",
    "limit": 5
  }
}
```

Trả về tối đa `limit` ghi chú khớp với truy vấn (khớp chuỗi con trên
tiêu đề + body, được sắp xếp theo độ gần đây). Sử dụng `tags` thay vì
(hoặc cùng với) `query` để thu hẹp:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Liệt kê ít tốn kém

`memory_list` chỉ trả về `{ id, title, tags }` — chỉ mục. Sử dụng khi
bạn chưa muốn lấy body:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Quên

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` là xóa cứng — không có xóa mềm / lưu trữ. id biến mất;
tiêu đề được giải phóng cho `memory_save` trong tương lai.

## Những lỗi thường gặp

- **Bí mật trong `body`**: ngay cả khi plugin biên tập khi lưu, đừng
  dán các token thô hoặc giá trị kiểu `.env` — quá trình biên tập là
  heuristic, không hoàn hảo.
- **Xung đột tiêu đề**: `memory_save` thực hiện upsert theo tiêu đề.
  Nếu hai tác nhân lưu cùng tiêu đề song song, người viết thứ hai thắng
  và người đầu tiên bị mất. Sử dụng tiêu đề duy nhất cho mỗi slice /
  vấn đề.
- **Recall trả về quá nhiều kết quả**: ưu tiên `tags` hơn `query` rộng.
  Truy vấn `""` trả về mọi thứ sắp xếp theo độ gần đây — hữu ích cho
  "tôi đã lưu gì trong phiên trước?" nhưng tốn kém trên store đầy đủ.

## Bước tiếp theo

- [round_context (proposals) liên kết ghi chú bộ nhớ với đề xuất đang hoạt động như thế nào](../../proposals/tutorials/vi/getting-started.md)
- [Hợp đồng biên tập bí mật](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
