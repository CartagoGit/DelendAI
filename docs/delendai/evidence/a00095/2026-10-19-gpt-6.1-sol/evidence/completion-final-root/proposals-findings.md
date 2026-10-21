# Proposals: additional bounded findings

Reviewer gpt-6.1-sol (Codex), 2026-10-21. Sources `bec5d5daf945df78464e4535c47628809ef8ca64`, unchanged under proposals/src at `031f6396a78bfcceadf87598a462c9a8164a86dd`. Fixtures use private temporary files and injected ports. No productive proposal close, provider spend or destructive GC was executed. The P1 evidence finding has an executable helper control plus static handler composition, not a completed terminal transition.

## PROP-DOM01 — Plan blocker lookup uses the cache directory as the document root

**Severity:** P2

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/proposals/blocked-by.ts:102", "plugins/proposals/src/lib/proposals/proposal-paths.ts:33", "plugins/proposals/src/lib/tools/continue-proposal.tool.ts:686"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A plan with unfinished children retains those blockers under the current split content/cache layout.

**Observed:** The same injected reader returns [] for a cache index and [x12345] for the old co-located index. The production caller treats an empty result with completed own slices as closure-ready.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "blocked-by-root", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Production helper plus injected readers; caller consequence verified statically, not a whole MCP session."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** Routing/continuation can suggest closing a plan that still waits on children. Actual terminal transition remains separately guarded; no state transition was executed.

**Root cause:** blockedByFor calls proposalDocPath without proposalsDirAbs; missing content at the resulting cache path is collapsed to no blockers.

**Recommendation:** Thread the configured proposals root through this helper and all callers; distinguish unreadable/missing from an evaluated empty child set.

**Regression:** Real separated content/cache fixture with an open child must report it and never mark the plan closure-ready.

**Confidence:** high within the stated source/fixture boundary

**Relation:** New path-resolution defect; independent of PROP-PLAN02, which loses fields even after finding the right document.

Source excerpt `plugins/proposals/src/lib/proposals/blocked-by.ts:102`:

```ts
	};
	const docPath = proposalDocPath(indexPathAbs, entry.file);
	const markdown = await resolvedReaders.readTextOrNull(docPath);
	if (markdown === null) return [];
	const block = extractYamlBlock(markdown);
	if (block === null) return [];
	const fm = parseFrontmatterBlock(block);
	if (fm.type !== 'plan') return [];

	const entries = await resolvedReaders.readProposalIndex(indexPathAbs);
```

## PROP-PLAN02 — Proposal parser drops plan children and closure policy before the closure guard

**Severity:** P2

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/proposals/proposal-document.ts:116", "plugins/proposals/src/lib/proposals/proposal-document.ts:378", "plugins/proposals/src/lib/swarm/plan-closure-guard.ts:71", "plugins/proposals/src/lib/swarm/plan-closure.engine.ts:147"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Parsing preserves validated contains/closureGate fields so the closure guard examines declared children under the declared policy.

**Observed:** Temporary plan declares x12345; local index says child in-progress. parseProposalDocument omits both fields and runPlanClosureGuard returns closable:true. Same engine and disk resolver with complete YAML frontmatter returns closable:false/not-done.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "parser-guard-chain", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Real parser, guard and disk resolver in scratch; source mode pinned to local JSON for this process only, zero Git commands, providers and transitions."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** A productive closure preflight can accept a plan without examining its declared unfinished children. Sub-plan recursion also parses through the same function. No actual transition or closure was performed.

**Root cause:** Interface contains optional plan fields, but the parser constructs a fresh frontmatter object without copying or validating those fields. Guard forwards it directly.

**Recommendation:** Validate/normalize and preserve contains and closureGate in the canonical parser; cover the complete parser-to-guard composition rather than only handcrafted engine inputs.

**Regression:** Parse a real plan file containing open children and custom closure flags, run the production guard, assert child blockers and policy semantics; include nested sub-plans.

**Confidence:** high within the stated source/fixture boundary

**Relation:** New parser/composition defect; distinct from PROP-DOM01 wrong lookup path. Parent independently traced guard and engine callers; own probe confirms the chain.

Source excerpt `plugins/proposals/src/lib/proposals/proposal-document.ts:116`:

```ts
	 */
	readonly contains?: IPlanContains;
	readonly closureGate?: IPlanClosureGate;
}

export interface IProposalBody {
	/** First paragraph / goal statement extracted from the title heading. */
	readonly goal: string;
	/** Prose under the ## Motivation / ## Description heading. */
	readonly motivation: string;
```

## PROP-GC01 — An unreadable worktree status becomes a clean GC candidate

**Severity:** P2

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/shared/branch-status-engine.ts:373", "plugins/proposals/src/lib/shared/branch-gc-engine.ts:302", "plugins/proposals/src/lib/shared/branch-gc-engine.ts:447", "plugins/proposals/src/lib/tools/branch-gc.tool.ts:129"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A failed cleanliness probe prevents destructive GC unless its uncertainty is explicitly handled.

**Observed:** Injected git status fails; actual status engine emits dirtyFiles:0/untrackedFiles:0. Actual planGc with positive delivered verdict labels the worktree merged-and-clean even with force:false.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "gc-unreadable-status", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Injected Git runner and pure planner with supplied positive delivery verdict; actual lifecycle service and destructive execution intentionally not run."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** A worktree with unknown local contents can reach the force-removal path, which may discard untracked/dirty data. No real data loss was caused or observed.

**Root cause:** Status failure is represented by zero counts; the planner has no cleanliness-known state. Execution uses git worktree remove --force even when the request force flag is false.

**Recommendation:** Represent unreadable status explicitly and skip GC; revalidate freshness/cleanliness immediately before removal and use non-force removal unless the user explicitly selected force.

**Regression:** Simulate EACCES, timeout and transient status failures for a delivered/merged branch; assert a structured skip and no removal command.

**Confidence:** high within the stated source/fixture boundary

**Relation:** New cleanliness failure path; does not duplicate existing unmerged/ahead safeguards. branchDeliveryVerdict only judges ref lifecycle, not worktree cleanliness.

Source excerpt `plugins/proposals/src/lib/shared/branch-status-engine.ts:373`:

```ts
		if (path.length === 0) continue;
		const statusResult = await run(['-C', path, 'status', '--porcelain']);
		const counts = statusResult.ok
			? parseStatusPorcelain(statusResult.output)
			: { dirty: 0, untracked: 0 };
		const ageMin = await commitMinutesAgo(
			run,
			branch.length > 0 ? branch : 'HEAD',
			now,
		);
```

## PROP-LOG01 — Bypass log fallback emits the unredacted reason

**Severity:** P2

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:104", "plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:127", "plugins/proposals/src/lib/shared/plan-closure-bypass-log.ts:85", "plugins/proposals/src/lib/shared/plan-closure-bypass-log.ts:108", "plugins/proposals/src/lib/tools/proposal-transition.tool.ts:1064", "plugins/proposals/src/lib/tools/proposal-transition.tool.ts:1307"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Both structured and default warning sinks apply the documented reason redaction.

**Observed:** Core redactor recognizes the synthetic marker. Captured default console.warn output from both real helpers contains it (2 of 2 rows). Production transition callers omit the optional sink.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "bypass-redaction", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Console warning intercepted in memory; logs contain counts/booleans only and no complete marker. No transition executed."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** A sensitive value accidentally pasted into a reason can enter stderr/host diagnostics despite the redaction promise. This probe used no real credential and demonstrated no external disclosure.

**Root cause:** Helpers compute redactedReason for logPayload but interpolate event.reason in console.warn. Their event buffers retain the raw reason as well.

**Recommendation:** Use the redacted value consistently for warning output and any re-exposed buffer; preserve explicit evidence only under an appropriate documented policy.

**Regression:** Capture both sinks with a recognized synthetic marker and assert absence of raw marker; exercise actual transition caller composition.

**Confidence:** high within the stated source/fixture boundary

**Relation:** Related to the existing family of inconsistent redaction, but this is a newly identified proposals bypass-log path; independent of external raw-answer cache.

Source excerpt `plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:104`:

```ts
	// cannot exfiltrate secrets pasted into the UI.
	const redactedReason = redactSecrets(event.reason).text;
	const logPayload = {
		severity: 'warning' as const,
		incidentType: 'peer-review-bypass' as const,
		message: `[delendai] peer-review-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(redactedReason)}`,
		context: {
			proposalId: event.proposalId,
			via: event.via,
			agent: event.agent,
```

## PROP-JOURNAL01 — Quarantine append loses the first good entry after a torn tail

**Severity:** P2

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/proposals/quarantine.ts:141", "plugins/proposals/src/lib/proposals/quarantine.ts:169", "plugins/proposals/src/lib/proposals/quarantine.ts:182", "plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:171"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** After a partial final JSONL row, later successful appends remain readable and the damaged row is reported or preserved separately.

**Observed:** Fixture starts with an unfinished JSON object. appendQuarantine returns id 1, but listQuarantine immediately reads no entries because the new JSON was appended to that same damaged line.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "quarantine-torn-tail", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Real append/read functions write only a new temporary directory, no repository journal or source touched."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** The quarantine writer reports successful recording while its reader loses the new diagnosis; this weakens recovery after exactly the crash scenario the reader documents as supported.

**Root cause:** Reader tolerates damaged lines, but append does not ensure a newline boundary before the next record. validate-journal already handles the corresponding boundary explicitly.

**Recommendation:** Under the same lock, preserve/diagnose the damaged tail and establish a newline boundary before appending; keep valid records and fsync semantics.

**Regression:** Seed valid rows plus an incomplete tail, append another entry, assert every valid existing/new row is readable and the corrupt tail remains inspectable.

**Confidence:** high within the stated source/fixture boundary

**Relation:** New append/read composition failure. Distinct from malformed-line tolerant reading itself; no generic corruption inventory claim.

Source excerpt `plugins/proposals/src/lib/proposals/quarantine.ts:141`:

```ts
 */
const parseQuarantineLine = (line: string): IQuarantineEntry | null => {
	try {
		return normalizeEntry(JSON.parse(line));
	} catch {
		return null;
	}
};

export const listQuarantine = async (
```

## PROP-GC02 — The GC age limit is skipped for delivered merged worktrees

**Severity:** P3

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/shared/branch-gc-engine.ts:243", "plugins/proposals/src/lib/shared/branch-gc-engine.ts:265", "plugins/proposals/src/lib/tools/branch-gc.tool.ts:93"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** The advertised staleMinutes floor applies to merged delivered worktrees as well as unmerged ones.

**Observed:** Pure planner puts a zero-minute merged/delivered/clean fixture in removed with staleMinutes 60.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "gc-fresh", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Pure planner only; no worktree activity or live deletion observed."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** A just-used worktree can be proposed for cleanup despite the configured idle floor. This is an API contract issue; no deletion was executed.

**Root cause:** The age comparison is nested inside the unmerged branch; the merged branch never checks age.

**Recommendation:** Check age before admitting any eligible removal, or change the public setting/description to state a deliberate different policy.

**Regression:** Test fresh merged delivered, fresh unmerged, stale merged and unknown-age fixtures; existing fresh test only uses unmerged (spec243–264).

**Confidence:** high within the stated source/fixture boundary

**Relation:** Separate from PROP-GC01 uncertainty; lower severity because the fixture is positively delivered and clean.

Source excerpt `plugins/proposals/src/lib/shared/branch-gc-engine.ts:243`:

```ts
		}
		const ageMin = elapsedMinutes(
			wt.ageLabel,
			branch.lastCommitMinutesAgo,
			0,
		);
		// Branch not merged into base ⇒ NEVER GC-eligible. Two distinct
		// skip reasons, but the rule is unconditional:
		//   (a) fresh  — the worktree is younger than staleMinutes (sacred).
		//   (b) unmerged — the branch is not reachable from base (sacred,
```

## PROP-LINT01 — Folder lint chooses the first status-named ancestor rather than the nearest

**Severity:** P3

**State:** confirmed by own local probe at fixed snapshot

**Component:** proposals/domain-shared

**Locations:** ["plugins/proposals/src/lib/proposals/filename-linter.ts:144", "plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:975"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A correctly placed proposal remains valid when an earlier absolute parent directory is named ready/done/etc.

**Observed:** Correct in-progress fixture under /fixture/ready/project/.../in-progress is rejected with nearest status ancestor ready.

**Reproduction:** {"script": "probe.ts", "result": "probe-result.jsonl", "case": "filename-ancestor", "command": "bun --tsconfig-override proposals-domain/tsconfig.probe.json proposals-domain/probe.ts", "limits": "Pure production linter fixture; downstream blocking consequence is statically traced."}

**Evidence:** evidence/completion-proposals-domain/findings.json.txt

**Impact:** External workspaces under a status-named parent can get a false folder error; self-lint blocker reconciliation passes absolute paths and can remain blocked unnecessarily.

**Root cause:** Array.find walks ancestors from root to leaf while the documented nearest-ancestor algorithm requires the opposite order.

**Recommendation:** Resolve against the proposals root or search status ancestors from the leaf upward; keep explicit containment.

**Regression:** Absolute/relative fixtures with status-named outer parents and nested unrelated directories preserve the effective proposal status.

**Confidence:** high within the stated source/fixture boundary

**Relation:** New lint/path issue; no evidence of a moved/deleted proposal from this check.

Source excerpt `plugins/proposals/src/lib/proposals/filename-linter.ts:144`:

```ts

	const pathParts = path.split('/');
	const ancestorFolders = pathParts.slice(0, -1);
	const nearestStatusAncestor = ancestorFolders.find((seg) =>
		statusFolderNames.has(seg),
	);
	const matches = nearestStatusAncestor === expectedFolder;
	if (matches) return [];

	const immediateParent = pathParts[pathParts.length - 2];
```

## G61-PROP-SVC01 — Quarantine repair resolves proposal-relative source paths against the workspace root

**Severity:** P2

**State:** confirmed

**Component:** plugins/proposals services and named callers

**Locations:** ["plugins/proposals/src/lib/tools/db-reconcile.tool.ts:280-301,347-425,537-582,639-649", "packages/proposals-sqlite/src/lib/set-aside.service.ts:44-60", "packages/proposals-sqlite/src/lib/reconciler-staging.ts:454-474", "packages/proposals-sqlite/src/lib/repository/quarantine-repo.ts:78-99", "plugins/proposals/src/lib/tools/quarantine-repair.tool.ts:34-42,82-96"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Re-parse the same proposal file the reconciler excluded, under the configured proposals directory.

**Observed:** Collector produces e.g. in-progress/x00001.md relative to proposalsDirAbs. No reconciler, QuarantineRepo, set-aside writer or promotion copy prepends proposals directory. Repair resolves row.source_path against workspaceRoot, so it searches /ws/in-progress/x00001.md instead of /ws/docs/delendai/proposals/in-progress/x00001.md. Ordinary main reconcile reaches this via preflight exclusions with frontmatter, written after successful promotion by recordSetAsideFiles; not only direct staging callers.

**Reproduction:** Static complete caller trace in caller-evidence.log. Minimal layout: workspace /ws, proposalsDir /ws/docs/delendai/proposals, rejected frontmatter file in-progress/x00001.md; later repair re-parse resolves the wrong absolute path. No application database was opened.

**Evidence:** ["caller-evidence.log fixed Git source excerpts", "Full service reads in coverage.json"]

**Impact:** Valid repaired markdown cannot be re-parsed through the repair action for default nested proposals layouts, or an unrelated same-relative-path workspace file can be read if present. No observed production row count or executed DB repair is claimed.

**Root cause:** Producer and consumer disagree about the base directory of the same persisted source_path string.

**Recommendation:** Choose and document one path-base contract; either persist workspace-relative paths everywhere or pass/configure proposalsDirAbs at repair and migrate or discriminate legacy rows. Preserve logical digest consistency.

**Regression:** Create a synthetic nested proposals fixture, reconcile a rejected frontmatter file, fix it, re-parse its actual stored row and verify only that file is read; cover working-tree/ref sources and legacy workspace-relative rows.

**Confidence:** High static confidence: every persistence edge traced; end-to-end DB reproduction intentionally not performed.

**Relation:** Corroborates root/coordinator current quarantine candidate. This recommended local ID must be aliased to their canonical ID, not counted twice.

Source excerpt `plugins/proposals/src/lib/tools/db-reconcile.tool.ts:280-301,347-425,537-582,639-649`:

```ts
 */
export const collectProposalMarkdown = (
	dir: string,
): readonly IReconcilerInputFile[] => {
	if (!existsSync(dir)) return [];
	const files: IReconcilerInputFile[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
```

## G61-PROP-SVC02 — Fresh reconciliation does not clear stale-reconciliation warnings from historical successful runs

**Severity:** P3

**State:** probable

**Component:** plugins/proposals services and named callers

**Locations:** ["plugins/proposals/src/lib/services/db-doctor/checks/stale-reconciliation.ts:7-23", "plugins/proposals/src/lib/services/db-doctor.ts:41-48,92-114", "plugins/proposals/src/lib/tools/db-doctor.tool.ts:53-68,85-105"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Current reconciliation freshness should reflect the latest completed successful authority; a new successful run should clear a warning caused only by an older completed success.

**Observed:** The SQL counts every successful run older than one day, without selecting the newest. A synthetic history containing one old completed success plus one current completed success still yields staleCount1. Default doctor includes this check and healthy requires every check severityok.

**Reproduction:** DELENDAI_AGENT_ID=gpt-6.1-sol python3 /tmp/delendai-audit-finish-20261020/proposals-services/stale-query.py

**Evidence:** ["stale-query-output.log: exact production predicate executed against two synthetic rows in Python stdlib SQLite memory", "caller-evidence.log default check wiring"]

**Impact:** Permanent warning/unhealthy diagnostic as ordinary history accumulates; fresh reconciliation does not remedy it. This is diagnostic accuracy, not corruption or evidence that mutations are blocked.

**Root cause:** Historical run age is treated as present projection staleness; no latest-run restriction.

**Recommendation:** Determine freshness from the newest relevant completed run; separately report stuck/incomplete runs if needed without labeling old completed history as current staleness.

**Regression:** Old successful run followed by current successful run yields no stale-current warning; latest old run warns; incomplete-run history is classified explicitly.

**Confidence:** High for the SQL behavior and default health wiring; medium for defect classification because the check text explicitly describes historical stale runs and the desired current-health policy needs a product decision.

**Relation:** New candidate against available own recovered findings/prior indices; root should deduplicate against other agents before canonical numbering.

Source excerpt `plugins/proposals/src/lib/services/db-doctor/checks/stale-reconciliation.ts:7-23`:

```ts

export const checkStaleReconciliation = ({
	db,
	now,
}: IDoctorCheckContext): IDoctorCheck => {
	const count =
		db
			.query<
				{ count: number },
				[number]
```

## G61-PROP-SVC03 — Mixed own and adopted commits are recorded as wholly carried from another maker

**Severity:** P2

**State:** confirmed

**Component:** plugins/proposals services and named callers

**Locations:** ["plugins/proposals/src/lib/services/carried-work.service.ts:59-79", "packages/core/src/lib/work-units/commit-maker-notes.service.ts:117-143", "plugins/proposals/src/lib/tools/authoring.tool.ts:2148-2167,2721-2755,2851-2860", "plugins/proposals/src/lib/services/review-identity.ts:208-220,241-267"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** carriedFrom should return another maker only when every commit was made by that maker; mixed submitter/other work should retain mixed attribution or remain undefined.

**Observed:** When notes cover all commits, the helper removes submitter from the maker set before checking its size. Notes [submitter,other] therefore return other. Submit caller overwrites the round implementer with other and writes that every commit came from others unit. The local submit identity journal still records submitter and can refuse its self-approval; with no journal, recorded-implementer fallback compares only other. Queue delivery candidates may add further defenses, so no universal self-approval bypass is asserted.

**Reproduction:** Run probe.ts with the frozen tsconfig override as recorded in commands.md. Production carriedFrom and makersOf use an entirely fake Git runner; approval helper uses a fake journal. No real Git command, remote or repository state mutation.

**Evidence:** ["probe-output.log mixed-makers returnsother for notes [submitter,other]", "probe-output.log independence-boundary: journal present refuses submitter; absent allows at this helper only", "caller-evidence.log authoring writes wrong implementer plus journal retains actual submitter"]

**Impact:** Incorrect implementer attribution and misleading durable review history. Independence can depend on local journal availability at one helper; full assembled approval/queue bypass remains unproven.

**Root cause:** Set cardinality is checked after dropping evidence of the submitters own authorship, converting mixed authorship into one foreign maker.

**Recommendation:** Require every recorded maker to be the same non-submitter before returning a carried maker, or represent mixed implementers explicitly. Do not discard own-maker evidence.

**Regression:** Cases allother, allsubmitter, mixedsubmitter+other and twoothers; mixed must not claim whollycarried. Verify journal-present/absent review paths preserve all implementers.

**Confidence:** High for helper and caller attribution defect reproduced with fake Git; medium for broader independence effects, explicitly bounded.

**Relation:** New candidate in recovered own indices; root to deduplicate. Not a claim of remote identity theft or a universal approval bypass.

Source excerpt `plugins/proposals/src/lib/services/carried-work.service.ts:59-79`:

```ts
	if (commits.length === 0) return undefined;
	// What was recorded when the work was made answers first. The unit, not
	// the model's name, tells instances of one model apart; a model's work
	// carried by another instance of it is still that model's, so only
	// another agent counts as a maker here.
	const remote =
		(
			await run(['config', '--get', `branch.${integration}.remote`])
		).output.trim() || 'origin';
	await fetchMakerNotes(run, remote);
```

## PROP-DETAIL01 — proposal_get changes the detail label without changing the detail payload

**Severity:** P2

**State:** confirmed-static; root deduplication and ID pending

**Component:** plugins/proposals

**Locations:** ["plugins/proposals/src/index.ts:872", "plugins/proposals/src/lib/tools/proposal-get.tool.ts:289", "plugins/proposals/src/lib/tools/proposal-get.tool.ts:146", "plugins/proposals/src/lib/contracts/proposal-view.contract.ts:66"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Compact requests use the compact projection and full requests expose the full document promised by the plugin contract.

**Observed:** All three detail levels call buildDetailProposal and differ only in level; full omits the document body and compact includes normal detail.

**Reproduction:** Static path: plugin registration -> registered proposal_get handler -> buildSurfaceResponse -> detail branch. No behavioral fixture was executed.

**Evidence:** return { view: detail, level: args.detail ?? normal, proposal: buildDetailProposal(loaded) }; at proposal-get.tool.ts:291–296; full projector is identity at proposal-view.contract.ts:159–161.

**Impact:** The caller cannot obtain the full proposal through the advertised full detail level; a compact choice does not reduce that detail payload.

**Root cause:** The consolidated read handler does not dispatch to the already defined detail projectors.

**Recommendation:** Implement the three levels with a compatible explicit output contract, or remove/clarify unsupported levels.

**Regression:** Through the registered handler, load a fixture containing unique text in the proposal body and acceptance/slices; assert compact omits detailed fields and full preserves the complete document.

**Confidence:** High for cited static composition; runtime impact bounded by the stated fixture, not a productive terminal transition.

**Relation:** New bounded composition finding; related existing validation, identity and surface findings remain distinct unless consensus consolidates the root cause.

Source excerpt `plugins/proposals/src/index.ts:872`:

```ts
					// `proposal_get` — compact | normal | full.
					buildProposalGetRegistration({
						namespacePrefix: ctx.namespacePrefix,
						proposalsDirAbs: abs(layout.proposalsDir),
						indexPathAbs: abs(layout.proposalIndexFile),
					}),
					buildRoundContextRegistration({
						namespacePrefix: ctx.namespacePrefix,
						workspaceRoot: ctx.workspace.root,
						digestPathAbs: abs(layout.roundContextDigestFile),
```

## PROP-CONFIG01 — The plugin does not forward requireValidateEvidence to its transition handler

**Severity:** P2

**State:** confirmed-static composition discrepancy; product-intent review pending

**Component:** plugins/proposals

**Locations:** ["plugins/proposals/src/index.ts:254", "plugins/proposals/src/index.ts:995", "plugins/proposals/src/lib/tools/proposal-transition.tool.ts:253", "plugins/proposals/src/lib/tools/proposal-transition.tool.ts:1142"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A configured false setting reaches the handler that documents false as a supported adopter choice, or the public option explicitly excludes terminal transitions.

**Observed:** The transition registration omits requireValidateEvidence; the handler therefore always sees undefined and keeps the gate enabled. Authoring and auto_work receive the public value.

**Reproduction:** Static path: PROPOSALS_OPTIONS_SCHEMA -> index register -> buildProposalTransitionRegistration without field -> runProposalTransition checks options.requireValidateEvidence !== false. No runtime environment was executed.

**Evidence:** index.ts:995–1018 omits the property; authoring options forward it at :657–662 and auto_work at :938–944. Handler applies the gate at proposal-transition.tool.ts:1142–1182.

**Impact:** An adopter disabling local validate evidence still receives the validate-required refusal from terminal transitions; the visible setting has inconsistent effects across lifecycle operations.

**Root cause:** Composition omits a documented handler option. The entrypoint comment also says terminal transitions retain a global gate, so maintainers must resolve the public semantics before changing enforcement.

**Recommendation:** Make the intended policy explicit and consistent: forward the setting if supported, or document and validate that terminal transitions deliberately retain this requirement.

**Regression:** Construct the real plugin with requireValidateEvidence false and capture/invoke the registered transition handler against an otherwise closable fixture with no local validate journal; assert the documented policy.

**Confidence:** High for cited static composition; runtime impact bounded by the stated fixture, not a productive terminal transition.

**Relation:** New bounded composition finding; related existing validation, identity and surface findings remain distinct unless consensus consolidates the root cause.

Source excerpt `plugins/proposals/src/index.ts:254`:

```ts
	/**
	 * Require a passing validation run before lifecycle operations. The
	 * selected scope applies to `close_slice`; terminal proposal transitions
	 * always retain the global integration gate. Default true when omitted.
	 */
	requireValidateEvidence: z.boolean().optional(),
	/**
	 * a00069 S10: auto-purge orphan registry/queue/lock drift on plugin boot.
	 * Default true. Set false to keep diagnose-only (manual state_repair).
	 */
```

## PROP-GATE01 — An expired live gate occupies admission until its own tree is resumed

**Severity:** P2

**State:** confirmed in isolated fixture; no host occurrence claimed

**Component:** plugins/proposals

**Locations:** ["plugins/proposals/src/lib/tools/close-slice-gate.ts:179", "plugins/proposals/src/lib/tools/close-slice-gate.ts:267", "plugins/proposals/src/lib/tools/close-slice-gate-store.ts:104", "plugins/proposals/src/index.ts:699", "plugins/proposals/src/lib/tools/authoring.tool.ts:1701"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A gate exceeding closeGateTimeoutMs stops holding the local admission slot even if its original caller does not resume that same tree.

**Observed:** Timeout enforcement lives only in evaluateRun for the currently requested handle. Admission lists other live PIDs without checking job deadline, so an abandoned live process can indefinitely block new tree handles at the default concurrency of one.

**Reproduction:** gate-probe/probe.ts imports exact fixed-SHA source with scratch IO and injected process/time ports. Start tree A at t=0 with timeout 100; at t=100000 request tree B: pending, starts=1, kills=0. Resume A: unverifiable, kills=1. Request B: starts=2. No real subprocess or provider ran.

**Evidence:** gate-probe/result.json, source-manifest.json and caller-search.txt. Production route: index.ts:699–744 supplies runCloseSliceGateProbe; authoring.tool.ts:1701–1713 calls it; :458–483 invokes runCloseSliceGate. The only production caller of liveGateHandles is admitAndStart (:270); runner script has no independent timer.

**Impact:** A timed-out, still-live local validation process whose caller moved away can prevent every other tree from starting its local gate. Existing CI certification can still permit closes, and manual process cleanup or resuming the old tree releases the slot.

**Root cause:** Gate expiry is evaluated during attachment to that gate, not when accounting for machine-wide admission, and the detached runner has no deadline supervisor.

**Recommendation:** Enforce deadlines in a dedicated supervisor or reconcile expired jobs during admission under the admission mutex, recording an unverifiable verdict and terminating only the verified owned process group.

**Regression:** Two different tree fingerprints sharing storeRoot: start A, advance injected time past A timeout, request B without reattaching A. Assert A ceases holding admission and B starts; retain controls for live unexpired A, completed A and dead PID.

**Confidence:** High for cited static composition; runtime impact bounded by the stated fixture, not a productive terminal transition.

**Relation:** New bounded composition finding; related existing validation, identity and surface findings remain distinct unless consensus consolidates the root cause.

Source excerpt `plugins/proposals/src/lib/tools/close-slice-gate.ts:179`:

```ts
	}
	if (resolved.now() - job.startedAtMs > job.timeoutMs) {
		resolved.processPort.killGroup(job.pid);
		return settleBad(
			dir,
			job,
			'unverifiable',
			`the gate run was stopped after ${job.timeoutMs} ms (closeGateTimeoutMs); it proves nothing, raise the timeout or run close_slice again`,
		);
	}
```

## PROP-EVIDENCE01 — close_slice turns failed validation evidence into accepted explicit evidence

**Severity:** P1

**State:** confirmed static caller trace; exact helper probe passed; public close not executed

**Component:** plugins/proposals

**Locations:** ["packages/core/src/lib/proposals/validate-evidence.schema.ts:3", "plugins/proposals/src/lib/tools/authoring.tool.ts:1502", "plugins/proposals/src/lib/tools/authoring.tool.ts:1575", "plugins/proposals/src/lib/tools/authoring.tool.ts:1721", "plugins/proposals/src/lib/services/transition-evidence.ts:34"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Caller-supplied nonzero exitCode must remain a failed validation and must not satisfy the explicit passing-evidence condition for closing a slice.

**Observed:** The public close_slice handler accepts integer exitCode, replaces every provided exitCode with literal 0, and fills missing logPath with an empty string. Its hard-validation acceptance checks only timestamp freshness. Accepted explicit evidence covers missing, pending or unverifiable quality verdicts; an actually red quality verdict still blocks.

**Reproduction:** Static public chain: authoring registration :1471–1485 uses VALIDATE_EVIDENCE_SCHEMA; :1502–1510 rewrites exitCode; :1575–1578 checks isFreshValidateEvidence, delegated at :601–602 to isEvidenceFresh. Exact source helper probe with fresh timestamp, exitCode 42 and nonexistent log: isEvidenceFresh=true, checkTransitionEvidence={ok:false,invalid-evidence}. No public handler or close mutation executed.

**Evidence:** contract-probes/probe.ts, result.json and source-manifest.json. Shared strict checker rejects nonzero at transition-evidence.ts:85–90 and missing log at :105–132, but close_slice does not call it. authoring.tool.ts:1721–1746 limits the quality exception to missing verdicts.

**Impact:** Failed caller evidence can be treated as passing evidence for the slice validation condition and bypass a pending/unverifiable gate verdict. Existing peer-review, persistence and other close conditions still apply; this is not a claim that every close succeeds.

**Root cause:** A type-shape conversion changes evidence facts before validation, while the receiving gate uses a freshness predicate as if it proved a successful validate run.

**Recommendation:** Preserve supplied exitCode, validate the evidence semantics before accepting it, and explicitly define the log/tree provenance contract shared by transition and close_slice.

**Regression:** Exercise the registered close_slice handler on a scratch proposal with a type/e2e gate and otherwise satisfied conditions: fresh exitCode 42 and nonexistent log must be refused; fresh successful evidence follows the intended verified-log policy. Keep pending/unverifiable and actual-red quality controls distinct.

**Confidence:** High for cited static composition; runtime impact bounded by the stated fixture, not a productive terminal transition.

**Relation:** New bounded composition finding; related existing validation, identity and surface findings remain distinct unless consensus consolidates the root cause.

Source excerpt `packages/core/src/lib/proposals/validate-evidence.schema.ts:3`:

```ts

export const VALIDATE_EVIDENCE_SCHEMA = z.object({
	timestamp: z.string().min(1),
	exitCode: z.number().int(),
	logPath: z.string().min(1).optional(),
});

export type IValidateEvidenceInput = z.infer<typeof VALIDATE_EVIDENCE_SCHEMA>;
```

## PROP-REVIEW01 — Review auto-close drops the configured instance-independence policy

**Severity:** P2

**State:** confirmed static composition trace; exact approval helper probe passed; public close not executed

**Component:** plugins/proposals

**Locations:** ["plugins/proposals/src/lib/tools/authoring.tool.ts:2543", "plugins/proposals/src/lib/tools/authoring.tool.ts:2932", "plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts:51", "plugins/proposals/src/lib/tools/proposal-transition.tool.ts:1243", "plugins/proposals/src/lib/shared/independent-approval.ts:61"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A review accepted under the host instance-independence policy must be judged under that same policy when the last approval requests proposal auto-close.

**Observed:** Approval identity checks receive scoped.reviewIndependence, but the options object passed to moveProposalAfterVerdict omits reviewIndependence. The transition therefore passes undefined to unapprovedSlices, whose default is model. A recorded approval by another instance of the same model is rejected by this later check.

**Reproduction:** Static chain: authoring :2543–2582 uses the configured policy; :2589–2591 and :2675–2678 record the another-instance mark when available; :2932–2974 constructs transition options without reviewIndependence; review-verdict-lifecycle :61–70 forwards those options; transition :1243 invokes unapprovedSlices. Exact helper fixture with a completed slice and recorded another-instance mark yields [] with instance, [S1] with the omitted default, and [] for another-model control.

**Evidence:** contract-probes/probe.ts, result.json, source-manifest.json. independent-approval.ts:43–57 rejects same model under model policy; :61–64 defaults to model and :93–109 interprets the recorded instance mark.

**Impact:** A legitimate configured same-model, different-instance approval can be recorded while auto-close reports peer-review-missing and leaves the proposal open. The approval remains recorded; another model or a correctly configured direct transition can satisfy the narrower independence check, subject to other gates.

**Root cause:** The lifecycle adapter reconstructs transition options manually and fails to propagate the policy already used by its caller.

**Recommendation:** Forward scoped.reviewIndependence through the lifecycle transition options, preferably with a shared typed policy projection, and retain the existing refusal envelope for other genuine blockers.

**Regression:** At registered proposal_review composition, configure independence=instance with two genuinely different fixture instance identities of the same model and otherwise satisfied final-close conditions. Assert approval and auto-close use the same policy; retain model-policy refusal and different-model approval controls.

**Confidence:** High for cited static composition; runtime impact bounded by the stated fixture, not a productive terminal transition.

**Relation:** New bounded composition finding; related existing validation, identity and surface findings remain distinct unless consensus consolidates the root cause.

Source excerpt `plugins/proposals/src/lib/tools/authoring.tool.ts:2543`:

```ts
						}
						if (args.action === 'approve') {
							const sameAgentNameAsImplementer =
								attribution === undefined &&
								isSelfApproval(
									state.implementer ?? undefined,
									args.agent,
									scoped.reviewIndependence,
								);
							const approver = buildReviewIdentity(
```

## PROP-LOOP01 — Returned MCP tool errors are suppressed as successful repeats

**Severity:** P2

**State:** confirmed with pure production helpers and productive hook trace

**Component:** plugins/proposals loop detector

**Locations:** ["plugins/proposals/src/lib/agents/loop-detector-service.ts:253,677-690", "plugins/proposals/src/lib/agents/agent-loop-detector.ts:251-266", "plugins/proposals/src/index.ts:1411", "packages/core/src/lib/project/instrument-tool-handlers.helper.ts:254-255,299,352"]

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Repeated failed tool results remain error outcomes and count toward exact-repeat detection, while successful repeats are suppressed.

**Observed:** isError:true returned normally yields outcome ok and zero repeats; the same failure thrown as Error yields permanent-error and stuck at three repeats.

**Reproduction:** bun --conditions=@delendai/source probe-loop.ts.txt (restore .ts in scratch); real pure helpers, returned-error/thrown-error/success controls, zero host or provider calls.

**Evidence:** ["evidence/completion-final-root/probe-loop.log", "evidence/completion-final-root/probe-loop.stderr.log", "evidence/completion-final-root/proposals-root-observations.md"]

**Impact:** Normal failed operations can loop without the configured exact-repeat handoff. This fixture does not quantify host context consumption or demonstrate a live production loop.

**Root cause:** deriveOutcomeFromResult ignores result and treats absence of a thrown exception as success, although MCP separates returned tool errors from transport exceptions.

**Recommendation:** Classify returned CallToolResult.isError and any defined semantic failure envelope before treating the call as successful; preserve retryability only where actually known.

**Regression:** Run three returned errors through core instrumentation and the registered detector; require detection, retain thrown-error/success controls and ordinary idempotent successful repeats.

**Confidence:** High for pure outcome/detection behavior and static full-host hook wiring; no full MCP scheduling test claimed.

**Relation:** New result-classification cause, distinct from dispatcher timeout and host budget enforcement.

Source excerpt `plugins/proposals/src/lib/agents/loop-detector-service.ts:253,677-690`:

```ts

		const outcome = deriveOutcomeFromResult(_result, _error);

		// x00074 S3: compute progressHash from observable state.
		// The hash is what the detector consults when the gate is
		// enabled — two consecutive PROGRESS_REQUIRED_TOOL calls
		// with the same progressHash are a no-op repeat. We hash
		// the lock file content (cheap, frequently updated) plus
		// the git dirty summary so a fresh commit clears the gate
		// even if the lock file is unchanged.
```

## PROP-ROUND01 — Round-context fallback misses proposals in canonical status folders

**id:** PROP-ROUND01

**title:** Round-context fallback misses proposals in canonical status folders

**severity:** P2

**status:** confirmed by own local collector and tool-output probes

**component:** proposals/round-context

**snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**locations:** ["plugins/proposals/src/lib/swarm/round-context-sources.ts:171", "plugins/proposals/src/lib/swarm/round-context-sources.ts:180", "plugins/proposals/src/lib/swarm/round-context-sources.ts:363", "plugins/proposals/src/lib/tools/round-context.tool.ts:85", "plugins/proposals/src/lib/tools/round-context.tool.ts:126"]

**expected:** Without a JSON index, the fallback accounts for proposals stored in canonical ready/ and in-progress/ folders or reports incomplete coverage.

**actual:** Two real temporary proposal files in ready/ and in-progress/ yield activeCount 0 and no ids. buildRoundContextOutput(forceRefresh:true) persists that same empty portfolio and reports stale:false.

**reproduction:** {"script": "probe.ts", "output": "probe-result.jsonl", "cases": ["missing-index-canonical-folders", "round-tool-fallback"], "limits": "Production collector and tool-output builder over a temporary local workspace, no MCP session/dispatch, no network/provider/Git. Empty coreDocs deliberately isolates portfolio collection."}

**evidence:** coverage.json; probe.ts; probe-result.jsonl

**impact:** Fresh or missing-cache workspaces can receive an empty active-work summary despite existing canonical work. No automatic deletion or dispatch consequence was observed.

**rootCause:** Fallback enumerates only proposals root and extra folders without recursing or including canonical status folders; it reads raw JSON rather than the shared SQL-aware index authority.

**recommendation:** Use a shared authoritative read-only proposal enumeration or include the canonical scan policy and report unreadable/partial scope explicitly.

**regressionTest:** Separate content/cache fixture with ready, in-progress and nested kind proposals, absent and corrupt JSON indexes, and SQL-only projection must preserve the active portfolio.

**confidence:** high for the measured local summary mismatch

**relationship:** New context projection path; different from PROP-DOM01 blocker lookup and PROP-PLAN02 parser field loss.

Source excerpt `plugins/proposals/src/lib/swarm/round-context-sources.ts:171`:

```ts
): Promise<IScannedProposalEntry[]> => {
	const proposalsDir = join(monorepoRoot, layout.proposalsDir);
	const containedExtraFolders = extraFolders.map((folder) => {
		const absolute = resolve(proposalsDir, folder);
		const rel = relative(proposalsDir, absolute);
		if (rel === '..' || rel.startsWith(`..${sep}`)) {
			throw new Error(`proposal folder escapes proposalsDir: ${folder}`);
		}
		return absolute;
	});
```

## PROP-ROUND02 — Round-context in-progress count uses the legacy status spelling only

**id:** PROP-ROUND02

**title:** Round-context in-progress count uses the legacy status spelling only

**severity:** P3

**status:** confirmed by own local production collector probe

**component:** proposals/round-context

**snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**locations:** ["plugins/proposals/src/lib/swarm/round-context-sources.ts:483", "plugins/proposals/src/lib/swarm/round-context-sources.ts:486"]

**expected:** inProgressCount includes the canonical in-progress status.

**actual:** A valid local index with one in-progress entry returns activeCount 2 but inProgressCount 0.

**reproduction:** {"script": "probe.ts", "output": "probe-result.jsonl", "case": "canonical-in-progress-count", "limits": "Temporary JSON index; summary metric only, no automatic scheduler action asserted."}

**evidence:** probe-result.jsonl; coverage.json

**impact:** The round-context portfolio understates active execution and can mislead coordination diagnostics.

**rootCause:** Counter compares only status === in_progress instead of the canonical hyphenated status or common normalizer.

**recommendation:** Normalize status through the canonical glossary and retain intentional legacy aliases explicitly.

**regressionTest:** An index containing canonical and supported legacy in-progress spellings yields the documented count without duplicating entries.

**confidence:** high

**relationship:** Independent counter defect from PROP-ROUND01 missing fallback enumeration; may be fixed together as canonical portfolio projection work.

Source excerpt `plugins/proposals/src/lib/swarm/round-context-sources.ts:483`:

```ts
			activeCount: activeIds.length,
			pendingCount: activePortfolio.filter(
				(entry) => entry.status === 'pending',
			).length,
			inProgressCount: activePortfolio.filter(
				(entry) => entry.status === 'in_progress',
			).length,
		},
		activeLocks,
		activeAgents,
```
