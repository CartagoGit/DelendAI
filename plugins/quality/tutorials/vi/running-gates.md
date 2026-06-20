---
title: Chạy quality gates cho bất kỳ ngôn ngữ nào
plugin: quality
audience: tác nhân cần xác thực trạng thái dự án
order: 1
lang: vi
---

# Chạy quality gates cho bất kỳ ngôn ngữ nào

Plugin `quality` được thiết kế **không phụ thuộc ngôn ngữ**: nó chạy
bất kỳ lệnh nào mà `mcp-vertex.config.json` chỉ định và báo cáo mã
thoát. Hướng dẫn này cho thấy ba nguồn scope (theo thứ tự ưu tiên),
cách chạy một scope, và cách hủy một tiến trình mất kiểm soát.

## 0. Mô hình tư duy

**Scope** là danh sách lệnh được đặt tên. Plugin chạy từng lệnh trong
scope theo thứ tự, bắt stdout/stderr và trả về báo cáo có cấu trúc
`{ ok, results: [{ command, ok, code, tail }] }`. Trường `ok` là cho
toàn bộ scope — nếu bất kỳ lệnh nào thất bại, scope không ok.

```
┌─ plugin options.scopes (ưu tiên cao nhất)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ scripts package.json được phát hiện → "all" (lint, typecheck, test, build)
```

## 1. Liệt kê các scope có sẵn (chỉ đọc)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Ví dụ phản hồi (rút gọn):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. Chạy một scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

Phản hồi là theo từng lệnh:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

Đọc `results[N].tail` để lấy bối cảnh lỗi. `tail` là 20 dòng không trống
cuối cùng (giới hạn 64 KiB tổng đầu ra) — đủ để gỡ lỗi mà không làm
ngập context của tác nhân.

## 3. Hủy tiến trình mất kiểm soát

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Gửi `SIGKILL` đến nhóm tiến trình của mỗi lần chạy đang diễn ra.
Truyền `{ "pid": <number> }` để hủy một cái. Hủy không chặn: `results`
của lần gọi tiếp theo sẽ phản ánh việc kill.

## 4. Làm cho không phụ thuộc ngôn ngữ

Core chạy những gì config của bạn nói. Ví dụ cho dự án đa ngôn ngữ
(TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` sẽ chạy **cả bốn lệnh** trong các scope `typecheck` /
`test`, bất kể ngôn ngữ. Exit 0 = qua; khác không = thất bại (bất kể
binary nào phát ra).

## 5. Tăng cường với chính sách lệnh (M13)

`run_quality` **thực thi** những gì config host nói. Để hạn chế những
binary nào có thể chạy khi tác nhân ít tin cậy hơn gọi công cụ, sử
dụng `commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

Một lệnh bị chặn được báo cáo với `code: 126` và lý do ("blocked by
command policy") và **không bao giờ được khởi chạy**. `deny` thắng `allow`;
`allow` rỗng có nghĩa là "bất kỳ binary nào không bị từ chối".

## Những lỗi thường gặp

- **`run_quality` không thay thế `bun run validate`**: script `validate`
  của core chạy bốn kiểm tra trực tiếp. `run_quality` dành cho các lần
  chạy **ad-hoc** và nội quan theo scope từ tác nhân. Cả hai đều hợp lệ;
  chúng không nói chuyện với nhau.
- **Lệnh chạy dài vượt quá timeout** bị kill với `code: 124` và
  `timedOut: true`. Timeout mặc định là 600 000 ms (10 phút). Ghi đè
  mỗi runner nếu cần.
- **Polling "xong chưa?"**: đừng làm. `run_quality` là đồng bộ. Nếu
  bạn cần biết về các scope dài, sử dụng `quality_cancel` với `pid`
  từ `activeRunPids` (qua metrics hoặc lần gọi công cụ tiếp theo).

## Bước tiếp theo

- [Quality gates đa ngôn ngữ (l107)](../../l107-multilang-quality-gates.md)
- [Ranh giới tin cậy & chính sách lệnh (M13)](../../l107-multilang-quality-gates.md#5-no-objetivos)
