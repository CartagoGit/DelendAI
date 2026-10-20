# Additional bounded findings

Auditor: gpt-6.1-sol (Codex), 2026-10-20. Source: `bec5d5daf945df78464e4535c47628809ef8ca64`. Each entry distinguishes production code from injected ports. No product fixes are included.

### SEARCH-01 — Content-hash index drops distinct paths with identical contents

**Severity:** P2. **State:** confirmed. **Component:** search/semantic. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/search/src/lib/embed/embed-pipeline.ts:223-245; plugins/search/src/lib/tools/search-semantic.tool.ts:270-279

```ts
nextIndex = { ...removeDuplicatePaths(nextIndex, file.relPath), [file.hash]: entry };
```

**Expected:** Retain every discovered file path while sharing vectors where appropriate.

**Observed:** Two owned files a.ts/b.ts with identical text are discovered; the resulting index contains only b.ts. Semantic ranking enumerates index values, losing a path.

**Reproduction:** Run repro-search-issues.ts.txt case SEARCH-01: real pipeline, owned files, deterministic fake embedder and in-memory store.

**Evidence:** evidence/completion-final-root/search-issues-repro.log

**Impact:** Incomplete semantic recall; lexical mode is outside this failure. No content file is deleted.

**Root cause:** A single content-hash key stores one path and overwrites a prior member.

**Recommendation:** Separate path membership from vector cache, or store multiple paths per content key.

**Regression:** Index two identical files and require both paths in semantic results, including incremental update/removal.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** New specific defect; distinct from G82 root selection.

### SEARCH-02 — Warm semantic cache ignores embedder identity and dimensions

**Severity:** P2. **State:** confirmed. **Component:** search/semantic. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/search/src/lib/embed/embed-pipeline.ts:223-230; plugins/search/src/lib/embed/index-store.ts:15-17,125

```ts
const cached = currentIndex[file.hash];
if (cached !== undefined && cached.path === file.relPath) { /* reuse cached.vector */ }
```

**Expected:** Reuse vectors only within the same compatible embedding model and version.

**Observed:** After embedder A creates a vector [1,0], switching to B with id B and three dimensions makes zero B embed calls and reuses [1,0].

**Reproduction:** Run the independent SEARCH-02 case with one file and an in-memory index; no provider/network.

**Evidence:** evidence/completion-final-root/search-issues-repro.log

**Impact:** Rankings can compare incompatible vector spaces and silently return misleading results. Billing or provider reliability was not tested.

**Root cause:** Cache identity includes content/path, not embedder/model/version/dimension.

**Recommendation:** Namespace the cache by an explicit embedding fingerprint and invalidate incompatible entries.

**Regression:** Change model identity/dimensions against a warm cache; require re-embedding. Retain reuse for unchanged fingerprint.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** New specific cache-identity defect, related to but not the same failure as SEARCH-01.

### ISSUES-01 — Multiline comment serialization loses continuation and metadata

**Severity:** P2. **State:** confirmed. **Component:** issues/scaffold. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/issues/src/lib/frontmatter.ts:32-45,100,150-177,244-249; plugins/issues/src/lib/tools/resolve-issue.tool.ts:112-127

```ts
...indentLines([`body: ${yamlScalar(comment.body)}`], 2)
// parser: if (countIndent(child) === 0) break;
```

**Expected:** Round-trip valid multiline comment bodies and their metadata without loss.

**Observed:** A two-line body becomes only first line; following createdAt and url also parse as empty. Resolve later serializes the parsed scaffold.

**Reproduction:** ISSUES-01 uses production pure serializer/parser and synthetic comment; no real GitHub/scaffold mutation.

**Evidence:** evidence/completion-final-root/search-issues-repro.log

**Impact:** Local scaffold data loss on parse/rewrite; remote issue content was not changed.

**Root cause:** Scalar serializer embeds a raw newline without block indentation; parser stops child block at the unindented line.

**Recommendation:** Use a proper YAML scalar/block serializer and parser, or an explicitly reversible encoding.

**Regression:** Round-trip multiline, blank, colon/hash, quote and fence-like comment bodies plus metadata through ingest and resolve.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** New data-loss path; distinct from G117 redaction misses.

### ROAD-01 — Archived done proposal is reported as legacy instead of delivered

**Severity:** P2. **State:** confirmed. **Component:** roadmap/workspace. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/roadmap/src/lib/workspace/roadmap-workspace.service.ts:38-54,104-107; plugins/roadmap/src/lib/gates/gate-evaluator.service.ts:32-42

```ts
return found?.split(/[\/]/u)[0];
```

**Expected:** Canonical status remains done for a proposal archived under legacy/closed.

**Observed:** The real workspace helper returns done for docs/proposals/done/x...md but legacy for legacy/closed/fixes/x...md with status:done. The gate evaluator treats legacy as failing.

**Reproduction:** Owned temporary docs fixture and real openRoadmapWorkspace; gate consequence is traced statically, not a real promotion.

**Evidence:** evidence/completion-final-gap/roadmap-probe-final.log

**Impact:** Incorrect readiness failure for work already completed and archived.

**Root cause:** Infers status from the first directory component rather than canonical proposal metadata.

**Recommendation:** Resolve proposal status through its authoritative metadata, preserving archive semantics without importing plugin filesystem internals.

**Regression:** Gate against an archived done proposal must agree with the same proposal before archive; unknown/corrupt state stays explicit.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** New specific roadmap mismatch, related to proposal lifecycle consistency.

### ROAD-02 — Closing a duplicate entry ID changes unrelated horizons

**Severity:** P2. **State:** confirmed. **Component:** roadmap/plan-close. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/roadmap/src/lib/contracts/schemas/roadmap.schema.ts:27-53; plugins/roadmap/src/lib/tools/plan-close.tool.ts:96,126-147

```ts
const detail = entryDetail(loaded.roadmap, entryId);
// after checking detail.entry.state:
horizon.entries.map(each => each.id === entryId ? closed(each, to, reason, supersededBy) : each)
```

**Expected:** Identify exactly one entry and validate that entry transition before updating it.

**Observed:** Schema accepts duplicate IDs. Closing the in-progress first same entry marks both it and a proposed same entry in another horizon delivered; the second transition was not validated.

**Reproduction:** Captured real handler with in-memory workspace ports; explicit reason bypasses unknown gates by design but should not bypass another entry transition. No real roadmap or release changed.

**Evidence:** evidence/completion-final-gap/roadmap-probe-final.log

**Impact:** Unintended roadmap state mutation and invalid second transition.

**Root cause:** Lookup selects one match; update maps every matching ID, with no global uniqueness check.

**Recommendation:** Enforce unique entry IDs on read/write, or address by horizon and ID and validate all selected mutations.

**Regression:** Reject duplicate IDs before any timeline/state write; ensure closing one horizon never changes another.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** New roadmap state-machine defect; prerelease policy candidate deliberately not counted.

### SURF-01 — Three plugin byte budgets diverge from real MCP definitions

**Severity:** P2. **State:** confirmed. **Component:** rules/search/issues manifests. **Snapshot:** `bec5d5daf945df78464e4535c47628809ef8ca64`.

**Locations:** plugins/rules/plugin.manifest.ts:13; plugins/search/plugin.manifest.ts:30-41; plugins/issues/plugin.manifest.ts:40-49; packages/core/src/lib/contracts/constants/token-budgets.constant.ts:208-212

```ts
// search manifest
staticBytes: 2_700,
caps: { hard: TOKEN_BUDGETS.toolPayloads.search.hard }
// issues: staticBytes: 4_900; caps.hard: 5_900
```

**Expected:** Declared definition-byte estimates/caps reflect the actual registered tool surface under an explicit measurement contract.

**Observed:** MCP SDK in-memory listings: rules6166B/3tools vs legacyhard3000; search4163B/3 vs hard3000; configured issues15101B/10 vs static4900/hard5900. All register output schemas.

**Reproduction:** Real plugin registration in owned temporary workspaces then listTools only; fixture namespace, no listed tool invoked. Initial harness shape mistake retained separately.

**Evidence:** evidence/completion-final-root/plugin-surfaces.log

**Impact:** Misleading discovery/context cost metadata; no billed-token or end-to-end savings measurement asserted.

**Root cause:** Historical/placeholder caps were not reconciled with present registrations and schema weight.

**Recommendation:** Measure the supported surface modes automatically; reduce redundant schema payload or update justified budgets without weakening a required gate.

**Regression:** Assert byte counts with fixed namespace/mode and explicit configured/unconfigured issue surfaces; separately benchmark task quality.

**Confidence:** high at the documented fixture/source boundary; no live host effect claimed.

**Relation:** Extends the same metadata-drift family as CP-08; consolidate proposals rather than count each plugin as an independent architecture cause.
