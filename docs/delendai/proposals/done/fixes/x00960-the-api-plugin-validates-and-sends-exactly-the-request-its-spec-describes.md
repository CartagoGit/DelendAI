---
id: x00960
title: "The api plugin validates and sends exactly the request its spec describes"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 2190e634-4f18-4b38-b19b-dfbd6c666213
last-correlation-id: 2190e634-4f18-4b38-b19b-dfbd6c666213
last-transition-from: review
last-transition-at: 2026-11-02T20:00:43.483Z
shipped-in:
  - "792de76b8f198e14d130e1484d52f8a8f768bdd2"
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
- **Status**: done
- **Files**: `plugins/api/src/index.ts`, `plugins/api/README.md`, `plugins/api/src/lib/tools/api-mock.tool.ts`, `plugins/api/src/lib/tools/api-mock.tool.spec.ts`, `plugins/api/src/lib/tools/api-call.tool.ts`, `plugins/api/src/lib/spec/resolve-spec.service.ts`, `plugins/api/src/lib/contracts/interfaces/resolve-spec.interface.ts`, `plugins/api/src/lib/mock/mock-engine.ts`, `plugins/api/src/lib/mock/mock-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "specUrl works through the injected fetcher (D71); knowledge and output agree (D81); all counted samples are returned (API-02)."
- shipped-in: `0f0f5802e363`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 792de76b8f19, validate exit 0 and tests 32/32 claimed, no recorded run cited; acceptance 1/1: (1) At 792de76b the mock tool loads a spec URL through the injected fetcher and the injected web-fetch engine, with no global fetch anywhere in the path, the knowl… — Approved on the delivered state of 792de76b8f198e14d130e1484d52f8a8f768bdd2. A spec URL is loaded through the injected fetcher, the knowledge entry and the output schema now name the same fields, and every sample the tool counts is returned. The type gate exited 0 and the two slice specs pass. One residual, recorded and not blocking: no spec asserts that the knowledge and the output agree, so that half of the criterion rests on reading the two declarations side by side, which they match field for field.

### S2 — Requests and validation follow the spec
- **Status**: done
- **Files**: `plugins/api/src/lib/spec/build-request.ts`, `plugins/api/src/lib/validate/response-validator.ts`, `plugins/api/src/lib/tools/api-validate.tool.ts`, `plugins/api/src/lib/spec/openapi.ts`, `plugins/api/src/lib/spec/openapi.spec.ts`, `plugins/api/src/lib/spec/build-request.spec.ts`, `plugins/api/src/lib/validate/response-validator.constraints.spec.ts`, `plugins/api/src/lib/spec/dereference.service.ts`, `plugins/api/src/lib/contracts/interfaces/dereference.interface.ts`
- **Gate**: type
- acceptance:
  - "Cookie parameters reach the request (API-03); a missing required body is refused (API-04); nullable, enum, min/max survive into validation (API-01)."
- shipped-in: `d70a682314e9`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 792de76b8f19, validate exit 0 and tests 35/35 claimed, no recorded run cited; acceptance 1/1: (1) At 792de76b the request builder turns the cookie parameters into one cookie header and refuses a missing required cookie or a missing required body with the re… — Approved on the delivered state of 792de76b8f198e14d130e1484d52f8a8f768bdd2. The cookie parameters reach the request in one header, a missing required body is refused with the reason, and the nullable, the enum and the bounds survive from the spec into the validation. The type gate exited 0 and the three slice specs pass. One residual, recorded and not blocking: the cookie and the refused body are pinned at the builder, not through the tool that sends the request.

## acceptance

- specUrl works through the injected fetcher (D71); knowledge and output agree (D81); all counted samples are returned (API-02).
- Cookie parameters reach the request (API-03); a missing required body is refused (API-04); nullable, enum, min/max survive into validation (API-01).
