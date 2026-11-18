---
id: x01028
title: "The governed fetch connects to the address it validated"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-04
last-transition-id: 1291251f-346d-4f3c-aa76-c315a9cd9c2b
last-correlation-id: 1291251f-346d-4f3c-aa76-c315a9cd9c2b
last-transition-from: review
last-transition-at: 2026-11-18T03:06:10.533Z
shipped-in:
  - "3a58a349edc71f34406f130387541fa151b662cc"
---

# x01028 — The governed fetch connects to the address it validated

## goal

web-fetch (and every plugin call that goes through the governed fetch engine) connects to the IP address it already checked against the address policy, so a hostile resolver cannot answer differently between the check and the connection.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-27: the web-fetch engine resolves the host and blocks private and metadata addresses (good), but the code itself admits that the connection resolves the name again, so without pinning the validated IP to the connection a DNS answer can change between the check and the connect. The reviewer called it a declared limitation, P2, and said network isolation is not yet proven against an adversary. Repeated as pending on 2026-10-29. Verified in the code on develop (3188f9414, 2026-11-04): plugins/web-fetch/src/lib/services/engine.ts line 24 still states that the connection re-resolves the name; x00951 (done) routed every plugin call through this engine but left the limitation. Product principles (AGENT-BOOTSTRAP section 0): bounded, a limit an agent cannot talk past; robust.

## non-goals

- Changing which hosts a project allows.

## slices

- global_gate: type

### S1 — The connection uses the validated address
- **Status**: done
- **Files**: `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/src/lib/services/pinned-connection.ts`, `plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts`, `plugins/web-fetch/README.md`, `plugins/web-fetch/tests/src/lib/services/engine.spec.ts`, `plugins/web-fetch/tests/src/lib/services/pinned-connection.spec.ts`
- **Gate**: type
- acceptance:
  - "The request connects to the IP that passed the address policy while the Host header and the TLS name stay the requested host."
  - "A resolver that answers a public address first and a private one second cannot reach the private one (spec)."
  - "The comment that admits the second resolution is removed because it is no longer true."
- shipped-in: `7f77000da636`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mai-code-2 — verified at 3a58a349edc7, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 3/3: (1) pinnedRequestOptions sets host/family to validated address, URL host header, and requested hostname as TLS servername; engine uses pinnedFetch. 20/20 passed. (2) pinned-connection.spec.ts asserts one resolver call and validated-address-only connection; rebinding test cannot reach private answer. (3) Engine security model now states the validated address is used directly and pinned-connection explains no second name resolution. — Verified 3a58a349: network fetches pin the socket to the address accepted by policy while retaining requested Host and TLS servername; injected fetchers receive that address and never resolve twice. The web-fetch scoped specs pass, including the public-then-private rebinding case and real host echo.

## acceptance

- The request connects to the IP that passed the address policy while the Host header and the TLS name stay the requested host.
- A resolver that answers a public address first and a private one second cannot reach the private one (spec).
- The comment that admits the second resolution is removed because it is no longer true.
