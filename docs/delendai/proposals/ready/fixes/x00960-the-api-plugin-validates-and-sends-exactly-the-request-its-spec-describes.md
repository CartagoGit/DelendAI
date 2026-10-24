---
id: x00960
title: "The api plugin validates and sends exactly the request its spec describes"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00960 — The api plugin validates and sends exactly the request its spec describes

## goal

api_mock is wired to the spec fetcher it advertises and returns the shape its knowledge describes and every sample it counts; api_call sends cookie parameters and refuses a missing required body; and validation keeps nullable and the constraints of the spec.

## why

Joint audit a00095 and gpt-6.1-sol. D71: api_mock advertises specUrl but the plugin never injects a fetcher. D81: the knowledge describes an api_mock output shape the tool does not return. API-01: the parser loses nullable and constraints before validating. API-02: api_mock counts samples but serialises one. API-03: api_call accepts cookie parameters and drops them. API-04: api_call omits a required requestBody without error.

## non-goals

- The spec loader's network policy (x00951 S2).

## slices

- global_gate: type

### S1 — api_mock
- **Status**: pending
- **Files**: `plugins/api/src/index.ts`, `plugins/api/src/lib/tools/api-mock.tool.ts`, `plugins/api/src/lib/tools/api-mock.tool.spec.ts`, `packages/ui-extension/src/dashboard/render-tool-detail.ts`, `extensions/vscode/src/commands/open-tool-detail.ts`
- **Gate**: type
- acceptance:
  - "specUrl works through the injected fetcher (D71); knowledge and output agree (D81); all counted samples are returned (API-02)."

### S2 — Requests and validation follow the spec
- **Status**: pending
- **Files**: `plugins/api/src/lib/spec/build-request.ts`, `plugins/api/src/lib/validate/response-validator.ts`, `plugins/api/src/lib/tools/api-validate.tool.ts`
- **Gate**: type
- acceptance:
  - "Cookie parameters reach the request (API-03); a missing required body is refused (API-04); nullable, enum, min/max survive into validation (API-01)."

## acceptance

- specUrl works through the injected fetcher (D71); knowledge and output agree (D81); all counted samples are returned (API-02).
- Cookie parameters reach the request (API-03); a missing required body is refused (API-04); nullable, enum, min/max survive into validation (API-01).
