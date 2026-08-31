// parallel slices per proposal (M3-first). The PLAN lives in
// the proposal document itself (a `## Slices` section); this module
// owns the pure mechanics: parsing, disjointness validation,
// dependsOn ordering and claimability. Runtime "in-progress" state is
// DERIVED from the agent lock (task_id === sliceId), and "done" from
// an explicit `- status: done` line in the doc — no sidecar files, no
// index.json changes (non-goal).

import {
	CONTRACT_MIGRATION_PHASES,
	type ContractMigrationPhase,
	type IContractMigrationSliceGuidance,
} from '@mcp-vertex/core/lib/contracts';
import { CAPABILITY_TAGS, type CapabilityTag } from '@mcp-vertex/core/public';

import { evaluateWorktreeImpactPolicy } from '../agents/worktree-impact-policy';
import { expandDeclaredFiles } from '../proposals/expand-declared-files';
import { evaluateContractMigrationPolicy } from './contract-migration-policy';

export type ISliceGate = 'lint' | 'type' | 'e2e' | 'none';

export type ISliceStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

/** The cost tier a slice is willing to spend on, 1 (cheapest) … 5. */
export type ISliceCostTier = 1 | 2 | 3 | 4 | 5;

export interface IProposalSliceContract {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly title: string;
	/** null = free; otherwise the agent name that claimed the lock. */
	readonly owner: string | null;
	readonly files: readonly string[];
	readonly dependsOn: readonly string[];
	readonly gate: ISliceGate;
	readonly status: ISliceStatus;
	readonly acceptanceCriteria: readonly string[];
	readonly migrationPhase?: ContractMigrationPhase;
	readonly migrationGuidance?: IContractMigrationSliceGuidance;
	/**
	 * f00067 S2 (routing hints, all optional — default "no preference").
	 * A slice can steer the multi-model orchestrator toward a provider
	 * that covers the given capabilities, a named provider, or a cost cap.
	 * `readonly` to match the existing idiom (CRITICAL I1).
	 */
	readonly requiresCapability?: ReadonlyArray<CapabilityTag>;
	readonly preferredProvider?: string;
	readonly maxCostTier?: ISliceCostTier;
}

export interface IProposalSlicePlan {
	readonly proposalId: string;
	readonly slices: readonly IProposalSliceContract[];
	readonly globalGate: ISliceGate;
}

export interface ISliceOverlap {
	readonly first: string;
	readonly second: string;
	readonly file: string;
}

export interface IClaimValidation {
	readonly ok: boolean;
	readonly reason: string;
	readonly blockerType:
		| 'none'
		| 'unknown-slice'
		| 'deps-not-done'
		| 'overlap-in-progress'
		| 'already-done'
		| 'already-in-progress'
		| 'isolation-required'
		| 'migration-phase-blocked';
}

const GATES: readonly ISliceGate[] = ['lint', 'type', 'e2e', 'none'];
const DECIMAL_RADIX = 10;

const asGate = (value: string | undefined): ISliceGate =>
	GATES.includes((value ?? '') as ISliceGate)
		? ((value ?? 'none') as ISliceGate)
		: 'none';

const CAPABILITY_TAG_SET: ReadonlySet<string> = new Set(CAPABILITY_TAGS);
const CONTRACT_MIGRATION_PHASE_SET: ReadonlySet<string> = new Set(
	CONTRACT_MIGRATION_PHASES,
);

const FILES_FIELD_RE = /^[-*]\s*(?:files|\*\*Files\*\*):[ \t]*(.*)$/u;

const FILES_CONTINUATION_RE = /^[ \t]+.*$/u;

/**
 * Read a single slice-body field's raw right-hand side. Accepts both the
 * plain (`- field: value`) and narrative-bold (`- **Field**: value`) forms,
 * mirroring the files/gate/status readers above. The bold label is the
 * snake_case field turned Title Case (e.g. `requires_capability` →
 * `Requires Capability`). Returns the trimmed value or undefined.
 */
const readSliceField = (body: string, field: string): string | undefined => {
	const boldLabel = field
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
	const escapedBold = boldLabel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const re = new RegExp(
		`^[-*]\\s*(?:${field}|\\*\\*${escapedBold}\\*\\*):\\s*(.+)$`,
		'm',
	);
	const raw = body.match(re)?.[1]?.trim();
	return raw !== undefined && raw.length > 0 ? raw : undefined;
};

/**
 * Parse a capability-hint value into a deduped list of known
 * `CapabilityTag`s. Accepts the YAML-list form `[a, b]`, the bracketless
 * comma form `a, b`, and a single bare token `a`. Unknown tokens are
 * dropped (the contract's closed union is the source of truth).
 */
const parseCapabilityHints = (
	raw: string | undefined,
): ReadonlyArray<CapabilityTag> => {
	if (raw === undefined) return [];
	const inner = raw.replace(/^\[/u, '').replace(/\]$/u, '');
	const seen = new Set<CapabilityTag>();
	for (const token of inner.split(',')) {
		const tag = token
			.trim()
			.replace(/^["'`]+|["'`]+$/gu, '')
			.trim();
		if (CAPABILITY_TAG_SET.has(tag)) seen.add(tag as CapabilityTag);
	}
	return [...seen];
};

const parsePreferredProvider = (
	raw: string | undefined,
): string | undefined => {
	if (raw === undefined) return undefined;
	const value = raw
		.replace(/^["'`]+|["'`]+$/gu, '')
		.replace(/[.,;:]+$/u, '')
		.trim();
	return /^[a-z][a-z0-9-]+$/u.test(value) ? value : undefined;
};

const parseCostTier = (raw: string | undefined): ISliceCostTier | undefined => {
	if (raw === undefined) return undefined;
	const n = Number.parseInt(raw.trim(), DECIMAL_RADIX);
	return n >= 1 && n <= 5 ? (n as ISliceCostTier) : undefined;
};

const parseMigrationPhase = (
	body: string,
): ContractMigrationPhase | undefined => {
	const raw =
		readSliceField(body, 'migration_phase') ??
		readSliceField(body, 'phase');
	const normalized = raw?.trim().toLowerCase();
	if (
		normalized !== undefined &&
		CONTRACT_MIGRATION_PHASE_SET.has(normalized)
	) {
		return normalized as ContractMigrationPhase;
	}
	return undefined;
};

const orderedCompletedPhasesFor = (
	slices: readonly IProposalSliceContract[],
	targetPhase: ContractMigrationPhase,
): readonly ContractMigrationPhase[] => {
	const targetIndex = CONTRACT_MIGRATION_PHASES.indexOf(targetPhase);
	const donePhases = new Set<ContractMigrationPhase>(
		slices.flatMap((slice) =>
			slice.status === 'done' && slice.migrationPhase !== undefined
				? [slice.migrationPhase]
				: [],
		),
	);
	return CONTRACT_MIGRATION_PHASES.filter(
		(phase, index) => index < targetIndex && donePhases.has(phase),
	);
};

const attachMigrationGuidance = (
	slices: readonly IProposalSliceContract[],
): readonly IProposalSliceContract[] =>
	slices.map((slice) => {
		if (slice.migrationPhase === undefined) return slice;
		const completedPhases = orderedCompletedPhasesFor(
			slices,
			slice.migrationPhase,
		);
		const verificationPassed = completedPhases.includes('verify');
		return {
			...slice,
			migrationGuidance: {
				phase: slice.migrationPhase,
				completedPhases,
				verificationPassed,
				migrationPolicy: evaluateContractMigrationPolicy({
					targetPhase: slice.migrationPhase,
					completedPhases,
					verificationPassed,
				}),
				worktreeImpactPolicy: evaluateWorktreeImpactPolicy({
					phase: slice.migrationPhase,
					touchedPaths: slice.files,
				}),
			},
		};
	});

const readRawFilesBlocks = (body: string): readonly string[] => {
	const blocks: string[] = [];
	const lines = body.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const match = line.match(FILES_FIELD_RE);
		if (match === null) continue;
		let raw = match[1] ?? '';
		while (
			index + 1 < lines.length &&
			FILES_CONTINUATION_RE.test(lines[index + 1] ?? '')
		) {
			index += 1;
			raw = `${raw}\n${lines[index] ?? ''}`;
		}
		blocks.push(raw);
	}
	return blocks;
};

/**
 * Parse the `## Slices` section of a proposal markdown. Returns null
 * when the section is absent — the proposal is then a legacy
 * single-slice document and the `plan`/`claim` modes do not apply.
 *
 * Recognised per-slice lines (inside `### <sliceId> — <title>`):
 *   - `- files: <path>` or `- **Files**: <list>` (repeatable; a line may
 *     carry one path or a comma-separated list, optionally `[]`-wrapped,
 *     each entry optionally backticked — x00098 S1)
 *   - `- depends_on: [a, b]` or `- **DependsOn**: [a, b]`
 *   - `- gate: lint|type|e2e|none` or `- **Gate**: ...`
 *   - `- status: done` or `- **Status**: done` (set by the executor when the slice closes)
 *   - `- acceptance:` followed by indented `- "command"` lines
 *   - `- requires_capability: [code-edit, fast-iteration]` (or a single
 *     bare token `code-edit`; f00067 S2 routing hint)
 *   - `- preferred_provider: openrouter-minimax` (f00067 S2)
 *   - `- max_cost_tier: 3` (1..5; f00067 S2)
 */
export const parseProposalSlicePlan = (
	proposalId: string,
	markdown: string,
): IProposalSlicePlan | null => {
	// a00069 S1 — case-insensitive on the `Slices` keyword, plus a
	// tolerant suffix (`(alias)` etc.) and the narrative variant
	// `## 5. Slices (...)` that the proposal-scaffold-linter already
	// accepts (see `proposal-scaffold-linter.ts:341`). Group 1 still
	// captures the section body so slice blocks parse as before.
	const sectionMatch = markdown.match(
		/^##(?:\s+\d+\.)?\s*Slices\b[^\n]*$([\s\S]*?)(?=^## (?!#)|\n*$(?![\s\S]))/im,
	);
	if (sectionMatch === null) return null;
	const section = sectionMatch[1] ?? '';

	const globalGateMatch = section.match(/^- global_gate:\s*([a-z0-9]+)/m);
	const globalGate = asGate(globalGateMatch?.[1]);

	const slices: IProposalSliceContract[] = [];
	const sliceBlocks = [
		...section.matchAll(
			/^### (\S+)\s+—\s+(.+)$([\s\S]*?)(?=^### |\n*$(?![\s\S]))/gm,
		),
	];
	for (const block of sliceBlocks) {
		const sliceId = block[1] ?? '';
		const title = (block[2] ?? '').trim();
		const body = block[3] ?? '';
		// x00098 S1: a Files line may carry ONE path (`- files: a.ts`) or
		// the canonical list every real proposal uses
		// (`- **Files**: \`a.ts\`, \`b.ts\`` / `- **Files**: [a.ts, b.ts]`).
		// Capture the whole rest of the line, strip an optional [] wrapper
		// and split on commas — the single-path form degenerates to a
		// one-element split, so legacy lines parse byte-identically.
		//
		// x00158 S1: the continuation group used to require a literal TAB
		// (`\n\t+`), but every real proposal indents sub-bullets with
		// spaces (`- **Files**:\n  - \`a\`\n  - \`b\``) — so the tab-only
		// check silently dropped every continuation line past the first,
		// which fed only a fragment of the declared files into the
		// (also buggy) comma split below. `[ \t]+` accepts either.
		const files = readRawFilesBlocks(body)
			.flatMap((rawBlock) => {
				const raw = rawBlock.trim();
				// x00158 S1: prefer the shared brace-aware parser (handles
				// backticked `{a,b,c}` expansion correctly). Also lift
				// `file://` markdown links so a truncated `[path](file://…)`
				// citation is not lost when a leftover backtick token (`[`)
				// already satisfied expandDeclaredFiles.
				const expanded = expandDeclaredFiles(raw);
				const fileUris = [
					...raw.matchAll(/file:\/\/(\/[^)\s#]+)/gu),
				].map((match) => match[1] ?? '');
				const tokens = [...expanded, ...fileUris];
				if (tokens.length > 0) return tokens;
				const unwrapped =
					raw.startsWith('[') && raw.endsWith(']')
						? raw.slice(1, -1)
						: raw;
				return unwrapped.split(',');
			})
			.map((token) => normalizeFileToken(token.trim()))
			.filter((f) => f.length > 0);
		const dependsRaw =
			body.match(
				/^[-*]\s*(?:depends_on|\*\*DependsOn\*\*):\s*\[([^\]]*)\]/m,
			)?.[1] ?? '';
		const dependsOn = dependsRaw
			.split(',')
			.map((d) => d.trim())
			.filter((d) => d.length > 0);
		const gate = asGate(
			body.match(/^[-*]\s*(?:gate|\*\*Gate\*\*):\s*(\S+)/m)?.[1],
		);
		const docDone =
			/^[-*]\s*status:\s*done\b/m.test(body) ||
			/^[-*]\s*\*\*Status\*\*:\s*`?done`?\b/m.test(body);
		const acceptanceBlock =
			body.match(/^[-*]\s*acceptance:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] ??
			'';
		const acceptanceCriteria = [
			...acceptanceBlock.matchAll(/^\s+[-*]\s*"([^"]+)"/gm),
		]
			.map((m) => m[1] ?? '')
			.filter((c) => c.length > 0);
		const requiresCapability = parseCapabilityHints(
			readSliceField(body, 'requires_capability'),
		);
		const preferredProvider = parsePreferredProvider(
			readSliceField(body, 'preferred_provider'),
		);
		const maxCostTier = parseCostTier(
			readSliceField(body, 'max_cost_tier'),
		);
		const migrationPhase = parseMigrationPhase(body);
		slices.push({
			proposalId,
			sliceId,
			title,
			owner: null,
			files,
			dependsOn,
			gate,
			status: docDone ? 'done' : 'pending',
			acceptanceCriteria,
			...(migrationPhase !== undefined ? { migrationPhase } : {}),
			...(requiresCapability.length > 0 ? { requiresCapability } : {}),
			...(preferredProvider !== undefined ? { preferredProvider } : {}),
			...(maxCostTier !== undefined ? { maxCostTier } : {}),
		});
	}
	if (slices.length === 0) return null;
	return {
		proposalId,
		slices: attachMigrationGuidance(slices),
		globalGate,
	};
};

/** Pairs of slices whose `files` overlap (forbidden by construction). */
export const planDisjointnessIssues = (
	plan: IProposalSlicePlan,
): readonly ISliceOverlap[] => {
	const issues: ISliceOverlap[] = [];
	for (let i = 0; i < plan.slices.length; i += 1) {
		for (let j = i + 1; j < plan.slices.length; j += 1) {
			const a = plan.slices[i];
			const b = plan.slices[j];
			if (a === undefined || b === undefined) continue;
			const bFiles = new Set(b.files);
			for (const file of a.files) {
				if (bFiles.has(file)) {
					issues.push({
						first: a.sliceId,
						second: b.sliceId,
						file,
					});
				}
			}
		}
	}
	return issues;
};

export interface ILockSnapshotEntry {
	readonly taskId: string;
	readonly agent: string;
	readonly ownership?: readonly string[];
}

const WORKSPACE_PATH_RE =
	/(?:^|\/)((?:packages|plugins|extensions|apps|tools|docs|scripts|src|lib)\/.+)$/;

const looksLikePath = (value: string): boolean => {
	if (value.length < 2) return false;
	if (/^[[\]()]+$/.test(value)) return false;
	if (value.includes('/') || /\.[A-Za-z0-9]+$/.test(value)) return true;
	return /^[A-Za-z][A-Za-z0-9._-]*$/.test(value);
};

const normalizeFileToken = (value: string): string => {
	const fileUri = value.match(/file:\/\/(\/[^)\s#]+)/u)?.[1];
	const linked = value.match(/\[[^\]]*\]\(([^)]+)\)/u)?.[1];
	let raw = fileUri ?? linked ?? value;
	raw = raw
		.replace(/^\s*[-*]\s+/gu, '')
		.replace(/`/gu, '')
		.replace(/\s*\(.*$/u, '')
		.replace(/\s*—.*$/u, '')
		.replace(/[),.;:]+$/gu, '')
		.replace(/^\[|\]$/gu, '')
		.replace(/#L[\w-]+$/u, '')
		.trim();
	const workspace = raw.match(WORKSPACE_PATH_RE)?.[1];
	if (workspace !== undefined) raw = workspace;
	return looksLikePath(raw) ? raw : '';
};

const lockCoversSlice = (
	taskId: string,
	proposalId: string,
	sliceId: string,
): boolean => {
	if (taskId === sliceId || taskId === `${proposalId}-${sliceId}`) {
		return true;
	}
	if (!taskId.startsWith(`${proposalId}-`)) {
		return false;
	}
	const grouped = taskId.slice(proposalId.length + 1).split('-');
	return grouped.includes(sliceId);
};

/**
 * Derive runtime statuses: a doc-level `done` wins; an active lock
 * whose task_id equals the sliceId means `in-progress` (owner = the
 * lock agent); otherwise the parsed status stands.
 */
export const deriveSliceStatuses = (
	plan: IProposalSlicePlan,
	activeLocks: readonly ILockSnapshotEntry[],
): IProposalSlicePlan => {
	return {
		...plan,
		slices: plan.slices.map((slice) => {
			if (slice.status === 'done') return slice;
			const lock = activeLocks.find(
				(candidate) =>
					lockCoversSlice(
						candidate.taskId,
						plan.proposalId,
						slice.sliceId,
					) ||
					candidate.ownership?.some((owned) =>
						slice.files.includes(normalizeFileToken(owned)),
					) === true,
			);
			if (lock !== undefined) {
				return { ...slice, status: 'in-progress', owner: lock.agent };
			}
			return slice;
		}),
	};
};

/**
 * Claim validation (read-only): the slice must exist, not be done or
 * already in progress, every dependsOn must be done, and its files
 * must not overlap any in-progress slice of the same plan.
 */
export const validateClaim = (
	plan: IProposalSlicePlan,
	sliceId: string,
): IClaimValidation => {
	const slice = plan.slices.find(
		(candidate) => candidate.sliceId === sliceId,
	);
	if (slice === undefined) {
		return {
			ok: false,
			blockerType: 'unknown-slice',
			reason: `slice "${sliceId}" is not declared in the ## Slices section of ${plan.proposalId}`,
		};
	}
	if (slice.status === 'done') {
		return {
			ok: false,
			blockerType: 'already-done',
			reason: `slice "${sliceId}" is already done`,
		};
	}
	if (slice.status === 'in-progress') {
		return {
			ok: false,
			blockerType: 'already-in-progress',
			reason: `slice "${sliceId}" is already in progress (owner: ${slice.owner ?? 'unknown'})`,
		};
	}
	const byId = new Map(plan.slices.map((s) => [s.sliceId, s]));
	const missingDeps = slice.dependsOn.filter(
		(dep) => byId.get(dep)?.status !== 'done',
	);
	if (missingDeps.length > 0) {
		return {
			ok: false,
			blockerType: 'deps-not-done',
			reason: `slice "${sliceId}" depends on [${missingDeps.join(', ')}] which are not done`,
		};
	}
	if (slice.migrationGuidance?.migrationPolicy.ok === false) {
		const blockers =
			slice.migrationGuidance.migrationPolicy.blockers.join(' ');
		return {
			ok: false,
			blockerType: 'migration-phase-blocked',
			reason:
				blockers.length > 0
					? blockers
					: `slice "${sliceId}" cannot start ${slice.migrationGuidance.phase} yet`,
		};
	}
	if (
		slice.migrationGuidance?.worktreeImpactPolicy.claimMode ===
		'requires-agent-worktree'
	) {
		return {
			ok: false,
			blockerType: 'isolation-required',
			reason: `slice "${sliceId}" is ${slice.migrationGuidance.phase} with high fan-out and requires agent-worktree isolation before claim. Use an isolated orchestration path (delegate or create an agent/<name> worktree) instead of the shared checkout.`,
		};
	}
	const mine = new Set(slice.files);
	for (const other of plan.slices) {
		if (other.sliceId === sliceId || other.status !== 'in-progress') {
			continue;
		}
		const overlap = other.files.find((file) => mine.has(file));
		if (overlap !== undefined) {
			return {
				ok: false,
				blockerType: 'overlap-in-progress',
				reason: `slice "${sliceId}" overlaps in-progress slice "${other.sliceId}" on ${overlap}`,
			};
		}
	}
	return { ok: true, blockerType: 'none', reason: 'claimable' };
};
