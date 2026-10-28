---
id: x00951
title: "Every network call a plugin makes goes through the governed fetch engine"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: d25bdc71-2f05-4de8-92e5-7087d8ee596c
last-correlation-id: d25bdc71-2f05-4de8-92e5-7087d8ee596c
last-transition-from: in-progress
last-transition-at: 2026-10-24T22:02:51.524Z
shipped-in:
  - "ff2b7f7e209c782f4ac4d22a3cb31434e444f4c2"
---

# x00951 — Every network call a plugin makes goes through the governed fetch engine

## goal

Plugins fetch only through the web-fetch engine's allowList, timeout and size cap, which checks the resolved address as well as the host name; a provider never sends its bearer token to a URL outside its base; downloads are capped while they stream; and each network effect is declared as an effect, not a free label.

## why

Joint audit a00095 and gpt-6.1-sol. NET-01 (P1) and D40: api_call's specUrl loading bypasses the allow-listed engine and its size limit (fetchAndParseSpec ignores allowList/timeout/maxBytes). D54: remote-provider-core accepts an absolute URL in `path` and sends the bearer token to it. D121: web-fetch's allow-list checks the host name, not the resolved IP (DNS rebinding). NET-02: a malformed Location header throws instead of a typed result. GLAB-02: the gitlab HTTP timeout is cancelled before the body is read. GLAB-03: maxBytes limits what is stored, not what is downloaded into memory. D23: forge createPr inserts the whole proposal in the remote body with no size limit. G104: obs_errors makes two requests per query and the credentialed one has no cap. G103: usage-tracking downloads a third-party price table at start-up, undeclared. G102: the network effect of api_call and obs_errors is a free label, not an `effects:` declaration.

## non-goals

- Filesystem containment (the containment proposal).
- Secret redaction (the secrets proposal).

## slices

- global_gate: type

### S1 — The engine checks the address it connects to
- **Status**: done
- **Files**: `packages/core/src/lib/scan/magic-numbers.ts`, `packages/core/tests/src/lib/scan/magic-numbers.spec.ts`, `plugins/web-fetch/README.md`, `plugins/web-fetch/src/generated/tool-outputs.ts`, `plugins/web-fetch/src/index.ts`, `plugins/web-fetch/src/lib/contracts/constants/private-address-ranges.constant.ts`, `plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts`, `plugins/web-fetch/src/lib/services/address-policy.ts`, `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/src/lib/services/read-body-capped.ts`, `plugins/web-fetch/src/lib/tools/tools.ts`, `plugins/web-fetch/tests/src/lib/services/address-policy.spec.ts`
- **Gate**: type
- acceptance:
  - "The engine resolves the host of every hop and refuses a private, loopback or link-local address unless the allow-list names it or allowPrivateAddresses is set; a spec with a host resolving to 127.0.0.1 is refused before any request. The runtime's fetch takes no pinned address, so the README states the remaining resolver race (D121)."
  - "A malformed Location returns a typed redirect error (NET-02)."
- shipped-in: `3f36999f94e0`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ff2b7f7e209c, validate exit 0 and tests 61/61 claimed, no recorded run cited; acceptance 2/2: (1) engine.ts:213-264 resolves the host of every hop and refuses a private, loopback or link-local address unless the allow-list names it or allowPrivateAddresses … (2) engine.ts:301-319 wraps the Location header in a try/catch and returns a typed redirect error with the reason redirect-invalid and the offending value; the rea… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 26 tests and the engine, plugin-options and network-capability suites 4 files / 35 tests, exit 0.

### S2 — api and remote-provider-core use the engine and their base
- **Status**: done
- **Files**: `plugins/api/src/lib/contracts/interfaces/load-spec.interface.ts`, `plugins/api/src/lib/spec/openapi.spec.ts`, `plugins/api/src/lib/spec/openapi.ts`, `plugins/api/src/lib/tools/api-call.tool.ts`, `plugins/api/src/lib/tools/api-validate.tool.ts`, `plugins/remote-provider-core/src/lib/http-client.ts`, `plugins/remote-provider-core/tests/http-client.spec.ts`
- **Gate**: type
- acceptance:
  - "specUrl is fetched through the allow-listed engine with its timeout and maxBytes; a spec over the cap is refused (NET-01, D40)."
  - "A `path` that is an absolute URL or leaves baseUrl's origin is refused before the token is attached (D54)."
  - "api_call declares its network effect in `effects:` (G102)."
- shipped-in: `1a0ef9778616`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — gitlab, forge, observability and usage-tracking cap and declare
- **Status**: done
- **Files**: `plugins/forge/src/lib/services/forge-write.ts`, `plugins/forge/tests/src/lib/services/forge-write.spec.ts`, `plugins/gitlab/src/lib/client.ts`, `plugins/gitlab/src/lib/read-capped.helper.ts`, `plugins/gitlab/src/lib/tools/shared.ts`, `plugins/gitlab/tests/src/lib/client.spec.ts`, `plugins/observability/src/lib/errors/list-errors.ts`, `plugins/observability/src/lib/tools/obs-errors.tool.spec.ts`, `plugins/observability/src/lib/tools/obs-errors.tool.ts`, `plugins/usage-tracking/README.md`, `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/src/lib/pricing.ts`, `plugins/usage-tracking/tests/src/lib/pricing.spec.ts`, `plugins/web-fetch/src/lib/services/engine.ts`
- **Gate**: type
- acceptance:
  - "The gitlab timeout covers the body read and maxBytes aborts the stream when exceeded (GLAB-02, GLAB-03)."
  - "createPr bounds the linked-proposal section and links the full document instead (D23)."
  - "obs_errors makes one capped credentialed request through the engine, reports a source it cannot read (G104), and declares its effect (G102)."
  - "The price table is not fetched unless the user sets refreshPrices, under the plugin's declared network permission (G103)."
- shipped-in: `30cb0c07d84e`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The engine resolves the host of every hop and refuses a private, loopback or link-local address unless the allow-list names it or allowPrivateAddresses is set; a spec with a host resolving to 127.0.0.1 is refused before any request. The runtime's fetch takes no pinned address, so the README states the remaining resolver race (D121).
- A malformed Location returns a typed redirect error (NET-02).
- specUrl is fetched through the allow-listed engine with its timeout and maxBytes; a spec over the cap is refused (NET-01, D40).
- A `path` that is an absolute URL or leaves baseUrl's origin is refused before the token is attached (D54).
- api_call declares its network effect in `effects:` (G102).
- The gitlab timeout covers the body read and maxBytes aborts the stream when exceeded (GLAB-02, GLAB-03).
- createPr bounds the linked-proposal section and links the full document instead (D23).
- obs_errors makes one capped credentialed request through the engine, reports a source it cannot read (G104), and declares its effect (G102).
- The price table is not fetched unless the user sets refreshPrices, under the plugin's declared network permission (G103).
