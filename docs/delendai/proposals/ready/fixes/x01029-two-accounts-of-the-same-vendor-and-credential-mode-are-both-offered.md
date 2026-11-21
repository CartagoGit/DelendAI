---
id: x01029
title: "Two accounts of the same vendor and credential mode are both offered"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
---

# x01029 — Two accounts of the same vendor and credential mode are both offered

## goal

The accounts offer treats an account as already known only when its identity matches, so a second login of the same vendor in the same credential mode (a personal and a work subscription, two API keys) is offered and not hidden.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-21: accountOffers() considers an account known when the vendor and the credential mode match even if the account id differs; this avoids duplicates but can hide a legitimate second account of the same provider. The reviewer rated it a functional risk to test, not a confirmed bug, and also listed as untested: several accounts of one provider, expired credentials, clients that do not expose their authentication state. Verified in the code on develop (3188f9414, 2026-11-04): alreadyKnown() in packages/core/src/lib/plugins/account-offers.service.ts lines 37-49 still returns true on (each.vendor === account.vendor && each.credentialMode === account.credentialMode). f00775 and f00781 (done) delivered the offer and did not change this rule. Product principles (AGENT-BOOTSTRAP section 0): easy to use (the default finds the person's accounts) and agnostic (any vendor).

## non-goals

- Changing where accounts are found or how automation consent works.

## slices

- global_gate: type

### S1 — Known means the same account, not the same kind of account
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/account-offers.service.ts`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Two findings of one vendor and one credential mode with different identities are both offered."
  - "A finding that repeats a known or declined identity is still not offered again."
  - "A spec pins both cases."

## acceptance

- Two findings of one vendor and one credential mode with different identities are both offered.
- A finding that repeats a known or declined identity is still not offered again.
- A spec pins both cases.
