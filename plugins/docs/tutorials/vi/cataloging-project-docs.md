---
title: Lập danh mục tài liệu dự án
plugin: docs
audience: bất kỳ tác nhân nào cần tìm tài liệu theo chủ đề
order: 1
lang: vi
---

# Lập danh mục tài liệu dự án

Plugin `docs` trả lời một câu hỏi nhỏ nhưng thường gặp: "dự án này có
những tài liệu gì, và tôi đang tìm cái nào?" Thay vì grep, tác nhân
hỏi plugin. Hướng dẫn này cho thấy cách bật, liệt kê và đọc.

## 0. Mô hình tư duy

**Tài liệu** là bất kỳ tệp `.md` nào dưới `roots` được cấu hình. Plugin
liệt kê chúng một lần, trích xuất tiêu đề (từ `# heading` đầu tiên hoặc
frontmatter `title:`), và phục vụ chỉ mục ít token. Body chỉ được lấy
theo yêu cầu.

Cấu hình nằm trong `mcp-vertex.config.json`:

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` là mảng các đường dẫn (tệp hoặc thư mục). Thư mục được duyệt
đệ quy. **Đường dẫn ngoài workspace bị từ chối** — không có duyệt `..`.

## 1. Liệt kê (chỉ mục ít token)

```json
{ "tool": "docs_list", "args": {} }
```

Phản hồi (rút gọn):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/l100-…md", "title": "l100 — Web: i18n thực…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

Danh sách được sắp xếp theo đường dẫn. Truyền `roots` để giới hạn
danh sách trong tập con (ví dụ chỉ `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Đọc một tài liệu

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Phản hồi:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…nội dung đầy đủ…",
  "truncated": false,
  "found": true
}
```

`content` được giới hạn ở 256 KiB. Nếu tài liệu lớn hơn, `truncated:
true` và body là 256 KiB đầu tiên. Nếu đường dẫn không khớp với tài liệu
nào dưới roots được cấu hình, `found: false`.

## 3. Tại sao hai công cụ không phải một

`list` rẻ (vài trăm byte mỗi tài liệu, 18 tài liệu ≈ 4 KiB). `read` đắt
(tiềm năng megabyte mỗi tài liệu). Tách chúng cho phép tác nhân `list`
trước, sau đó chỉ `read` những cái có vẻ liên quan——tiết kiệm token ở
mỗi bước khám phá.

## 4. Giới hạn đường dẫn (bảo mật)

`docs_read` giải quyết đường dẫn với `resolveWorkspaceContained` — đường
dẫn tuyệt đối, duyệt `..`, và symlinks trỏ ngoài workspace đều bị từ chối.
Phản hồi `found: false` là tín hiệu cho tác nhân rằng đường dẫn bị từ chối;
plugin cố ý không phân biệt "thiếu" với "ngoài workspace" (để tránh rò rỉ
bố cục hệ thống tệp).

## Những lỗi thường gặp

- **Root không tồn tại**: `docs_list` trả về `{ count: 0, truncated: false,
  docs: [] }`. Plugin không cảnh báo.
- **Tài liệu chưa được commit**: các tệp chưa được theo dõi vẫn được phục
  vụ (plugin đọc từ hệ thống tệp, không từ git). `path` trả về là tương
  đối với workspace.
- **Suy luận tiêu đề thất bại**: nếu heading đầu tiên không phải `# `
  (không có khoảng trắng, sai cấp) và không có frontmatter `title:`, plugin
  dùng basename của tên tệp (ví dụ `CHANGELOG.md` → `CHANGELOG.md`).
  Chạy lại sau khi sửa heading.

## Bước tiếp theo

- [`docs_list` tích hợp với `memory_recall` cho "tôi đã lưu gì + nó được ghi lại ở đâu?"như thế nào](#)
- [Xây dựng chỉ mục kiến thức với plugin `knowledge`](#)
