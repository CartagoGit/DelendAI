# Commit-policy: completed production-source reading and remaining validation

Auditor: `gpt-6.1-sol` (Codex), 2026-10-20. Source: `bec5d5daf945df78464e4535c47628809ef8ca64`.

The previous coverage card understated production reading: its ledger contains complete reads for every one of the 94 entries classified as production, including three colocated specs. All 94 hashes still match this source revision. Thus **91 actual production TypeScript files** have complete source reads; 68 remaining entries were tests/metadata. The [ledger](commit-policy-ledger.json.txt) records the distinction. Complete reading is not a claim of complete runtime validation or absence of defects.

The plugin automates scoped commits, work-reference persistence and optional push on manual, slice, interval and threshold triggers. Its entrypoint supplies the workspace, ownership filters, branch-protection adapter, policy persistence, settlement hooks and lifecycle cleanup. It is implemented independently of a particular forge through the Git runner and protection adapter. Remote refresh and push still require real forge/runtime checks outside the offline fixtures.

Existing independent CP-01 through CP-11 remain recorded in the root finding index with their historical source anchors and exact experiments. These include lost protection state after refresh failure, porcelain quoting and directory count errors, alternative checkpoint attribution, optional commit-message metadata damage, an unregistered status tool, surface-budget drift and repair/handoff wiring gaps. Current source identity preserves their relevant local paths; no claim is made that every integration consequence was reproduced against a live host.

## CP-12: entering settlement does not establish an atomic quiet boundary

**Severity:** P2. **State:** confirmed at the seam boundary below. **Component:** commit-policy settlement tool and engine. **Source:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** `plugins/commit-policy/src/lib/tools/settlement-tool.ts:83-96`; `plugins/commit-policy/src/lib/settlement/worker.registry.ts:133-140`; `plugins/commit-policy/src/lib/engine.ts:577-597`.

```ts
// settlement-tool.ts
const status = await readStatus();
// ... reject an unknown or positive worker count ...
await registry.setPhase('settling');

// engine.ts
const phase = await input.settlementRead();
if (phase === 'settling' && /* not an exempt repair */) {
  return /* refusal */;
}
// Git work follows outside the settlement read.
```

**Expected:** a successful enter acknowledges an atomic boundary preventing a previously unaccounted normal slice from starting Git work during validation.

**Observed:** a worker count read of zero and an engine phase read of active can both precede the phase change. The tool acknowledges settling while that engine operation subsequently passes the barrier. Neither the read/count transition nor the engine's full operation shares one admission lock with the other.

**Reproduction:** the attached two-process `repro-settlement-enter-race.ts.txt` pauses the count source after capturing zero, publishes an owned fixture claim, pauses the real engine's injected phase read after capturing active, permits the real tool to enter, then resumes the engine. Both child processes exit zero. The tool returns `{ack:"OK",phase:"settling"}`; the engine calls branch/status/config operations after the shared registry is settling. The injected Git runner refuses afterward and **no commit or push occurs**.

**Evidence:** `settlement-enter-race.log` and `settlement-run.json.txt`. These are two real Bun processes, a real tool and registry, but injected count/phase seams and a Git runner. They are not two public MCP servers or an observed validation run. The fixture claim is written directly, not claimed through the proposals API; no double grant is asserted.

**Impact:** the settlement acknowledgement does not prove that the branch will remain quiet. A concurrent operation can overlap validation. Commit corruption, a production Git write and failure frequency were not demonstrated.

**Cause:** read-then-act admission across separate operations. Taking a file mutex only around `setPhase` does not cover already admitted operations.

**Recommendation:** define a common admission protocol for normal workers/commits and settlement, retaining in-flight admissions until completion. Enter settling only after admissions are closed and drained; repair exemptions remain explicit. Do not add an unrelated lock that only serializes state writes.

**Regression:** rendezvous-controlled independent processes with the two read windows must either refuse enter until the slice leaves, or refuse the slice before any Git write once enter succeeds. Cover the public claim/engine composition in addition to this deterministic seam test.

**Confidence:** high for the deterministic interleaving and passed gate; medium for real host scheduling and operational impact. **Relation:** executable refinement of G49; not an additional unrelated defect. **Resolution:** documented only, no product changes.

## Contracts, effects, lifecycle and provisional score

Each registered tool has an output schema, but compact schemas deliberately allow broad envelopes; status has a builder and tests without productive registration. The manifest budget is below the previously measured MCP definitions. The historical tool-list experiment recorded seven tools and 9,338 definition bytes; this is serialized UTF-8, not host token billing. The current revision preserves the registration source; output distributions and real-host billing remain unmeasured.

The engine's settlement barrier really exists and has explicit repair exemptions. Fresh unknown lock state refuses settlement rather than silently equating unreadable with zero. Worker state changes use a mutex plus atomic writes. Runtime teardown and ownership filtering are positive properties. The new experiment shows why these individual controls do not establish a global transaction by themselves.

Current focused validation: **three spec files, 14 tests passed**, recorded in `settlement-tests.log`. The historical broad suite is preserved separately; it is not presented as a new full-suite run. The new fixture uses only owned temporary state and removes it afterward. No provider, credentials, forge mutation or live repository commit was involved.

**Provisional score: 4/10.** Scoped policy, lifecycle and meaningful focused tests are present, but multiple reproduced local contract/persistence failures affect the plugin's central promise of predictable commits. Prioritize the atomic admission boundary and correct work ownership, then stable porcelain parsing and status/documentation consistency. Source reading is complete; full tests/spec reading, live host scheduling, cross-platform behavior and real remote enforcement remain open.
