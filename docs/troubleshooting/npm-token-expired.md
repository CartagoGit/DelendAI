---
slug: npm-token-expired
symptom: "`bun run release --publish` (or the CI release workflow) fails with a 401/403 from the npm registry, or the scheduled `rotate-npm-token.yml` issue keeps reopening every quarter."
cause: "npm retired Legacy and Automation tokens in November 2025 — the only token type left is **Granular**, and granular write tokens expire after 90 days maximum. The `NPM_TOKEN` repository secret silently goes stale once it crosses that window; nothing fails until the next publish attempt."
fix: "Generate a new Granular token at npmjs.com → Access Tokens, scoped to the `@cartago-git` org with *Read and write* permissions and **Bypass 2FA** enabled (required so CI doesn't get prompted for an OTP), expiration 90 days (the legal maximum). Replace the `NPM_TOKEN` secret under *Settings → Secrets → Actions*. The `rotate-npm-token.yml` workflow already opens a reminder issue ~3 months in — treat that issue as the trigger, not a false alarm."
tags: [release, npm, ci]
closedBy: "docs/NPM_PUBLISH.md §0.1–0.2"
---

A release that worked last month can fail today for no code-related reason —
npm token rotation is **time-based**, not triggered by any change in this
repository. If the failure is a 401/403 specifically on the publish step (not
on build/test), check the token's age before looking anywhere else.
