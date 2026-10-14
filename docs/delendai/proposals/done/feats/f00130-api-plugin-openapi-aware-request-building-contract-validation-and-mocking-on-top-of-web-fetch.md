---
id: f00130
kind: feat
title: api plugin — OpenAPI-aware request building, contract validation and mocking on top of web-fetch
status: done
date: 2026-07-23
track: plugin+api+integration
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 4 commits referencing f00130 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 4-commit batch
shipped-in:
  - 9672738e # feat(f00130): S3 — api_mock registration + knowledge catalog + README
  - 217e1609 # feat(f00130): add api_validate contract validator
  - 0f407093 # feat(f00130): S2 api_validate — contract validation against OpenAPI schema
  - dcac0462 # feat(f00130): S1 — api plugin spec parse + request build (api_call)
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

- **Status**: done
- **Files**: `plugins/api/src/lib/spec/`, `plugins/api/src/lib/tools/api-call.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `lib/spec/openapi.ts`:
      - Pure OpenAPI 3.x parser (`parseOpenApi`) that returns an
        `IOpenApiSpec`: title, version, servers, and an
        `operations` map keyed by `operationId`. The parser never
        throws on malformed input — `parseNote` carries the
        diagnostic for the host's renderer.
      - `IOperationParam` (path / query / header / cookie),
        `IOperationResponse`, and a minimal `IJsonSchema` so
        S2's contract validator and S3's mock generator can
        share the same shape.
      - `fetchAndParseSpec({ url, allowList, ... })` is a thin
        allow-listed wrapper around `IFetchLike` that decodes
        the body and feeds it to `parseOpenApi`. Honours
        `maxBytes` + `timeoutMs` from `IWebFetchOptions`.
  - `lib/spec/build-request.ts`:
      - Pure `buildRequest({ operation, params, body, baseUrl?,
        specServers? })` → `{ method, url, headers, body? }`.
        Path-template substitution is URL-encoded; missing
        required path params throw. `baseUrl` overrides
        `specServers[0]` so the same spec can target
        multiple environments without re-parsing.
      - `coerceValue(schema, value)` is a best-effort
        primitive-type coercer (number/integer/boolean).
        Strict contract enforcement is S2.
  - `lib/tools/api-call.tool.ts` registers `api_call` with
    `tags: ['api', 'openapi', 'network', 'effects']`. Strict
    zod input: `operationId`, `params?`, `body?`, `baseUrl?`,
    `spec?`, `specUrl?`, `allowList?`, `timeoutMs?`, `maxBytes?`.
    Always returns a structured `toolError` envelope (with an
    actionable `nextAction`) when the spec is missing, the
    `operationId` is unknown, `buildRequest` throws, or
    `webFetch` rejects the URL — never a crash.
  - 16 tests pass (10 spec+builder + 6 tool): parse-server,
    parse-parameters, parse-requestBody, parse-soft-error,
    path-template substitution, optional-query drop,
    missing-required-path throws, JSON body stringification,
    baseUrl override, tool registration, missing-spec
    install-hint, unknown-operationId install-hint,
    buildRequest-failure install-hint, success path, and
    webFetch rejection path.
  - Public barrel re-exports the parser, builder, type
    shapes, and the tool registration for S2/S3.

### S2 — contract validation

- **Status**: done
- **Files**: `plugins/api/src/lib/validate/`, `plugins/api/src/lib/tools/api-validate.tool.ts`
- **Gate**: bun run validate

- implementation:
  - `lib/validate/response-validator.ts` adds a pure JSON Schema walker over
    the parsed OpenAPI response schema. It emits normalized r00012 findings
    for missing required fields, type mismatches, enum drift, email/uri
    format errors, nullable handling, nested array/object mismatches and
    closed-object extra properties. Unsupported `oneOf` / `anyOf` surfaces
    fail fast with a typed `unsupported-schema-feature` error so the host can
    return a structured hint instead of crashing.
  - `lib/tools/api-validate.tool.ts` registers `api_validate` with strict zod
    input (`operationId`, `response`, `spec?`, `specUrl?`, `allowList?`,
    `timeoutMs?`, `maxBytes?`). It reuses the S1 spec parser, returns the
    standard `toolError` envelope for missing spec / unknown operation /
    blocked specUrl fetches, and projects validation results as normalized
    findings + summary + worst severity.

`api_validate` checks a response against the schema → normalized findings
(r00012) on mismatch. Pure validator.

### S3 — mock server-from-spec + catalog

- **Status**: done
- **Files**: `plugins/api/src/lib/mock/`, `plugins/api/README.md`
- **Gate**: bun run validate
- implementation:
  - `lib/mock/mock-engine.ts` is the pure `IJsonSchema` → example generator.
    It honors explicit `example` first, then `enum` (any-of the canonical
    values), then walks `type`. The walker recognises the standard JSON
    Schema primitives plus the `format` formats the S1 parser preserves
    (`date-time`, `date`, `email`, `uuid`, `uri`/`url`). Numeric ranges
    (`minimum`/`maximum`) and array bounds (`minItems`/`maxItems`) are
    honored so the generated values stay inside the declared envelope.
    Required object keys are always included; optional keys are dice-rolled
    when `randomize: true` and skipped when `randomize: false` so unit
    tests can pin the projection. The engine is deterministic: the same
    spec + options + seed produce the same output, every time.
  - `mockResponseForStatus(operation, statusCode, options, deps)` and
    `mockHappyPath(operation, options, deps)` select the right declared
    response (`status` exact match → fall back to `default` → fall back
    to the first declared response). `generateOperationMock` returns one
    example per declared response for a `api_mock` host that wants the
    full response matrix.
  - `lib/tools/api-mock.tool.ts` registers `api_mock` with strict zod
    input (`operationId` or `method`+`path`, optional `statusCode`,
    `count`, `randomize`, `spec?`, `specUrl?`, `allowList?`, `timeoutMs?`,
    `maxBytes?`). It reuses the S1 spec parser; missing spec / unknown
    operation / blocked specUrl / install-required fetch seam all return
    the standard `toolError` envelope. `count` is capped at 32 to keep
    the response bounded; the host can opt into fresh-looking samples
    with `randomize: true` (default).
  - The plugin entry point (`src/index.ts`) registers `api_call`,
    `api_validate` and `api_mock`; knowledge entries for `api_validate`
    and `api_mock` document inputs/outputs so the agent catalog renders
    them without an extra round-trip.
  - Wired into `tsconfig.base.json`, `vitest.shared.ts`,
    `plugin-defaults.ts`, `release-plan.ts` PUBLISH_ORDER, and added to
    the `full` preset (it depends on the allow-listed web-fetch engine
    the full preset already ships). The `vertex` preset also lists it
    so the mcp-vertex project's own bootstrap sees the full surface.
  - 14 mock-engine + 9 tool tests = 23 net-new tests; full api plugin
    suite is 69/69. `verify:plugin-wiring:advisory` reports api fully
    wired. `verify:tools` lists `mcp-vertex_api_api_mock` and the
    other two tools as part of the 179-tool surface.

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
