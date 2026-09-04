/**
 * Map deduplicated audit findings into ready-to-run proposal files.
 *
 * Closes the audit loop: after `audit_run` collects N model reports,
 * the consolidator produces a single canonical finding set, and this
 * module writes a native parent plan plus one child proposal per actionable
 * finding under the host's configured proposals directory for plan audits.
 *
 * The scaffolder is deliberately conservative:
 *
 * - **Only severity bands `FATAL` / `BAD` / `MINOR` get a
 *   proposal.** `OK` is intentionally silenced (no work to do).
 * - **Frontmatter is pre-filled but minimal.** We assign an id, set
 *   `kind: fix` (matches the slice spec), link the originating
 *   audit via `related: [aNNNNN]`, and surface a deterministic
 *   title derived from the finding. Hosts can edit freely.
 * - **The scaffolder is project-agnostic.** It does not know the
 *   delendai proposal-lint rules — it only knows the universal
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
	/** Canonical proposals-dir-relative path, including the kind folder. */
	readonly relativePath: string;
	/** Full markdown body (frontmatter + scaffold). */
	readonly body: string;
	/** Severity of the originating finding (for caller-side reports). */
	readonly severity: AuditSeverity;
	/** Source files the finding cited (passes through to the slices). */
	readonly files: readonly string[];
	/** Title of the finding (becomes the proposal title). */
	readonly title: string;
	/** Proposal kind emitted by this audit output. */
	readonly kind: 'audit' | 'fix' | 'plan';
}

/** Options that control what the scaffolder produces. */
export interface IScaffoldOptions {
	/** Audit output type. Defaults to `plan` for executable audit workflows. */
	readonly auditType?: 'plan' | 'valuation';
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
	 * be written. Default `docs/proposals/ready` — callers that go
	 * through the registered `audit_run` tool always pass the host's
	 * real resolved directory explicitly; this fallback only matters
	 * for a direct caller of this exported function. The value is
	 * embedded in the frontmatter comment so an editor opening the
	 * file knows where it belongs.
	 */
	readonly outputDir?: string;
	/**
	 * Override the default track-inference heuristic (folder-name
	 * based: `plugins/` → `plugins+fix`, etc., tuned for this repo's
	 * own monorepo layout) with a host-specific one. Default: the
	 * built-in heuristic, unchanged.
	 */
	readonly inferTrack?: (files: readonly string[]) => string;
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
	/** Resolve the proposals-dir-relative folder for each generated kind. */
	readonly folderForKind?: (kind: IScaffoldedProposal['kind']) => string;
}

// ---------------------------------------------------------------------------
// Slug + filename helpers
// ---------------------------------------------------------------------------

const DEFAULT_SLUG_MAX_LENGTH = 60;
const PROPOSAL_ID_WIDTH = 5;
const MAX_ID_ALLOCATION_ATTEMPTS = 10_000;
const DATE_ONLY_LENGTH = 10;

/** Convert a finding title to a stable, filesystem-safe kebab slug. */
const toSlug = (title: string, maxLen = DEFAULT_SLUG_MAX_LENGTH): string => {
	const base = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return base.length > maxLen ? base.slice(0, maxLen) : base;
};

/** Five-digit zero-padded id, matches the repo's existing proposal ids. */
const padId = (n: number): string =>
	n.toString().padStart(PROPOSAL_ID_WIDTH, '0');

const WORKSPACE_PATH_RE =
	/(?:^|\/)((?:packages|plugins|extensions|apps|tools|docs|scripts|src|lib)\/.+)$/;

/** Drop markdown leftovers (`[`) and lift `file://` links to workspace paths. */
export const sanitizeCitedFiles = (
	files: readonly string[],
): readonly string[] => {
	const out: string[] = [];
	for (const raw of files) {
		const fileUri = raw.match(/file:\/\/(\/[^)\s#]+)/u)?.[1];
		const quoted = raw.match(/`([^`]+)`/u)?.[1];
		let token = (fileUri ?? quoted ?? raw)
			.replace(/^\s*[-*]\s+/gu, '')
			.replace(/`/gu, '')
			.replace(/^\[|\]$/gu, '')
			.replace(/#L[\w-]+$/u, '')
			.trim();
		const workspace = token.match(WORKSPACE_PATH_RE)?.[1];
		if (workspace !== undefined) token = workspace;
		if (
			token.length >= 2 &&
			!/^[[\]()]+$/.test(token) &&
			(token.includes('/') || /\.[A-Za-z0-9]+$/.test(token)) &&
			!out.includes(token)
		) {
			out.push(token);
		}
	}
	return out;
};

/**
 * Allocate the next free id under `prefix`. Walks from `startAt`
 * upward until it finds an id not in `taken`.
 */
const allocateId = (
	prefix: string,
	startAt: number,
	taken: ReadonlySet<string>,
): string => {
	for (
		let n = Math.max(1, startAt);
		n < startAt + MAX_ID_ALLOCATION_ATTEMPTS;
		n += 1
	) {
		const candidate = `${prefix}${padId(n)}`;
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error(
		`proposal scaffolder: ran out of ids under prefix "${prefix}" after ${MAX_ID_ALLOCATION_ATTEMPTS} attempts`,
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
	filePath: string,
	inferTrackFn: (files: readonly string[]) => string,
): { body: string; filename: string } => {
	const slug = toSlug(title);
	const filename = `${id}-${slug}.md`;
	const relatedBlock =
		related.length > 0
			? related.map((r) => `    - ${r}`).join('\n')
			: '    - _<add related proposal ids here>_';
	const track = inferTrackFn(files);
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
		'  Sourced by `audit_run`.',
		`  Suggested output path: ${filePath}`,
		'-->',
		'',
	];
	return { body: body.join('\n'), filename };
};

const renderPlanBody = (
	id: string,
	title: string,
	children: readonly IScaffoldedProposal[],
	related: readonly string[],
	date: string,
	filePath: string,
): { body: string; filename: string } => {
	const filename = `${id}-${toSlug(title)}.md`;
	const contains =
		children.length > 0
			? children
					.map(
						(child) =>
							`        - id: ${child.id}\n          kind: fix\n          required: true\n          title: ${child.title}`,
					)
					.join('\n')
			: '        - id: _<add child proposal ids here>_\n          kind: fix\n          required: true';
	const body = [
		'---',
		`id: ${id}`,
		'status: ready',
		'type: plan',
		'kind: plan',
		`date: ${date}`,
		`title: ${title}`,
		'shipped-in: []',
		'related:',
		...(related.length > 0
			? related.map((value) => `    - ${value}`)
			: ['    - _<add originating audit id here>_']),
		'contains:',
		'    proposals:',
		contains,
		'closureGate:',
		'    requirePeerReview: true',
		'    requireAllSlicesDone: true',
		'    requireAllChildrenDone: true',
		'acceptance:',
		'  - { command: bun run validate, expect: exit0 }',
		'---',
		'',
		`# ${id} — ${title}`,
		'',
		'## Goal',
		'',
		'Coordinate the implementation proposals generated from an exhaustive plan audit.',
		'',
		'## Child proposals',
		'',
		...(children.length > 0
			? children.map((child) => `- [ ] \`${child.id}\` — ${child.title}`)
			: ['- [ ] _No actionable findings were emitted._']),
		'',
		'## Definition of Done',
		'',
		'- [ ] Every child proposal is complete and peer-reviewed.',
		'- [ ] `bun run validate` passes.',
		'',
		'<!--',
		'  Sourced by an audit of the host project.',
		`  Suggested output path: ${filePath}`,
		'-->',
		'',
	];
	return { body: body.join('\n'), filename };
};

const renderAuditBody = (
	id: string,
	title: string,
	consolidation: IConsolidation,
	planId: string | undefined,
	date: string,
	filePath: string,
): { body: string; filename: string } => {
	const filename = `${id}-${toSlug(title)}.md`;
	const related = planId !== undefined ? `    - ${planId}` : '    - []';
	const findings =
		consolidation.findings.length > 0
			? consolidation.findings.map(
					(finding) => `- ${finding.titles[0] ?? finding.id}`,
				)
			: ['- No actionable findings were emitted.'];
	const body = [
		'---',
		`id: ${id}`,
		'status: ready',
		'type: proposal',
		'track: audit',
		`date: ${date}`,
		'kind: audit',
		`title: ${title}`,
		'shipped-in: []',
		'related:',
		related,
		'acceptance:',
		'  - { command: bun run lint:proposals, expect: exit0 }',
		'---',
		'',
		`# ${id} — ${title}`,
		'',
		'## Goal',
		'',
		'Record the consolidated audit, its exact evidence, and its resulting implementation direction.',
		'',
		'## Why',
		'',
		`- Audits found: ${consolidation.auditsFound}`,
		`- Findings recorded: ${consolidation.findings.length}`,
		'',
		'## Non-goals',
		'',
		'- This proposal records audit evidence; implementation work belongs to the linked plan or child proposals.',
		'',
		'## Slices',
		'',
		`### ${id}-s1 — Preserve audit evidence`,
		'',
		'- **Status**: pending',
		'- **Files**:',
		`    - ${filePath}`,
		'- **Gate**: bun run lint:proposals',
		'- **Acceptance**:',
		'    - The consolidated audit remains available and linked to its implementation work.',
		'',
		'## Acceptance',
		'',
		'- [ ] The audit snapshot, findings, and resulting links are preserved.',
		'- [ ] `bun run lint:proposals` passes.',
		'',
		'## Verified State',
		'',
		`- Audits consolidated: ${consolidation.auditsFound}`,
		`- Findings: ${findings.join('\n')}`,
		'',
		'<!--',
		'  Sourced by the audit consolidation pipeline.',
		`  Suggested output path: ${filePath}`,
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
 * Findings with severity outside `FATAL | BAD | MINOR` are
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
	const outputDir = options.outputDir ?? 'docs/proposals/ready';
	const folderForKind =
		options.folderForKind ??
		((kind: IScaffoldedProposal['kind']): string => {
			if (kind === 'audit') return 'audits';
			if (kind === 'plan') return 'plans';
			return 'fixes';
		});
	const inferTrackFn = options.inferTrack ?? inferTrack;
	const date =
		options.date ?? new Date().toISOString().slice(0, DATE_ONLY_LENGTH);
	const auditId = options.auditId ?? allocateId('a', startAt, taken);
	taken.add(auditId);
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
		const related = [auditId];
		const files = sanitizeCitedFiles(finding.files);
		const { body, filename } = renderProposalBody(
			id,
			title,
			finding.worstSeverity,
			files,
			related,
			date,
			`${outputDir}/${folderForKind('fix')}/${id}-${slug}.md`,
			inferTrackFn,
		);
		out.push({
			id,
			filename,
			relativePath: `${folderForKind('fix')}/${filename}`,
			body,
			severity: finding.worstSeverity,
			files,
			title,
			kind: 'fix',
		});
	}
	if (options.auditType === 'plan' && out.length > 0) {
		const planTitle = 'Implementation plan from audit findings';
		const planId = allocateId('q', startAt, taken);
		taken.add(planId);
		const related = [auditId];
		const linkedChildren = out.map((child) => ({
			...child,
			body: child.body.replace(
				'related:\n',
				`related:\n    - ${planId}\n`,
			),
		}));
		const { body, filename } = renderPlanBody(
			planId,
			planTitle,
			linkedChildren,
			related,
			date,
			`${outputDir}/${folderForKind('plan')}/${planId}-${toSlug(planTitle)}.md`,
		);
		out.unshift({
			id: planId,
			filename,
			relativePath: `${folderForKind('plan')}/${filename}`,
			body,
			severity: 'MINOR',
			files: [],
			title: planTitle,
			kind: 'plan',
		});
		out.splice(1, out.length - 1, ...linkedChildren);
	}
	const planId = out.find((proposal) => proposal.kind === 'plan')?.id;
	const auditTitle = 'Consolidated audit record';
	const audit = renderAuditBody(
		auditId,
		auditTitle,
		consolidation,
		planId,
		date,
		`${outputDir}/${folderForKind('audit')}/${auditId}-${toSlug(auditTitle)}.md`,
	);
	out.unshift({
		id: auditId,
		filename: audit.filename,
		relativePath: `${folderForKind('audit')}/${audit.filename}`,
		body: audit.body,
		severity: 'MINOR',
		files: [],
		title: auditTitle,
		kind: 'audit',
	});
	return out;
};

/** Re-export the slug helper for callers that want to preview the filename. */
export const proposalFilenameFor = (title: string, id: string): string =>
	`${id}-${toSlug(title)}.md`;
