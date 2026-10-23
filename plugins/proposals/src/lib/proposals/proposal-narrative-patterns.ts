/**
 * proposal-narrative-patterns.ts — r00003 S7 (F2, S + O + D).
 *
 * The structural proposal linter (`proposal-scaffold-linter.ts`) used to
 * carry a large hardcoded catalogue of *narrative* H2-heading aliases —
 * Spanish audit phrasings, emoji section titles, and host/project-specific
 * strings like `copilot · minimax-m3` and `delendai`. That data is not
 * structural: it encodes the history of one project's audit notes. Baking
 * it into the runtime linter violated:
 *
 *   - **SRP**: the linter validated *structure* AND remembered one host's
 *     narrative history.
 *   - **OCP**: a new narrative heading meant editing the linter source.
 *   - **DIP**: there was no seam to inject a different host's vocabulary.
 *
 * This module owns the narrative-pattern concern behind
 * `INarrativePatternProvider`. The linter now depends on the provider, not
 * on a literal array:
 *
 *   - A host that wants NO narrative aliases passes
 *     `ctx.options.proposalNarrativePatterns: []` (or its own list) and the
 *     linter validates pure structure.
 *   - The historical catalogue below stays available as an opt-in default
 *     (`createDefaultNarrativePatternProvider`) so this repo's own audits
 *     under `docs/delendai/proposals/done/audits/` keep linting clean.
 *
 * The aliases map a normalised H2 heading to ONE OR MORE canonical section
 * names; the first entry is the canonical default. The list is a tuple
 * array (not an object literal) because some heading strings legitimately
 * map to more than one category, which a `Record` literal could not hold.
 */

export type INarrativeAliasEntry = readonly [string, string];

export interface INarrativePatternProvider {
	/**
	 * Normalised-heading → ordered canonical-section names. The first
	 * entry per key is the canonical default the linter applies.
	 */
	readonly aliases: Readonly<Record<string, readonly string[]>>;
}

/** Collapse a tuple list into the lookup the linter reads. Later entries
 *  with the same key extend (not overwrite) the value, preserving the
 *  divergent historical mappings that accumulated over time. */
export const buildNarrativeAliases = (
	entries: ReadonlyArray<INarrativeAliasEntry>,
): Readonly<Record<string, readonly string[]>> =>
	entries.reduce<Record<string, string[]>>((acc, [key, val]) => {
		const existing = acc[key];
		if (existing === undefined) acc[key] = [val];
		else if (!existing.includes(val)) existing.push(val);
		return acc;
	}, {});

/**
 * The historical, host/project-specific narrative catalogue. Opt-in: a
 * host injects this (or its own list) through
 * `ctx.options.proposalNarrativePatterns`. It is NOT structural; do not
 * treat membership here as part of the canonical scaffold contract.
 */
export const HISTORICAL_AUDIT_NARRATIVE_ENTRIES: ReadonlyArray<INarrativeAliasEntry> =
	[
		// === `notes` (post-mortem / status / continuation / housekeeping) ===
		['what was done', 'notes'],
		['what was done (everything ✅ with tests, committed)', 'notes'],
		['pending for 11/10 (requires decision or large scope)', 'notes'],
		['pending for 11/10 (queue §0)', 'notes'],
		['🔖 how to continue at the office', 'notes'],
		['🔖 how to continue', 'notes'],
		['queue §0 status (n1–n23)', 'notes'],
		['status at close (20:10)', 'notes'],
		['git status (important for the office)', 'notes'],
		['status', 'notes'],
		['🏁 status and continuation (home, 2026-06-17)', 'notes'],
		['🌐 new workstream — distribution + web (w1/w2), 2026-06-17', 'notes'],
		[
			'🌐 w3 — professional website (pending — full spec, this is the continuation point)',
			'notes',
		],
		[
			'🔍 independent audit 17-06 (copilot · minimax-m3) — integrated',
			'notes',
		],
		[
			'⏭️ continuation point (in order) — start with m10/m11 + h2/h9',
			'notes',
		],
		['🔍 pending project review (office assignment)', 'notes'],
		['🛠️ analysis: missing skills/tools/agents', 'notes'],
		['🛠️ analysis: recommended skills, tools and agents', 'notes'],
		['🛠️ analysis: missing skills / tools / agents', 'notes'],
		[
			'doubts I resolved for you (let me know if you change anything)',
			'notes',
		],
		['📋 analysis: the `proposals` plugin — complexity vs. need', 'notes'],
		['📝 priority recommendations', 'notes'],
		['📝 prioritized recommendations plan', 'notes'],
		['🚀 what would be missing to reach 10/10?', 'notes'],
		['🚀 what would be missing to reach an 11 of 10?', 'notes'],
		['🚀 the path to 11/10 (absolute excellence)', 'notes'],
		['🎯 global assessment', 'notes'],
		['🏁 current project status — 16 jun 2026', 'notes'],
		['grading table', 'notes'],
		['1. verdict', 'notes'],
		['2. already closed (history — do not re-open)', 'notes'],
		['2. what is wanted', 'notes'],
		['2. findings by severity', 'notes'],
		['2. methodology and verification', 'notes'],
		['2. general monorepo architecture', 'notes'],
		['2. verified status', 'notes'],
		['3. token efficiency (consolidated)', 'notes'],
		['3. live queue — open findings (verified in code)', 'notes'],
		['3. what is already very good (do not touch)', 'notes'],
		['3. general monorepo architecture', 'notes'],
		['4. slices (execution order, disjoint)', 'slices'],
		['4. what is good 👍', 'notes'],
		['4. token efficiency (consolidated)', 'notes'],
		['4. open findings (verified in code)', 'notes'],
		['5. slices (execution order, disjoint)', 'slices'],
		['5. non-goals', 'non-goals'],
		['5. loops and blockers (consolidated)', 'notes'],
		['5. what is bad ❌', 'notes'],
		['5. token efficiency (verified, not assumed)', 'notes'],
		['5. follow-up (not part of this proposal)', 'notes'],
		[
			'6. candidate capabilities (tools / skills / agents / plugins)',
			'notes',
		],
		['6. prioritized plan for 11/10', 'notes'],
		['6. loops and blockers', 'notes'],
		['6. files touched', 'notes'],
		['6. what is fatal 🔴', 'notes'],
		['6. risks and mitigations', 'risks and mitigations'],
		['6. compatibility and risks', 'risks and mitigations'],
		['7. prioritized plan toward', 'notes'],
		['7. conclusion', 'notes'],
		['7. conclusion (in order)', 'notes'],
		['7. conventional commits', 'notes'],
		['7-bis. w3 — live web requirements (user annotations)', 'notes'],
		['7-ter. third agnostic round (18-06) — assimilated findings', 'notes'],
		['8. scoreboard (this audit, not the 8)', 'notes'],
		['8. decisions made (this session)', 'notes'],
		['8. scoreboard of the 11 audits', 'notes'],
		['8. decision (mark what you want)', 'acceptance'],
		['9. close (2026-06-19)', 'notes'],
		['9. plugin analysis (ide/securecoder)', 'notes'],
		['9. loops and blockers — current status', 'notes'],
		[
			'9. session 18-06 (afternoon) — rename `mcp-project` + `agent_worktree` + auto-hosting',
			'notes',
		],
		['10. post-close audit', 'notes'],
		['10. skills, tools and agents — what is missing?', 'notes'],
		[
			'10. dogfooding: what the project still does not apply to itself',
			'notes',
		],
		[
			'10. session 20-06 — l111: orchestration crash + docsdir misaligned',
			'notes',
		],
		['11. general architecture — final diagnosis', 'notes'],
		[
			'11. what is fatal, bad, regular, good, very good and perfect',
			'notes',
		],
		[
			'11. session 21-06 — live queue close: exhaustive re-verification against code',
			'notes',
		],
		['11. table of prioritized findings', 'notes'],
		['12. table of prioritized findings', 'notes'],
		['13. recommendations ordered by impact/effort', 'notes'],
		['13. grading table', 'notes'],
		['14. conclusion', 'notes'],
		['14. what would give the most value and the least', 'notes'],
		['15. the path to 11/10 — absolute excellence', 'notes'],
		['highest value priorities', 'notes'],
		['concrete things I would add', 'notes'],
		['current status', 'notes'],

		// === `acceptance` (what was achieved / verification) ===
		['✅ done (with tests) — chronological order', 'acceptance'],
		['✅ done (with tests)', 'acceptance'],
		['✅ done this session (with tests, committed+ pushed)', 'acceptance'],
		[
			'✅ continuation 2026-06-17 (office, opus) — m6 + hardening + m9 done',
			'acceptance',
		],
		['verification (post-ship)', 'acceptance'],
		['4. verification', 'acceptance'],

		// === `goal` (decision / intent / why this exists) ===
		['background decision', 'goal'],
		['background decision.', 'goal'],
		['🔎 two findings that changed the plan', 'goal'],
		['0. why this proposal exists', 'why'],
		['0. context and motivation', 'why'],
		['0. diagnosis (bugs found during the pass)', 'why'],
		['0. the bug (in a single execution)', 'why'],
		['0. the symptom', 'why'],
		['0. quick verdict', 'goal'],
		['1. goals', 'goal'],
		['1. verdict (in one sentence)', 'goal'],
		['1. unified verdict', 'goal'],
		['1. root causes (3 distinct, all in `plugins/audit/src/`)', 'why'],
		['1. context and motivation', 'why'],
		[
			'1. by layers (fatal / bad / regular / good / very good / perfect)',
			'goal',
		],
		['1. the internal contradiction (which confirms it is a bug)', 'why'],
		['1. executive summary', 'goal'],
		['2. why it matters', 'why'],
		['2. the fix', 'why this design'],
		['2. the fix.', 'why this design'],
		[
			'2. the fix (minimal, no dependencies, no api changes)',
			'why this design',
		],
		['3. the fix', 'why this design'],
		[
			'3. the fix (minimal, no dependencies, no api changes)',
			'why this design',
		],
		['3. design', 'why this design'],
		['3. plugin structure (following the repo pattern)', 'why this design'],
		['3. what was not changed', 'why this design'],
		['3. definition of done', 'acceptance'],
		['7. definition of done', 'acceptance'],
		['8. definition of done', 'acceptance'],
		['3. definition of done', 'acceptance'],

		// === `non-goals` (deferred / left-out / out of scope) ===
		['⏸️ deliberately left out (with reason)', 'non-goals'],
		[
			'⏸️ deliberately left out (with reason) — recommend a dedicated batch',
			'non-goals',
		],
		['plus', 'non-goals'],

		// === `risks and mitigations` ===
		['risk register', 'risks and mitigations'],
		['risks and mitigations', 'risks and mitigations'],
		['risks', 'risks and mitigations'],

		// === `slices` (numbered execution steps) ===
		['0. the bug (in a single execution)', 'goal'],
		['5. slices (following the disjoint pattern)', 'slices'],
		['4. slices (following the disjoint pattern)', 'slices'],
		['4. slices (execution order, disjoint)', 'slices'],
		['5. slices (execution order, disjoint)', 'slices'],
		['4. tests', 'acceptance'],
		['5. tests', 'acceptance'],
		['6. tests', 'acceptance'],

		// === `why` (motivation / context / root cause) ===
		['0. context and motivation', 'why'],
		['1. context and motivation', 'why'],

		// === `architecture` (design / how it fits) ===
		['implementation', 'architecture'],
		['7. conventional commits', 'architecture'],
		// === Custom / domain-specific (added as the catalogue grew) ===
		['default order', 'why this design'],
		['out of scope (what it does not touch)', 'non-goals'],
		['out of scope', 'non-goals'],
		['scope', 'why this design'],
		['acceptance (global)', 'acceptance'],
		['acceptance criteria', 'acceptance'],
		['acceptance checklist', 'non-goals'],
		['acceptance evidence', 'non-goals'],
		['acceptance evidence (checklist)', 'non-goals'],
		['schema decision (kind, override, boost)', 'why this design'],
		['contract change', 'why this design'],
		['hard rules (cannot be broken)', 'non-goals'],
		['the honest constraint', 'why this design'],
		['schema decision', 'why this design'],
		['notes (cross-references)', 'non-goals'],
		['renumbering plan', 'notes'],
		['migration safety net', 'notes'],
		['risks', 'risks and mitigations'],
		['coordination notes', 'notes'],
		['coordination with f119', 'notes'],
		['proposed solid structure', 'why this design'],
		// === Audit-narrative emoji sections (recognised as "notes" since they
		//     are post-hoc commentary, not part of the proposal's plan) ===
		['📊 resumen ejecutivo', 'notes'],
		['📊 executive summary and general opinion', 'notes'],
		[
			'🔴 fatal — critical or design errors that must be corrected',
			'notes',
		],
		[
			'🔴 fatal — blockers or critical failures for concurrent swarms',
			'notes',
		],
		['🔴 fatal — errors that must be corrected without excuse', 'notes'],
		['🔴 fatal — errors that must be corrected without excuse', 'notes'],
		['🟠 very bad — serious problems that degrade quality', 'notes'],
		[
			'🟠 bad (very bad) — serious problems that degrade consistency and reliability',
			'notes',
		],
		[
			'🟠 very bad — serious problems that degrade quality or genericity',
			'notes',
		],
		['🟡 regular — works but improvable', 'notes'],
		[
			'🟡 regular — technical debt and inefficient or blocking operations',
			'notes',
		],
		['🟢 as it should be — correct and functional', 'notes'],
		['🟢 as it should be — correct, standard and coherent', 'notes'],
		['✅ good — above expectations', 'notes'],
		['✅ good — above average / clean implementation', 'notes'],
		['🌟 very good — excellent execution', 'notes'],
		['🌟 very good — excellent technical execution', 'notes'],
		['💎 perfect — reference to be proud of', 'notes'],
		['💎 perfect — exemplary and reference design', 'notes'],
		['🔮 analysis: token efficiency for agents', 'notes'],
		['🔮 analysis: token efficiency for models', 'notes'],
		['🔄 analysis: possible loops and blockers', 'notes'],
		['🔄 analysis: loops and blockers in orchestration', 'notes'],
	];

/**
 * Default provider: the historical catalogue, so this repo's existing
 * audits keep passing without per-file config. Hosts that want a strict,
 * structure-only linter inject an empty provider instead.
 */
export const createDefaultNarrativePatternProvider =
	(): INarrativePatternProvider => ({
		aliases: buildNarrativeAliases(HISTORICAL_AUDIT_NARRATIVE_ENTRIES),
	});

/** Empty provider: no narrative aliases. The linter validates pure
 *  structure; only the canonical section names are recognised. */
export const createEmptyNarrativePatternProvider =
	(): INarrativePatternProvider => ({ aliases: {} });

/**
 * Build a provider from a host-supplied list of `[heading, canonical]`
 * tuples (`ctx.options.proposalNarrativePatterns`). Defensive: ignores
 * malformed entries so a bad config row can never throw inside the linter.
 */
export const createNarrativePatternProvider = (
	entries: ReadonlyArray<INarrativeAliasEntry> | undefined,
): INarrativePatternProvider => {
	if (entries === undefined) return createDefaultNarrativePatternProvider();
	const clean = entries.filter(
		(e): e is INarrativeAliasEntry =>
			Array.isArray(e) &&
			e.length === 2 &&
			typeof e[0] === 'string' &&
			typeof e[1] === 'string',
	);
	return { aliases: buildNarrativeAliases(clean) };
};
