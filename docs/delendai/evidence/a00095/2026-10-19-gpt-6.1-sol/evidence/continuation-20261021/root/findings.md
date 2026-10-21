# Account/client authority findings

Snapshot `26b442f8fa1e73e9583be5044b5ca557b59c8919`, gpt-6.1-sol (Codex), 2026-10-21. Controlled production-helper fixtures; no full host/provider/real personal file execution.

## ACCOUNT-01 — Configured clients are global to the process and can cross project boundaries

**id:** ACCOUNT-01

**title:** Configured clients are global to the process and can cross project boundaries

**severity:** P2

**status:** confirmed with production helpers and bounded static caller trace

**component:** core account/client configuration

**locations:** ["packages/core/src/lib/shared/known-client.helper.ts:51-74", "packages/core/src/lib/cli/assemble.ts:317-320", "plugins/orchestrator-runner/src/lib/subprocess/cli.ts:160-165", "plugins/orchestrator-runner/src/lib/services/account-environment.service.ts:101"]

**snapshot:** 26b442f8fa1e73e9583be5044b5ca557b59c8919

**expected:** A project uses its own resolved client configuration for discovery, CLI scope and profile isolation, independent of another configuration composed in the same process.

**actual:** After setting A, buildCliArgs uses --fixture-a-tools. Setting B for the same command makes the same subsequent lookup use --fixture-b-tools and FIXTURE_B_PROFILE. Assembly writes the singleton; invoker/profile code reads it later.

**reproduction:** Production useConfiguredClients/knownClientOf/buildCliArgs with two synthetic declared clients. No full host or actual child; the two-configuration-in-one-process condition is explicit.

**evidence:** ["repro-account-authorities.ts", "repro-account-authorities.log", "root-continuation-report.md"]

**impact:** Wrong tool flags/profile variable/vendor metadata can be selected for the earlier project in a multi-configuration process. No secret access, launched process or cross-OS-process effect demonstrated.

**rootCause:** Module-global configured array replaces project configuration; consumers have no workspace/context key.

**recommendation:** Pass the existing pure knownClientsWith result through the project/invocation context, or create a project-scoped lookup closure. Avoid a second global registry.

**regressionTest:** Compose projects A/B with different same-command declarations in one process; each invocation/discovery/profile resolution retains its own flags before and after the other composition.

**confidence:** High for the stated local helper composition; no live provider, real user config or full multi-host execution.

**relationship:** New latest-delta project-isolation cause, distinct from G25/G131 unbound environment inheritance and the earlier remote URL key collision.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**resolution:** Deferred for joint consensus; no product fix

Source excerpt `packages/core/src/lib/shared/known-client.helper.ts:51-74`:

```ts

let configured: readonly IKnownClient[] = KNOWN_CLIENTS;

/**
 * The clients this process knows: set once where configuration is read
 * (the server's assembly), read wherever a command is matched to a client.
 */
export const useConfiguredClients = (
	declared: readonly IDeclaredClient[],
): void => {
	configured = knownClientsWith(declared);
};

```

## ACCOUNT-02 — Saving a learned classification overwrites an unreadable history without preservation

**id:** ACCOUNT-02

**title:** Saving a learned classification overwrites an unreadable history without preservation

**severity:** P2

**status:** confirmed with production helpers and bounded static caller trace

**component:** core account/client configuration

**locations:** ["packages/core/src/lib/plugins/learned-accounts.service.ts:44-58,67-81", "packages/core/src/lib/plugins/account-offer-flow.service.ts:154"]

**snapshot:** 26b442f8fa1e73e9583be5044b5ca557b59c8919

**expected:** Absent history may start empty; malformed or unreadable existing history must be preserved or cause an explicit refusal before a durable update.

**actual:** A truncated old-source classification reads as empty; real learnAccounts succeeds writing only new-source, originalRetained=false and the directory contains only learned.json.

**reproduction:** Own temporary directory, synthetic classification names, actual readLearnedAccounts+learnAccounts. Exact before/after key counts in repro-account-authorities.log.

**evidence:** ["repro-account-authorities.ts", "repro-account-authorities.log", "root-continuation-report.md"]

**impact:** Loss of prior user classification evidence and repeated/wrong follow-up setup after corruption. No credential or account configuration itself was deleted.

**rootCause:** Catch/schema failure collapses existing store to {}, and the mutex-protected writer treats it as absent. Atomic replacement does not preserve corrupted input.

**recommendation:** Use an explicit absent/valid/corrupt read result; refuse the write or preserve the raw original through the existing quarantine convention before a deliberate recovery.

**regressionTest:** Seed valid prefix plus torn tail and schema-invalid JSON; updating must not silently erase the original. Missing-file and valid-merge controls remain successful.

**confidence:** High for the stated local helper composition; no live provider, real user config or full multi-host execution.

**relationship:** New learned-account writer path in the established corrupt-not-empty family; related to C4 quota ledger and state recovery findings but distinct persisted state.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**resolution:** Deferred for joint consensus; no product fix

Source excerpt `packages/core/src/lib/plugins/learned-accounts.service.ts:44-58,67-81`:

```ts
): string => join(root, 'delendai', 'learned-accounts.json');

/** What the person answered, by finding key; nothing when the file is absent or unreadable. */
export const readLearnedAccounts = async (
	path: string,
): Promise<Readonly<Record<string, IAccountClassification>>> => {
	const text = await readFile(path, 'utf8').catch(() => undefined);
	if (text === undefined) return {};
	try {
		const parsed = LEARNED_SCHEMA.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data.classifications : {};
	} catch {
		return {};
```

## RECLAIM-01 — Failed eligibility probe becomes zero-ahead and permits deleting unique work

**id:** RECLAIM-01

**title:** Failed eligibility probe becomes zero-ahead and permits deleting unique work

**severity:** P2

**status:** confirmed through public script in owned Git fixtures

**component:** orphan reclamation and local ref maintenance

**locations:** ["tools/scripts/reclaim/reclaim-orphans.script.ts:154-158,183-205,272-273,499-506"]

**snapshot:** 26b442f8fa1e73e9583be5044b5ca557b59c8919

**expected:** An unreadable or invalid integration comparison refuses/skips deletion with its actual failure; unknown is not provably merged.

**actual:** Valid-base control preserves the unique branch. Public script --base missing-fixture-base --apply returns0 and deletes that branch; its unique commit remains one commit outside develop.

**reproduction:** Run repro-reclaim.py invalid-base versus valid-base-control; actual unmodified Bun script and real Git in a private repository/local bare remote. No shared/user refs.

**evidence:** ["repro-reclaim.py", "reclaim-result.log", "reclaim-result-clarified.json", "root-continuation-report.md"]

**impact:** Removes a branch carrying work not on develop despite lossless-cleanup classification. Only temporary repositories affected; captured commit objects remain, no immediate permanent-byte-loss claim.

**rootCause:** runGit discards failed stdout/status into empty text; aheadBehind parses missing counts and defaults nonfinite values to0; force-delete consumes that false certainty.

**recommendation:** Propagate a failed comparison as unknown/refused, validate base before any destructive action and require successful fresh ancestry proof. Preserve a structured diagnostic instead of claiming lossless eligibility.

**regressionTest:** Missing base, Git error/timeout and malformed count outputs must produce no branch deletion; genuine merged branch remains eligible; unique valid-base control remains kept.

**confidence:** High for the actual public script/real Git fixture; deterministic injected interleaving is identified, not a live user incident.

**relationship:** New failed-probe cleanup path; related to PROP-GC01 unknown cleanliness but distinct caller and eligibility datum. Not a claim that every canonical unit is handled this way.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**resolution:** Deferred for joint consensus; no product fix

```ts
const runGit = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly output: string } => {
	const res = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
	if (res.status !== 0) return { ok: false, output: '' };
	return { ok: true, output: (res.stdout ?? '').trim() };
};

const readCurrentBranch = (cwd: string): string | null => {
	const out = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).output;
	if (out === '' || out === 'HEAD') return null;
	return out;
};
```

## RECLAIM-02 — Reclamation deletes a branch that advanced after it was classified safe

**id:** RECLAIM-02

**title:** Reclamation deletes a branch that advanced after it was classified safe

**severity:** P2

**status:** confirmed through public script in owned Git fixtures

**component:** orphan reclamation and local ref maintenance

**locations:** ["tools/scripts/reclaim/reclaim-orphans.script.ts:209-221,272-273,499-506", "packages/core/src/lib/work-units/unit-removal.service.ts:59-60", "packages/core/src/lib/work-units/unit-reaper.service.ts:140-148"]

**snapshot:** 26b442f8fa1e73e9583be5044b5ca557b59c8919

**expected:** Deletion consumes the same verified branch tip that was classified; newly advanced work causes a refusal, not a force delete.

**actual:** The branch starts at develop. At the actual public deletion command, a wrapper runs a separate real Git update-ref to a unique commit. The script then executes branch-D and removes the advanced branch, exit0.

**reproduction:** Run repro-reclaim.py tip-changes-after-classification: unmodified public script, controlled PATH Git interposition, real competing update plus real deletion in an owned repository. Core-unit path is only statically compared.

**evidence:** ["repro-reclaim.py", "reclaim-result.log", "reclaim-result-clarified.json", "root-continuation-report.md"]

**impact:** Removes a branch carrying work not on develop despite lossless-cleanup classification. Only temporary repositories affected; captured commit objects remain, no immediate permanent-byte-loss claim.

**rootCause:** Eligibility records branch name/counts without expected SHA; branch-D and core local update-ref-d are unconditional. Remote drop correctly has force-with-lease and is not part of this demonstrated omission.

**recommendation:** Carry the verified tip into an atomic compare-and-delete (update-ref-d ref expectedSHA), stop on change, and keep worktree/admission checks coordinated before filesystem removal. Reuse the existing remote expected-tip principle locally.

**regressionTest:** Pause after safe classification, advance branch from another process, then resume cleanup: the new tip/ref must remain. Control unchanged merged tip may delete; dirty/newly live unit cases remain separate checks.

**confidence:** High for the actual public script/real Git fixture; deterministic injected interleaving is identified, not a live user incident.

**relationship:** New expected-tip omission, related to ref cleanup/race safeguards G37 and C7; distinct from RECLAIM-01 failed comparison. A shared deletion-proof regression can cover both without claiming the same cause.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**resolution:** Deferred for joint consensus; no product fix

```ts
const readBranches = (cwd: string, base: string): readonly IOrphanBranch[] => {
	const names = readAllBranchNames(cwd);
	return names.map((name) => {
		const { ahead, behind } = aheadBehind(cwd, base, name);
		return {
			name,
			ahead,
			behind,
			lastCommitIso: lastCommitIso(cwd, name),
			diffStat: diffStatFor(cwd, base, name),
		};
	});
};

```

## ACCOUNT-03 — Malformed model catalogue cache aborts account gathering instead of degrading to no catalogue

**id:** ACCOUNT-03

**title:** Malformed model catalogue cache aborts account gathering instead of degrading to no catalogue

**severity:** P2

**status:** confirmed by production reader and gatherer with owned fixtures

**component:** core model catalogue and CLI account offer

**snapshot:** df29b656ca803d2c9e8b453092b4566b07c8ddb4

**locations:** ["packages/core/src/lib/shared/model-catalogue.service.ts:90-102,134-143", "packages/core/src/lib/shared/account-sources.service.ts:300-316", "packages/cli/src/commands/accounts.command.ts:68-77"]

**expected:** Validate persisted catalogue shape before using it; malformed cache should degrade to a fresh fetch or no optional catalogue while account gathering remains usable.

**actual:** A valid cache yields one finding. Literal JSON null rejects on cached.fetchedAt before the fetch try/catch. Fresh timestamp plus providers:null is returned as typed catalogue and gatherFindings rejects on providers.filter. Both invalid fixtures fetch zero times.

**reproduction:** Run repro-model-catalogue.ts with actual production reader+gatherer, injected no-network fetch/runner, synthetic environment and owned temporary files.

**evidence:** ["repro-model-catalogue.ts", "repro-model-catalogue.log", "repro-model-catalogue.stderr.log"]

**impact:** Optional public naming cache blocks account setup/gathering; no lost credentials or real vendor invocation demonstrated.

**rootCause:** Parsed JSON is cast to IModelCatalogue without validation. Null handling lies outside the recovery try; fresh invalid object bypasses recovery and reaches unchecked consumers.

**recommendation:** Use one actual runtime shape validator at the cache boundary, distinguish invalid data and preserve/quarantine it; return undefined or validated fresh/stale catalogue to optional consumers.

**regressionTest:** Null, primitive, missing providers, non-array providers and invalid entries must not abort gatherFindings; valid fresh cache suppresses fetching and valid stale cache survives injected network failure.

**confidence:** High: actual production functions and valid control, deterministic local evidence. CLI exception path traced statically; no full interactive CLI/provider run.

**relationship:** New df29 model-catalogue cache boundary; related corrupt-state family but different cause from ACCOUNT-02 silent destructive overwrite. No production repair applied.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**resolution:** Deferred for joint consensus; no product fix

```ts
			: now.getTime() - Date.parse(cached.fetchedAt);
	if (cached !== undefined && age < MODEL_CATALOGUE_MAX_AGE_MS) return cached;
	try {
		const fresh = compactCatalogue(
			await (input.fetchCatalogue ?? realFetch)(
				MODEL_CATALOGUE_URL,
				MODEL_CATALOGUE_TIMEOUT_MS,
			),
			now,
		);
		if (fresh === undefined) return cached;
		await writeFileAtomic(path, JSON.stringify(fresh)).catch(
			() => undefined,
```
