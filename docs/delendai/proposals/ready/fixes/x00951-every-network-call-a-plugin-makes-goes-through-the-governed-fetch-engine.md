---
id: x00951
title: "Every network call a plugin makes goes through the governed fetch engine"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/README.md`
- **Gate**: type
- acceptance:
  - "The engine resolves the host, checks the resolved IP against the allow-list and private-range policy, and connects to that IP; a spec with a host resolving to 127.0.0.1 is refused (D121)."
  - "A malformed Location returns a typed redirect error (NET-02)."

### S2 — api and remote-provider-core use the engine and their base
- **Status**: pending
- **Files**: `plugins/api/src/lib/spec/openapi.ts`, `plugins/api/src/lib/tools/api-call.tool.ts`, `plugins/remote-provider-core/src/lib/http-client.ts`, `packages/core/src/lib/cli/assemble.ts`
- **Gate**: type
- acceptance:
  - "specUrl is fetched through the allow-listed engine with its timeout and maxBytes; a spec over the cap is refused (NET-01, D40)."
  - "A `path` that is an absolute URL or leaves baseUrl's origin is refused before the token is attached (D54)."
  - "api_call declares its network effect in `effects:` (G102)."

### S3 — gitlab, forge, observability and usage-tracking cap and declare
- **Status**: pending
- **Files**: `plugins/gitlab/src/lib/client.ts`, `plugins/forge/src/lib/services/forge-write.ts`, `plugins/forge/tests/src/lib/services/forge-write.spec.ts`, `plugins/observability/src/lib/errors/list-errors.ts`, `plugins/observability/src/lib/tools/obs-errors.tool.ts`, `plugins/usage-tracking/src/index.ts`
- **Gate**: type
- acceptance:
  - "The gitlab timeout covers the body read and maxBytes aborts the stream when exceeded (GLAB-02, GLAB-03)."
  - "createPr bounds the linked-proposal section and links the full document instead (D23)."
  - "obs_errors makes one capped credentialed request (G104) and declares its effect (G102)."
  - "The price table is not fetched unless the user enables it, and the effect is declared (G103)."

## acceptance

- The engine resolves the host, checks the resolved IP against the allow-list and private-range policy, and connects to that IP; a spec with a host resolving to 127.0.0.1 is refused (D121).
- A malformed Location returns a typed redirect error (NET-02).
- specUrl is fetched through the allow-listed engine with its timeout and maxBytes; a spec over the cap is refused (NET-01, D40).
- A `path` that is an absolute URL or leaves baseUrl's origin is refused before the token is attached (D54).
- api_call declares its network effect in `effects:` (G102).
- The gitlab timeout covers the body read and maxBytes aborts the stream when exceeded (GLAB-02, GLAB-03).
- createPr bounds the linked-proposal section and links the full document instead (D23).
- obs_errors makes one capped credentialed request (G104) and declares its effect (G102).
- The price table is not fetched unless the user enables it, and the effect is declared (G103).
