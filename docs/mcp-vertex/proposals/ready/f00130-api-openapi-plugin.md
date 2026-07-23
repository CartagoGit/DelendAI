---
id: f00130
kind: feat
title: api plugin — OpenAPI-aware request building, contract validation and mocking on top of web-fetch
status: ready
date: 2026-07-23
track: plugin+api+integration
---

# f00130 — api plugin

## goal

An `api` plugin that turns an OpenAPI/Swagger spec into a structured tool
surface: parse the spec, **build and send** allow-listed requests, **validate**
responses against the schema (contract testing), and **mock** endpoints from
the spec — a structured layer above `web-fetch`'s single-URL fetch.

## why

Most projects integrate at least one HTTP API; today an agent hand-crafts
requests with `web-fetch` and no schema awareness. Spec-driven requests +
contract validation catch integration drift early and make API work
reproducible.

## why this design

Compose the **web-fetch engine** for the actual transport (allow-list, bounds,
redaction) — the `api` plugin adds only the OpenAPI intelligence: a pure spec
parser, a pure request builder (path/params/body from the schema), and a pure
response validator. Mocking is generated from the same parsed spec. No new
network seam, no secret handling beyond web-fetch's.

## non-goals

- No transport of its own — everything goes through web-fetch's allow-list.
- No code generation of client SDKs (out of scope; refer to `refactor`).
- No mutating calls without the same consent web-fetch requires.

## slices

### S1 — spec parse + request build

- **Status**: pending
- **Files**: `plugins/api/src/lib/spec/`, `plugins/api/src/lib/tools/api-call.tool.ts`
- **Gate**: bun run validate

Parse OpenAPI 3.x; `api_call` builds a request for an operationId from
params/body and sends via web-fetch. Pure builder over the parsed spec.

### S2 — contract validation

- **Status**: pending
- **Files**: `plugins/api/src/lib/validate/`, `plugins/api/src/lib/tools/api-validate.tool.ts`
- **Gate**: bun run validate

`api_validate` checks a response against the schema → normalized findings
(r00012) on mismatch. Pure validator.

### S3 — mock server-from-spec + catalog

- **Status**: pending
- **Files**: `plugins/api/src/lib/mock/`, `plugins/api/README.md`
- **Gate**: bun run validate

`api_mock` generates example responses from the spec for local testing;
catalog + wiki + pack membership (`backend-api`).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Builds a valid request for a fixture spec operation and validates a response,
  flagging a seeded schema mismatch.
- All transport goes through web-fetch's allow-list; no separate network path.

## notes

Reuses the web-fetch engine. Prior art: Postman/Insomnia, Prism mock,
openapi-fetch. Pairs with `backend-api` pack (r00011).
