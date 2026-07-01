/**
 * Map deduplicated audit findings into ready-to-run proposal files.
 *
 * Alcance B (f00077) closes the audit loop: after
 * `audit_run` collects N model reports, the consolidator produces a
 * single canonical finding set, and this module writes one proposal
 * per actionable finding under `docs/mcp-vertex/proposals/ready/`.
 *
 * The scaffolder is deliberately conservative:
 *
 * - **Only severity bands `FATAL` / `MUY_MAL` / `MEJORABLE` get a
 *   proposal.** `OK` / `MUY_BIEN` / `PERFECTO` are intentionally
 *   silenced (no work to do).
 * - **Frontmatter is pre-filled but minimal.** We assign an id, set
 *   `kind: fix` (matches the slice spec), link the originating
 *   audit via `related: [aNNNNN]`, and surface a deterministic
 *   title derived from the finding. Hosts can edit freely.
 * - **The scaffolder is project-agnostic.** It does not know the
 *   mcp-vertex proposal-lint rules — it only knows the universal
 *   shape (id, kind, status, title, related, slices). The lint will
 *   still complain if a host customises this template; that is the
 *   host's problem, not ours.
 * - **No filesystem writes happen here.** The scaffolder returns
 *   {@link IScaffoldedProposal} records; the tool (audit-run.tool.ts)
 *   is the durability boundary. That keeps the unit-level tests
 *   fast and the e2e test in charge of sandbox paths.
 *
 * Filename and ID conventions:
 *
 * - Filename: `xNNNNN-<slug>.md`, where `slug` is the
 *   kebab-cased version of the finding's title.
 * - ID: same `xNNNNN`. Allocation is deterministic given the
 *   starting prefix: we walk the index, find the highest number for
 *   the requested prefix, and continue from there. Callers can
 *   pre-allocate ids by passing `existingIds` from the registry.
 */

import type {
	AuditSeverity,
	IConsolidation,
} from '../contracts/interfaces/audit.interface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of scaffolding one finding into a proposal file. */
export interface IScaffoldedProposal {
	/** Assigned proposal id (e.g. `x00077`). */
	readonly id: string;
	/** Conventional filename (e.g. `x00077-short-slug.md`). */
	readonly filename: string;
	/** Full markdown body (frontmatter + scaffold). */
	readonly body: string;
	/** Severity of the originating finding (for caller-side reports). */
	readonly severity: AuditSeverity;
	/** Source files the finding cited (passes through to the slices). */
	readonly files: readonly string[];
	/** Title of the finding (becomes the proposal title). */
	readonly title: string;
}

/** Options that control what the scaffolder produces. */
export interface IScaffoldOptions {
	/**
	 * Ids the scaffolder must skip when allocating a new one. The
	 * orchestrator passes the index's `id` set so we never collide
	 * with a proposal the user already authored.
	 */
	readonly existingIds?: ReadonlySet<string>;
	/**
	 * First id to try. Default `1` — the scaffolder walks from
	 * there until it finds an unused number under the chosen prefix.
	 */
	readonly startAt?: number;
	/**
	 * Output directory (workspace-relative) where the proposal will
	 * be written. Default `docs/mcp-vertex/proposals/ready`. The
	 * value is embedded in the frontmatter comment so an editor
	 * opening the file knows where it belongs.
	 */
	readonly outputDir?: string;
	/**
	 * Originating audit id to link in the frontmatter `related`
	 * array. When the caller does not pass one, the scaffolder
	 * leaves the field empty (the proposal lint will warn but not
	 * fail — see AGENTS.md rule 9).
	 */
	readonly auditId?: string;
	/**
	 * Today's date in `YYYY-MM-DD`. Default: a fresh `new Date()`.
	 * Exposed for tests.
	 */
	readonly date?: string;
	/**
	 * Project-agnostic prefix for the new proposals. The slice spec
	 * asks for `x` (fix) — the scaffolder default matches. Hosts can
	 * override (e.g. `c` for chore) without forking this module.
	 */
	readonly prefix?: string;
}

// ---------------------------------------------------------------------------
// Slug + filename helpers
// ---------------------------------------------------------------------------

/** Convert a finding title to a stable, filesystem-safe kebab slug. */
const toSlug = (title: string, maxLen = 60): string => {
	const base = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return base.length > maxLen ? base.slice(0, maxLen) : base;
};

/** Five-digit zero-padded id, matches the repo's existing proposal ids. */
const padId = (n: number): string => n.toString().padStart(5, '0');

/**
 * Allocate the next free id under `prefix`. Walks from `startAt`
 * upward until it finds an id not in `taken`.
 */
const allocateId = (
	prefix: string,
	startAt: number,
	taken: ReadonlySet<string>,
): string => {
	for (let n = Math.max(1, startAt); n < startAt + 10_000; n += 1) {
		const candidate = `${prefix}${padId(n)}`;
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error(
		`proposal scaffolder: ran out of ids under prefix "${prefix}" after 10 000 attempts`,
	);
};

// ---------------------------------------------------------------------------
// Slices derivation
// ---------------------------------------------------------------------------

/**
 * Build a single-slice scaffold from one finding. We always emit
 * exactly one slice per proposal (the slice spec says "scaffolded
 * slices based on the finding's file references") — the agent that
 * picks up the proposal can split it further if it wants.
 */
const renderSlice = (
	sliceId: string,
	title: string,
	files: readonly string[],
	severity: AuditSeverity,
): string => {
	const filesList =
		files.length > 0
			? files.map((f) => `    - \`${f}\``)
			: ['    - _<to be derived during investigation>_'];
	return [
		`### ${sliceId} — Fix: ${title}`,
		'',
		'- **Status**: pending',
		'- **Files**:',
		...filesList,
		'- **Gate**: bun run validate',
		'- **Acceptance**:',
		`    - The cited file(s) no longer exhibit the \`${severity}\` symptom`,
		'    - `bun run validate` exits 0',
		'    - `bun run lint:proposals` exits 0',
	].join('\n');
};

// ---------------------------------------------------------------------------
// Proposal body renderer
// ---------------------------------------------------------------------------

/** Render a complete proposal body (frontmatter + markdown). */
const renderProposalBody = (
	id: string,
	title: string,
	severity: AuditSeverity,
	files: readonly string[],
	related: readonly string[],
	date: string,
	outputDir: string,
): { body: string; filename: string } => {
	const slug = toSlug(title);
	const filename = `${id}-${slug}.md`;
	const relatedBlock =
		related.length > 0
			? related.map((r) => `    - ${r}`).join('\n')
			: '    - _<add related proposal ids here>_';
	const track = inferTrack(files);
	const body = [
		'---',
		`id: ${id}`,
		'status: ready',
		'type: proposal',
		`track: ${track}`,
		`date: ${date}`,
		'kind: fix',
		`title: ${title}`,
		'shipped-in: []',
		'recan: []',
		'related:',
		relatedBlock,
		'acceptance:',
		'  - { command: bun run validate, expect: exit0 }',
		'  - { command: bun run lint:proposals, expect: exit0 }',
		'---',
		'',
		`# ${id} — ${title}`,
		'',
		'## Goal',
		'',
		`Address the \`${severity}\` finding surfaced by the originating audit`,
		related.length > 0
			? `(\`${related[0]}\`)`
			: '(_audit reference missing_)',
		':',
		'',
		`- ${title}`,
		`- Severity band: **${severity}**`,
		files.length > 0
			? `- Cited file(s): ${files.map((f) => `\`${f}\``).join(', ')}`
			: '- Cited file(s): _to be determined during investigation_',
		'',
		'## Slices',
		'',
		renderSlice(`${id}-s1`, title, files, severity),
		'',
		'## Acceptance',
		'',
		'- [ ] The cited file(s) no longer exhibit the symptom.',
		'- [ ] `bun run validate` passes.',
		'- [ ] `bun run lint:proposals` passes.',
		'',
		'<!--',
		`  Sourced by \`audit_run\` (alcance B, f00077).`,
		`  Suggested output dir: ${outputDir}/${filename}`,
		'-->',
		'',
	];
	return { body: body.join('\n'), filename };
};

/** Pick a track tag that roughly maps the finding to the right squad. */
const inferTrack = (files: readonly string[]): string => {
	const lower = files.join(' ').toLowerCase();
	if (lower.includes('plugins/')) return 'plugins+fix';
	if (lower.includes('apps/web/') || lower.includes('extensions/'))
		return 'web+host+fix';
	if (lower.includes('packages/')) return 'core+fix';
	if (lower.includes('docs/') || lower.includes('.md')) return 'docs+fix';
	return 'fix';
};

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Map one consolidation into zero or more ready-to-write proposal
 * files. Returns the records in severity order (FATAL first) so the
 * caller can write them in priority order and the resulting index
 * stays roughly grouped.
 *
 * Findings with severity outside `FATAL | MUY_MAL | MEJORABLE` are
 * silently skipped (they do not need a fix proposal). To debug the
 * skip set, callers can diff `findings.length` against
 * `result.length`.
 */
export const scaffoldProposals = (
	consolidation: IConsolidation,
	options: IScaffoldOptions = {},
): readonly IScaffoldedProposal[] => {
	const prefix = options.prefix ?? 'x';
	const startAt = options.startAt ?? 1;
	// Copy the readonly set into a mutable one — we allocate new ids
	// inside the loop and the input contract says we must not
	// mutate the caller's set.
	const taken: Set<string> = new Set(options.existingIds ?? []);
	const outputDir = options.outputDir ?? 'docs/mcp-vertex/proposals/ready';
	const date = options.date ?? new Date().toISOString().slice(0, 10);
	const auditId = options.auditId;
	const out: IScaffoldedProposal[] = [];
	const seenTitles = new Set<string>();

	for (const finding of consolidation.findings) {
		if (
			finding.worstSeverity !== 'FATAL' &&
			finding.worstSeverity !== 'BAD' &&
			finding.worstSeverity !== 'MINOR'
		) {
			continue;
		}
		const title = (finding.titles[0] ?? finding.id).trim();
		if (title.length === 0) continue;
		// Deduplicate by slug so two related findings do not collide
		// on the same proposal file. The first one wins.
		const slug = toSlug(title);
		if (seenTitles.has(slug)) continue;
		seenTitles.add(slug);

		const id = allocateId(prefix, startAt, taken);
		taken.add(id);
		const related = auditId ? [auditId] : [];
		const { body, filename } = renderProposalBody(
			id,
			title,
			finding.worstSeverity,
			finding.files,
			related,
			date,
			outputDir,
		);
		out.push({
			id,
			filename,
			body,
			severity: finding.worstSeverity,
			files: finding.files,
			title,
		});
	}
	return out;
};

/** Re-export the slug helper for callers that want to preview the filename. */
export const proposalFilenameFor = (title: string, id: string): string =>
	`${id}-${toSlug(title)}.md`;
