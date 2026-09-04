import { dirname, join } from 'node:path';
import z from 'zod';
import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import {
	redactSecrets,
	VALIDATE_EVIDENCE_SCHEMA,
	toolError,
	toolJson,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { runAgentNames } from './agent-names.tool';
import type { IGitRunner } from '../shared/git-runner';
import { toolErrorEnvelope } from '../shared/tool-envelope';
import { createPendingIntegrationStore } from '../shared/pending-integration-store';
import { AGENT_BRANCH_PREFIX } from '../contracts/constants/agent-branch-convention.constant';
import { PEER_REVIEW_LOG_RELATIVE_PATH } from '../contracts/constants/proposal-paths.constant';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import {
	allocateNextProposalId,
	prefixForKind,
} from '../proposals/proposal-id-allocator';
import { runAcceptanceCriteria } from '../proposals/proposal-acceptance';
import {
	PROPOSAL_KIND_BY_PREFIX,
	type IProposalKind,
} from '../contracts/constants/proposal-glossary.constant';
import { proposalFolderFor } from '../contracts/proposal-folder-policy';
import {
	kindMatchesId,
	newProposalIdSchema,
} from '../contracts/schemas/proposal-kind.schema';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import { appendPeerReviewJsonl } from '../shared/peer-review-log';
import { escapeRegExp, slugFromTitle } from '../shared/string-helpers';
import {
	deriveSliceStatuses,
	parseProposalSlicePlan,
	planDisjointnessIssues,
	validateClaim,
} from '../swarm/proposal-slice-plan';
import {
	parseReviewState,
	renderReviewLines,
	reviewTransition,
	type IReviewRound,
} from '../swarm/proposal-review';
import { recordProposalReviewAction } from '../shared/peer-review-log';
import {
	buildReviewIdentity,
	checkApproveIdentity,
	recordReviewSubmitIdentity,
} from '../services/review-identity';
import {
	markProposalDoneForAutoTransition,
	recordAutoTransitionRepair,
} from '../services/auto-transition';
import {
	diagnoseValidateEvidence,
	resolveRecentValidateEvidence,
	type IValidateEvidenceDeps,
} from './proposal-transition.tool';
import { locateProposal } from '../proposals/locate';
import { buildCloseBlockerGuidance } from '../services/close-blocker';
import type { IValidateEvidence } from '../services/transition-evidence';
import { readActiveLocks, resolveIndexedDoc } from './authoring-options';
import type {
	IAuthoringToolOptions,
	ICloseSliceValidationDecision,
} from './authoring-options';
import {
	maybePersistAfterSlice,
	type IPersistResult,
} from './auto-work-persist';

type ICloseSlicePersistConfig = {
	readonly mode: 'none' | 'commit' | 'commit-and-push';
	readonly messageTemplate?: string;
	readonly pushTarget?: string;
	readonly protectedBranches?: readonly string[];
};

export type { IAuthoringToolOptions } from './authoring-options';
export { readActiveLocks } from './authoring-options';

// MCP hosts commonly cancel a tool call after one minute. Keep the
// close-slice validation below that deadline so callers receive the
// structured validation error and the document mutex is always released.
const CLOSE_SLICE_VALIDATION_TIMEOUT_MS = 45_000;
const ISO_DATE_LENGTH = 10;
const TIMEOUT_EXIT_CODE = 124;

/**
 * x00156 S5 — the `close_slice` write-path throws a plain `Error`
 * decorated with these extra fields (quality-gate failure, or a
 * validation-error kind checked defensively though nothing currently
 * throws it) instead of a dedicated Error subclass. Named once and
 * shared between the throw site and the catch site so neither needs
 * `catch (err: any)`.
 */
type ICloseSliceThrownError = Error & {
	readonly kind?:
		| 'validation-error'
		| 'quality-failed'
		| 'peer-review-required';
	readonly output?: string;
	readonly persist?: IPersistResult;
	readonly detail?: {
		readonly ok: boolean;
		readonly severity: 'ok' | 'error';
		readonly findings: readonly string[];
		readonly summary?: { readonly ok: boolean; readonly scopes: number };
	};
	readonly validationDecision?: ICloseSliceValidationDecision;
};

const isCloseSliceThrownError = (
	value: unknown,
): value is ICloseSliceThrownError => value instanceof Error;

/**
 * x00156 S5 — the review-transition write-path (`approve` /
 * `request_changes`) throws a plain `Error` decorated with a
 * pre-built `toolError(...)` envelope (see the identity-check guard
 * above) so the catch site can re-surface it verbatim.
 */
type IToolErrorCarryingError = Error & { readonly toolError?: IToolTextResult };

const isToolErrorCarryingError = (
	value: unknown,
): value is IToolErrorCarryingError => value instanceof Error;

export const REVIEW_APPROVE_COMMIT_HASH_MIN_LEN = 7;
export const REVIEW_APPROVE_COMMIT_HASH_MAX_LEN = 40;
export const REVIEW_APPROVE_COMMIT_HASH_RE = new RegExp(
	`^[0-9a-f]{${REVIEW_APPROVE_COMMIT_HASH_MIN_LEN},${REVIEW_APPROVE_COMMIT_HASH_MAX_LEN}}$`,
	'i',
);

export interface IProposalReviewEvidence {
	readonly commitHash: string;
	readonly validateExitCode: number;
	readonly testsPassing: number;
	readonly testsTotal: number;
}

export const REVIEW_EVIDENCE_SCHEMA = z
	.object({
		commitHash: z
			.string()
			.regex(
				REVIEW_APPROVE_COMMIT_HASH_RE,
				`evidence.commitHash must be ${REVIEW_APPROVE_COMMIT_HASH_MIN_LEN}-${REVIEW_APPROVE_COMMIT_HASH_MAX_LEN} hex characters`,
			),
		validateExitCode: z
			.number()
			.int()
			.refine((value) => value === 0, {
				message: 'evidence.validateExitCode must be 0',
			}),
		testsPassing: z
			.number()
			.int()
			.min(1, 'evidence.testsPassing must be >= 1'),
		testsTotal: z.number().int().min(1, 'evidence.testsTotal must be >= 1'),
	})
	.refine((value) => value.testsPassing <= value.testsTotal, {
		message: 'evidence.testsPassing must be <= evidence.testsTotal',
		path: ['testsPassing'],
	});

export const REVIEW_INPUT_SCHEMA = z.object({
	proposalId: z.string(),
	sliceId: z.string(),
	action: z.enum(['submit', 'approve', 'request_changes', 'status']),
	agent: z.string().min(1),
	note: z.string().optional(),
	evidence: REVIEW_EVIDENCE_SCHEMA.optional(),
});

export const REVIEW_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	proposalId: z.string(),
	sliceId: z.string(),
	action: z.string(),
	status: z.enum(['none', 'in_review', 'changes_requested', 'done']),
	implementer: z.string().nullable(),
	reviewer: z.string().nullable(),
	rounds: z.array(
		z.object({
			verdict: z.enum(['requested_changes', 'approved']),
			agent: z.string(),
			note: z.string(),
		}),
	),
	lockReleased: z.boolean(),
	assignmentReleased: z.boolean(),
	redactedSecrets: z.number().int().nonnegative(),
});

const toApproveEvidenceError = (reason: string): IToolTextResult =>
	toolError(`approve requires empirical evidence: ${reason}`);

const requireProposalReviewEvidence = (
	evidence: IProposalReviewEvidence | undefined,
): IToolTextResult | null => {
	if (evidence === undefined) {
		return toApproveEvidenceError(
			'provide evidence.commitHash, evidence.validateExitCode=0, evidence.testsPassing>=1, and evidence.testsTotal>=1',
		);
	}
	const parsed = REVIEW_EVIDENCE_SCHEMA.safeParse(evidence);
	if (!parsed.success) {
		return toApproveEvidenceError(
			parsed.error.issues[0]?.message ?? 'invalid evidence payload',
		);
	}
	return null;
};

type IPeerReviewPersistedEntry = {
	readonly ts: string;
	readonly proposal_id: string;
	readonly slice_id: string;
	readonly agent: string;
	readonly verdict: 'approved' | 'request_changes';
	readonly note?: string;
};

const appendPeerReviewLog = async (
	logPathAbs: string,
	entry: IPeerReviewPersistedEntry,
): Promise<void> => appendPeerReviewJsonl(logPathAbs, entry);

export const runCloseSliceValidation = async (
	command: string,
	cwd: string,
	timeoutMs = CLOSE_SLICE_VALIDATION_TIMEOUT_MS,
): Promise<{
	readonly ok: boolean;
	readonly output: string;
	readonly exitCode: number;
}> => {
	const result = await runAcceptanceCriteria(
		[{ command, expect: 'exit0', timeoutMs }],
		{ cwd },
	);
	const verdict = result.results[0];
	if (verdict === undefined) {
		return {
			ok: false,
			output: 'validation command produced no result',
			exitCode: 1,
		};
	}
	return {
		ok: verdict.passed,
		output: [verdict.actual, verdict.reason]
			.filter(
				(part): part is string =>
					typeof part === 'string' && part.length > 0,
			)
			.join('\n'),
		exitCode:
			verdict.exitCode ??
			(verdict.reason?.startsWith('timeout:') ? TIMEOUT_EXIT_CODE : 1),
	};
};

export const runCloseSliceQualityGate = async (
	cwd: string,
	timeoutMs = CLOSE_SLICE_VALIDATION_TIMEOUT_MS,
	options: {
		readonly scopes?: readonly string[];
	} = {},
): Promise<{
	readonly ok: boolean;
	readonly severity: 'ok' | 'error';
	readonly findings: readonly string[];
	readonly summary?: {
		readonly ok: boolean;
		readonly scopes: number;
	};
}> => {
	const result = await runAcceptanceCriteria(
		[
			{
				command: [
					'bun tools/scripts/quality/run-quality.script.ts',
					'--json',
					...(options.scopes ?? []).map(
						(scope) => `--scope=${scope}`,
					),
				].join(' '),
				expect: 'exit0',
				timeoutMs,
			},
		],
		{ cwd },
	);
	const verdict = result.results[0];
	const output = [verdict?.actual, verdict?.reason]
		.filter(
			(part): part is string =>
				typeof part === 'string' && part.length > 0,
		)
		.join('\n')
		.trim();
	if (output.length > 0) {
		try {
			const parsed = JSON.parse(output) as {
				ok?: boolean;
				severity?: 'ok' | 'error';
				findings?: readonly string[];
				summary?: { ok?: boolean; scopes?: number };
			};
			return {
				ok: parsed.ok === true,
				severity: parsed.severity === 'error' ? 'error' : 'ok',
				findings: [...(parsed.findings ?? [])],
				...(parsed.summary !== undefined &&
				typeof parsed.summary.ok === 'boolean' &&
				typeof parsed.summary.scopes === 'number'
					? {
							summary: {
								ok: parsed.summary.ok,
								scopes: parsed.summary.scopes,
							},
						}
					: {}),
			};
		} catch {
			// fall through to a synthetic structured failure below
		}
	}
	return {
		ok: false,
		severity: 'error',
		findings: [
			output.length > 0
				? output
				: 'quality gate failed without structured output',
		],
	};
};

const SLICE_IN = z.object({
	sliceId: z.string(),
	title: z.string().optional(),
	files: z.array(z.string()),
	gate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	dependsOn: z.array(z.string()).optional(),
	acceptance: z.array(z.string()).optional(),
});

export const CREATE_PROPOSAL_INPUT_SCHEMA = z.object({
	id: z.string().optional(),
	kind: z
		.enum([
			'feat',
			'breaking',
			'fix',
			'refactor',
			'perf',
			'audit',
			'chore',
			'docs',
			'test',
			'infra',
			'spike',
			'legacy',
			'resume',
		])
		.optional(),
	title: z.string(),
	goal: z.string().optional(),
	status: z
		.enum(['pending', 'ready', 'in_progress', 'in-progress'])
		.optional(),
	track: z.string().optional(),
	why: z.string().optional(),
	nonGoals: z.array(z.string()).optional(),
	globalGate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	slices: z.array(SLICE_IN).optional(),
});

export const CREATE_PROPOSAL_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	file: z.string(),
	path: z.string(),
	disjointnessIssues: z.array(
		z.object({
			first: z.string(),
			second: z.string(),
			file: z.string(),
		}),
	),
	indexCount: z.number(),
	redactedSecrets: z.number().int().nonnegative().optional(),
});

// x00098 S2: emit the canonical slice shape the repo linter validates
// (`**Status**`/`**Files**`/`**Gate**` bullets); the plan parser reads
// both this and the legacy lowercase form.
// The repo linter only accepts uppercase slice headings (`### S1 — …`),
// so normalise whatever case the caller passed (a00053: callers passing
// `s1` produced documents the linter rejected).
const canonicalSliceId = (id: string): string => id.replace(/^s(?=\d)/, 'S');

/**
 * Regex fragment matching a slice id in either case (`s1`/`S1`), so
 * close_slice keeps finding blocks in legacy lowercase documents and in
 * the canonical uppercase form regardless of how the caller spelled it.
 */
const sliceIdPattern = (id: string): string =>
	/^[sS]\d+$/.test(id)
		? `[sS]${escapeRegExp(id.slice(1))}`
		: escapeRegExp(id);

const renderSlice = (s: z.infer<typeof SLICE_IN>): string => {
	const lines = [
		`### ${canonicalSliceId(s.sliceId)} — ${s.title ?? s.sliceId}`,
	];
	lines.push('- **Status**: pending');
	if (s.dependsOn && s.dependsOn.length > 0) {
		lines.push(
			`- **DependsOn**: [${s.dependsOn.map(canonicalSliceId).join(', ')}]`,
		);
	}
	lines.push(`- **Files**: ${s.files.map((f) => `\`${f}\``).join(', ')}`);
	lines.push(`- **Gate**: ${s.gate ?? 'none'}`);
	if (s.acceptance && s.acceptance.length > 0) {
		lines.push('- acceptance:');
		for (const a of s.acceptance) lines.push(`  - "${a}"`);
	}
	return lines.join('\n');
};

type ICreateProposalSlice = z.infer<typeof SLICE_IN>;

type IFrontmatterPrimitive = boolean | number | string;

interface ICreateProposalRequest {
	readonly id?: string | undefined;
	readonly kind?: string | undefined;
	readonly title: string;
	readonly goal?: string | undefined;
	readonly status?: string | undefined;
	readonly track?: string | undefined;
	readonly why?: string | undefined;
	readonly nonGoals?: readonly string[] | undefined;
	readonly globalGate?: 'lint' | 'type' | 'e2e' | 'none' | undefined;
	readonly slices?: readonly ICreateProposalSlice[] | undefined;
	readonly extraFrontmatter?:
		| Readonly<Record<string, IFrontmatterPrimitive>>
		| undefined;
}

interface ICreateProposalWriteResult {
	readonly ok: true;
	readonly file: string;
	readonly path: string;
	readonly disjointnessIssues: readonly {
		readonly first: string;
		readonly second: string;
		readonly file: string;
	}[];
	readonly indexCount: number;
	readonly redactedSecrets: number;
}

interface ICreateProposalWriteError {
	readonly ok: false;
	readonly reason: string;
	readonly nextAction: string;
}

const serializeFrontmatterValue = (value: IFrontmatterPrimitive): string =>
	typeof value === 'string' ? JSON.stringify(value) : String(value);

const renderExtraFrontmatter = (
	frontmatter: Readonly<Record<string, IFrontmatterPrimitive>> | undefined,
): string[] =>
	Object.entries(frontmatter ?? {})
		.filter(([, value]) => value !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`);

export const createProposalDocument = async (
	args: ICreateProposalRequest,
	options: Pick<
		IAuthoringToolOptions,
		| 'workspaceRoot'
		| 'proposalsDirAbs'
		| 'counterPathAbs'
		| 'layout'
		| 'extraFolders'
		| 'folderPolicy'
	>,
): Promise<ICreateProposalWriteResult | ICreateProposalWriteError> => {
	let id: string;
	if (args.id !== undefined) {
		id = args.id;
		const idResult = newProposalIdSchema.safeParse(id);
		if (!idResult.success) {
			return {
				ok: false,
				reason: `invalid proposal id "${id}" — ${idResult.error.issues[0]?.message ?? 'malformed'}`,
				nextAction:
					'Use one lowercase family prefix followed by exactly five digits (for example f00001), or omit id and pass kind for race-safe allocation.',
			};
		}
		if (args.kind !== undefined) {
			const match = kindMatchesId(args.kind, id);
			if (!match.ok) {
				return {
					ok: false,
					reason: match.reason,
					nextAction:
						'Ensure the ID prefix matches the specified kind.',
				};
			}
		}
	} else if (args.kind !== undefined) {
		const prefix = prefixForKind(args.kind);
		if (prefix === null) {
			return {
				ok: false,
				reason: `unknown kind "${args.kind}"`,
				nextAction: 'Pass a recognised kind, or pass id explicitly.',
			};
		}
		id = await allocateNextProposalId(prefix, {
			proposalsDirAbs: options.proposalsDirAbs,
			counterPathAbs: options.counterPathAbs,
		});
	} else {
		return {
			ok: false,
			reason: 'either id or kind is required',
			nextAction:
				'Pass an explicit id, or pass kind to auto-allocate the next one (f00016 S13).',
		};
	}
	const slices = [...(args.slices ?? [])];
	const plan = {
		proposalId: id,
		globalGate: (args.globalGate ?? 'none') as
			| 'lint'
			| 'type'
			| 'e2e'
			| 'none',
		slices: slices.map((s) => ({
			proposalId: id,
			sliceId: s.sliceId,
			title: s.title ?? s.sliceId,
			owner: null,
			files: s.files,
			dependsOn: s.dependsOn ?? [],
			gate: (s.gate ?? 'none') as 'lint' | 'type' | 'e2e' | 'none',
			status: 'pending' as const,
			acceptanceCriteria: s.acceptance ?? [],
		})),
	};
	const issues = planDisjointnessIssues(plan);
	if (issues.length > 0) {
		return {
			ok: false,
			reason: `slices share files: ${issues.map((i) => `${i.first}/${i.second}:${i.file}`).join(', ')}`,
			nextAction: 'Make each slice edit a disjoint set of files.',
		};
	}
	const inferredKind: IProposalKind =
		args.kind !== undefined && prefixForKind(args.kind) !== null
			? (args.kind as IProposalKind)
			: (PROPOSAL_KIND_BY_PREFIX[id[0] ?? ''] ?? 'feat');
	const date = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
	const status = canonicalStatus(args.status);
	const acceptanceLines = slices.flatMap((s) =>
		(s.acceptance ?? []).map((acceptance) => `- ${acceptance}`),
	);
	const body = [
		'---',
		`id: ${id}`,
		`title: ${JSON.stringify(args.title)}`,
		`kind: ${inferredKind}`,
		`status: ${status}`,
		'type: proposal',
		`track: ${args.track ?? 'general'}`,
		`date: ${date}`,
		...renderExtraFrontmatter(args.extraFrontmatter),
		'---',
		'',
		`# ${id} — ${args.title}`,
		'',
		'## Goal',
		'',
		args.goal ?? 'TODO: describe the goal.',
		'',
		'## why',
		'',
		args.why ?? 'TODO: why this work matters now.',
		'',
		'## non-goals',
		'',
		...(args.nonGoals && args.nonGoals.length > 0
			? args.nonGoals.map((goal) => `- ${goal}`)
			: ['- TODO: what this proposal deliberately skips.']),
		'',
		'## Slices',
		'',
		`- global_gate: ${args.globalGate ?? 'none'}`,
		'',
		...(slices.length > 0
			? slices.map(renderSlice).join('\n\n').split('\n')
			: [
					'### S1 — TODO',
					'- **Status**: pending',
					'- **Files**: `TODO`',
					'- **Gate**: none',
				]),
		'',
		'## acceptance',
		'',
		...(acceptanceLines.length > 0
			? acceptanceLines
			: ['- TODO: observable acceptance criteria.']),
		'',
	].join('\n');
	const fileRel = `${proposalFolderFor(status, inferredKind, options.folderPolicy)}/${id}-${slugFromTitle(args.title, id)}.md`;
	const absPath = join(options.proposalsDirAbs, ...fileRel.split('/'));
	const { text: safeBody, redactions } = redactSecrets(body);
	await writeFileAtomic(absPath, safeBody);
	const sync = await syncProposalRegistry(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? [],
		undefined,
		options.folderPolicy,
	);
	const syncEntry = sync.proposals.find((proposal) => proposal.id === id);
	const finalFileRel = syncEntry ? syncEntry.file : fileRel;
	const finalAbsPath = syncEntry
		? join(options.proposalsDirAbs, ...finalFileRel.split('/'))
		: absPath;
	return {
		ok: true,
		file: finalFileRel,
		path: finalAbsPath,
		disjointnessIssues: issues,
		indexCount: sync.count,
		redactedSecrets: redactions,
	};
};

/**
 * x00098 S2: flip a slice block's status bullet to done, whichever of
 * the two accepted spellings the document uses (`- **Status**:` is the
 * canonical form the generator emits; `- status:` is the legacy one).
 * Appends the canonical bullet when the block has neither.
 */
const flipSliceStatusDone = (block: string): string => {
	if (/^[-*]\s*\*\*Status\*\*:/m.test(block)) {
		return block.replace(
			/^[-*]\s*\*\*Status\*\*:.*$/m,
			'- **Status**: done',
		);
	}
	if (/^[-*]\s*status:/m.test(block)) {
		return block.replace(/^[-*]\s*status:.*$/m, '- status: done');
	}
	return `${block.replace(/\s*$/, '')}\n- **Status**: done\n`;
};

/**
 * a00069 S5 — does this slice block require a green `bun run validate`
 * (or the host's `validationCommand`) before close_slice may flip it?
 *
 * Require when gate is `type` / `e2e`. Skip bare `none` / `lint` unless
 * the slice's acceptance section lists a full-suite command (`bun test`,
 * `bun run validate`, or the host `validationCommand`).
 */
export const sliceRequiresValidation = (
	block: string,
	validationCommand = 'bun run validate',
): boolean => {
	const gateMatch = block.match(
		/^[-*]\s*(?:\*\*Gate\*\*|gate):\s*([^\n]+)$/im,
	);
	const gate = (gateMatch?.[1] ?? 'none').trim().toLowerCase();
	if (gate === 'type' || gate === 'e2e') return true;
	// Free-form gates that explicitly demand full validate (proposal docs
	// often write `- **Gate**: bun run validate`).
	if (
		gate !== 'none' &&
		gate !== 'lint' &&
		(gate.includes('validate') ||
			gate.includes('bun run test') ||
			gate === 'test')
	) {
		return true;
	}

	// Acceptance surfaces (any of):
	//   - acceptance:
	//       - bun run validate
	//   - **Acceptance**: bun run test
	//   - { command: bun run validate, expect: exit0 }
	const needles = [
		validationCommand.toLowerCase(),
		'bun run validate',
		'bun run test',
		'bun test',
	];
	const blockLower = block.toLowerCase();
	// YAML-style criterion objects anywhere in the slice block.
	if (
		needles.some(
			(n) =>
				blockLower.includes(`command: ${n}`) ||
				blockLower.includes(`command:${n}`),
		)
	) {
		return true;
	}
	// Narrative **Acceptance** / acceptance bullets.
	const acceptLines = [
		...block.matchAll(
			/^[-*]\s*(?:\*\*Acceptance\*\*|acceptance):\s*([^\n]+)$/gim,
		),
	].map((m) => (m[1] ?? '').trim().toLowerCase());
	if (acceptLines.some((line) => needles.some((n) => line.includes(n)))) {
		return true;
	}
	// Nested acceptance list under a bare `acceptance:` header.
	const acceptSection = block.match(
		/^[-*]\s*acceptance:\s*\n((?:\s+[-*].*\n?)*)/im,
	);
	const acceptBody = acceptSection?.[1] ?? '';
	const nested = [
		...acceptBody.matchAll(/^\s+[-*]\s+"?([^"\n]+)"?\s*$/gm),
	].map((m) => (m[1] ?? '').trim().toLowerCase());
	return nested.some((line) => needles.some((n) => line.includes(n)));
};

/**
 * x00098 S2: the linter's status vocabulary is hyphenated and every
 * status lives in its own folder. Accept the historical underscore
 * spelling on input but never write it; `pending` (not a linter status)
 * authors as `ready`.
 */
const canonicalStatus = (
	status: string | undefined,
): 'ready' | 'in-progress' => {
	if (status === 'in_progress' || status === 'in-progress')
		return 'in-progress';
	return 'ready';
};

/**
 * `create_proposal` — author a proposal markdown (frontmatter + Goal +
 * a parseable `## Slices` section) so multi-agent slice work is correct
 * by construction. Validates file disjointness, writes atomically and
 * re-syncs the index. No more hand-editing fragile markdown.
 */
export const buildCreateProposalRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'create_proposal',
	effects: ['write'],
	summary:
		'Author a proposal (.md with frontmatter + disjoint ## Slices), validate overlap, write + sync index.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_create_proposal`,
			{
				outputSchema: CREATE_PROPOSAL_OUTPUT_SCHEMA,
				description:
					'Create a proposal document with frontmatter, a Goal and a parseable `## Slices` section (one slice per parallelisable, file-disjoint unit). Validates disjointness, writes atomically and re-syncs the index. Returns the file path and any overlap issues.',
				inputSchema: CREATE_PROPOSAL_INPUT_SCHEMA,
			},
			async (args: {
				id?: string | undefined;
				kind?: string | undefined;
				title: string;
				goal?: string | undefined;
				status?: string | undefined;
				track?: string | undefined;
				why?: string | undefined;
				nonGoals?: string[] | undefined;
				globalGate?: string | undefined;
				slices?: Array<z.infer<typeof SLICE_IN>> | undefined;
			}) => {
				const created = await createProposalDocument(
					{
						...args,
						globalGate: (args.globalGate ?? 'none') as
							| 'lint'
							| 'type'
							| 'e2e'
							| 'none',
					},
					options,
				);
				if (!created.ok) {
					return toolError(created.reason, created.nextAction);
				}
				return toolOk({
					file: created.file,
					path: created.path,
					disjointnessIssues: created.disjointnessIssues,
					indexCount: created.indexCount,
					redactedSecrets: created.redactedSecrets,
				});
			},
		);
	},
});

/**
 * f00091 S2: resolve the current branch and, if it is an `agent/*`
 * branch, return it (else `null`). Read-only (`git rev-parse`); never a
 * git mutation. Any failure degrades to `null` so `close_slice` never
 * throws over a branch-integration detail.
 */
const resolveAgentBranch = async (run: IGitRunner): Promise<string | null> => {
	const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return null;
	const branch = result.output.trim();
	if (branch.length === 0 || branch === 'HEAD') return null;
	return branch.startsWith(AGENT_BRANCH_PREFIX) ? branch : null;
};

/** f00091 S2: resolve the worktree top-level dir (read-only). */
const resolveWorktreeTopLevel = async (run: IGitRunner): Promise<string> => {
	const result = await run(['rev-parse', '--show-toplevel']);
	return result.ok ? result.output.trim() : '';
};

type ICloseSliceValidateOptions = IAuthoringToolOptions & {
	readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	readonly persist?: ICloseSlicePersistConfig;
	readonly persistGit?: IGitRunner;
};

interface IAgentLockReleaseResult {
	readonly removed?: number;
}

/**
 * Releases a slice's agent-lock claim on close/approve. `auto_work`'s
 * `claimReady.agent_lock_args` (see `auto-work.tool.ts`) tells callers to
 * claim with the composite `${proposalId}-${canonicalSliceId}` task_id
 * (canonical uppercase, e.g. "f00082-S1") — the form that stays
 * unambiguous when two different proposals both have a slice named e.g.
 * "S1". Try that convention first (both the canonical-case and the
 * caller's-own-case spelling, since `close_slice` itself accepts either),
 * then fall back to the bare sliceId for callers that claimed without
 * the proposal prefix.
 *
 * `runAgentLockEngine`'s release action reports `ok:true` even when NO
 * entry matched (it is a no-op release, not an error) — a caller that
 * only checks for a thrown error, without inspecting `removed`, will
 * wrongly believe the lock was released. Every existing call site here
 * used to do exactly that (hardcode `lockReleased = true`); this helper
 * inspects the actual result so the reported flag is honest.
 */
const releaseSliceLock = async (
	options: IAuthoringToolOptions,
	proposalId: string,
	sliceId: string,
): Promise<boolean> => {
	const deps = {
		lockPath: options.lockPathAbs,
		toolName: `${options.namespacePrefix}_agent_lock`,
	};
	const candidates = new Set([
		`${proposalId}-${canonicalSliceId(sliceId)}`,
		`${proposalId}-${sliceId}`,
		sliceId,
	]);
	for (const taskId of candidates) {
		const result = await runAgentLockEngine(
			{ action: 'release', task_id: taskId },
			deps,
		);
		const body = JSON.parse(
			result.content[0]?.text ?? '{}',
		) as IAgentLockReleaseResult;
		if ((body.removed ?? 0) > 0) return true;
	}
	return false;
};

const releaseSliceAssignment = async (
	options: IAuthoringToolOptions,
	proposalId: string,
	sliceId: string,
): Promise<boolean> => {
	if (options.agentNames === undefined) return false;
	const candidates = new Set([
		`${proposalId}-${canonicalSliceId(sliceId)}`,
		`${proposalId}-${sliceId}`,
		sliceId,
	]);
	for (const taskId of candidates) {
		const result = await runAgentNames(
			{ action: 'release', task_id: taskId },
			options.agentNames,
		);
		const body = JSON.parse(result.content[0]?.text ?? '{}') as {
			released?: readonly string[];
		};
		if (body.released?.includes(taskId) === true) return true;
	}
	return false;
};

/**
 * `close_slice` — mark a slice `done` in the proposal doc AND release its
 * agent lock, atomically. Closes the loop crisply so the next agent sees
 * accurate state.
 */
export const buildCloseSliceRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'close_slice',
	effects: ['write'],
	summary:
		'Mark a slice done in its proposal + release its agent lock, then re-sync.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_close_slice`,
			{
				outputSchema: z.object({
					ok: z.boolean(),
					blockerType: z.string().optional(),
					blockerDetail: z
						.object({
							ok: z.boolean(),
							severity: z.enum(['ok', 'error']),
							findings: z.array(z.string()),
							summary: z
								.object({
									ok: z.boolean(),
									scopes: z.number(),
								})
								.optional(),
						})
						.optional(),
					error: z
						.object({
							reason: z.string(),
							nextAction: z.string().optional(),
							kind: z.string().optional(),
							output: z.string().optional(),
						})
						.optional(),
					proposalId: z.string().optional(),
					sliceId: z.string().optional(),
					closed: z.boolean().optional(),
					validationDecision: z
						.object({
							mode: z.enum(['scoped', 'full', 'blocked']),
							resolvedScopes: z.array(z.string()),
							snapshotId: z.string(),
							reason: z.string(),
							// Present on `blocked`. Without them the caller
							// gets one abstract sentence and no way to act.
							blockingReasons: z.array(z.string()).optional(),
							nextAction: z.string().optional(),
						})
						.optional(),
					lockReleased: z.boolean().optional(),
					assignmentReleased: z.boolean().optional(),
					persist: z
						.object({
							committed: z.boolean(),
							pushed: z.boolean(),
							mode: z.enum(['none', 'commit', 'commit-and-push']),
							hash: z.string().optional(),
							reason: z.string().optional(),
						})
						.optional(),
					// f00091 S2: the branch (if any) recorded for deliberate
					// integration by the non-destructive branch-integration
					// step. `null` when agentWorktree is off, the active
					// branch is not an `agent/*` branch, or the branch could
					// not be resolved — in all those cases nothing is
					// recorded and behaviour is byte-identical to pre-f00091.
					pendingIntegrationBranch: z.string().nullable().optional(),
					// a00069 S5
					kind: z.string().optional(),
					validationOutput: z.string().optional(),
				}),
				description:
					'Mark a slice as done in its proposal document and release its agent lock atomically, then re-sync. Requires recent validate evidence within the last 24h unless force:true is passed. When requirePeerReview is on (the default), the slice must already have review-state: done from proposal_review action=approve by a different agent — implementers submit via proposal_review, they do not close their own slice. When per-agent worktrees are on and the slice was closed on an agent/* branch, records that branch for deliberate integration (non-destructive: runs no git write).',
				inputSchema: z.object({
					proposalId: z.string(),
					sliceId: z.string(),
					releaseLock: z.boolean().optional(),
					force: z.boolean().optional(),
					validateEvidence: VALIDATE_EVIDENCE_SCHEMA.optional(),
				}),
			},
			async (args: {
				proposalId: string;
				sliceId: string;
				releaseLock?: boolean | undefined;
				force?: boolean | undefined;
				validateEvidence?: IValidateEvidence | undefined;
			}) => {
				// Zod parses exitCode as number and logPath as string|undefined;
				// the internal contract is stricter (exitCode literal 0, logPath required).
				// The runtime gate in transition-evidence.ts rejects anything that
				// does not satisfy both, so the cast is sound here.
				if (args.validateEvidence !== undefined) {
					args = {
						...args,
						validateEvidence: {
							timestamp: args.validateEvidence.timestamp,
							exitCode: 0,
							logPath: args.validateEvidence.logPath ?? '',
						},
					};
				}
				// x00106 S1: index lookups self-heal a stale index once —
				// transitions move files and leave the index pointing at
				// the pre-move path until the next sync.
				const resolved = await resolveIndexedDoc(
					options,
					args.proposalId,
				);
				if (!resolved.ok) {
					return toolError(resolved.reason, resolved.nextAction);
				}
				const { entry, docPath } = resolved;
				const closeSliceOptions = options as ICloseSliceValidateOptions;
				let validationDecision:
					| ICloseSliceValidationDecision
					| undefined;
				if (
					args.force !== true &&
					options.requireValidateEvidence !== false
				) {
					const validateEvidence =
						await resolveRecentValidateEvidence({
							workspaceRoot: options.workspaceRoot,
							validateEvidence: args.validateEvidence,
							deps: closeSliceOptions.validateEvidenceDeps,
						});
					if (validateEvidence === null) {
						// Same loop, same cure as `proposal_transition`:
						// "run validate" is only useful to an agent that
						// has not. One that just watched it fail needs the
						// failing steps, or it repeats the run forever.
						const diagnosis = await diagnoseValidateEvidence({
							workspaceRoot: options.workspaceRoot,
							...(closeSliceOptions.validateEvidenceDeps !==
							undefined
								? {
										deps: closeSliceOptions.validateEvidenceDeps,
									}
								: {}),
						});
						const envelope = {
							ok: false as const,
							blockerType: 'validate-required' as const,
							validateState: diagnosis.state,
							failedSteps: diagnosis.failedSteps,
							...(diagnosis.lastRunAt !== undefined
								? { lastValidateAt: diagnosis.lastRunAt }
								: {}),
							error: {
								reason: diagnosis.reason,
								nextAction: diagnosis.nextAction,
							},
							proposalId: entry.id,
							sliceId: args.sliceId,
							closed: false,
						};
						return toolErrorEnvelope(envelope);
					}
				}
				let persisted: IPersistResult = {
					committed: false,
					pushed: false,
					mode: 'none',
				};
				try {
					await withFileMutex(docPath, async () => {
						const md = await readTextOrNull(docPath);
						if (md === null) {
							throw new Error(
								`proposal file missing: ${docPath}`,
							);
						}
						// Flip the slice block's status to done (add or replace).
						const blockRe = new RegExp(
							`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
							'm',
						);
						const m = md.match(blockRe);
						if (m === null) {
							throw new Error(
								`slice "${args.sliceId}" not found in ${entry.file}`,
							);
						}
						const rawBlock = m[2] ?? '';
						const slicePlan = parseProposalSlicePlan(entry.id, md);
						if (slicePlan === null) {
							throw new Error(
								`slice plan missing in ${entry.file}`,
							);
						}
						const slice = slicePlan.slices.find(
							(candidate) =>
								candidate.sliceId ===
								canonicalSliceId(args.sliceId),
						);
						if (slice === undefined) {
							throw new Error(
								`slice "${args.sliceId}" not found in ${entry.file}`,
							);
						}
						if (
							closeSliceOptions.resolveValidationDecision !==
							undefined
						) {
							const decision =
								await closeSliceOptions.resolveValidationDecision(
									{
										operation: 'close',
										ownedFiles: slice.files,
										proposalId: entry.id,
										sliceId: canonicalSliceId(args.sliceId),
									},
								);
							const guidance =
								decision.mode === 'blocked'
									? buildCloseBlockerGuidance({
											reason: decision.reason,
											blockingReasons:
												decision.blockingReasons ?? [],
										})
									: undefined;
							validationDecision = {
								mode: decision.mode,
								resolvedScopes: [...decision.resolvedScopes],
								snapshotId: decision.snapshotId,
								reason: decision.reason,
								...(guidance !== undefined
									? {
											blockingReasons:
												guidance.blockingReasons,
											nextAction: guidance.nextAction,
										}
									: {}),
							};
							if (decision.mode === 'blocked') {
								const err: ICloseSliceThrownError =
									Object.assign(new Error(decision.reason), {
										kind: 'validation-error' as const,
										validationDecision,
									});
								throw err;
							}
						}
						// a00072 S3.c — quality gate BEFORE flipping status.
						// If the probe is wired and reports severity=error,
						// refuse the close. Hosts that do not wire the quality
						// plugin skip this check entirely.
						if (typeof options.runQuality === 'function') {
							const quality = await options.runQuality(
								validationDecision !== undefined
									? {
											scopes: validationDecision.resolvedScopes,
											mode:
												validationDecision.mode ===
												'blocked'
													? 'full'
													: validationDecision.mode,
										}
									: undefined,
							);
							if (quality.severity === 'error') {
								const err: ICloseSliceThrownError =
									Object.assign(
										new Error(
											'quality gate reported severity=error',
										),
										{
											kind: 'quality-failed' as const,
											detail: quality,
										},
									);
								throw err;
							}
						}
						if (
							options.requirePeerReview !== false &&
							args.force !== true
						) {
							const review = parseReviewState(rawBlock);
							if (review.status !== 'done') {
								const err: ICloseSliceThrownError =
									Object.assign(
										new Error(
											'peer-review required before close_slice can mark the slice done',
										),
										{
											kind: 'peer-review-required' as const,
										},
									);
								throw err;
							}
						}
						const configuredPersist = closeSliceOptions.persist ?? {
							mode: 'none' as const,
						};
						const persistResult = await maybePersistAfterSlice(
							slice.files,
							entry.id,
							canonicalSliceId(args.sliceId),
							{
								...configuredPersist,
								...(options.agentWorktreeEnabled !== undefined
									? {
											agentWorktreeEnabled:
												options.agentWorktreeEnabled,
										}
									: {}),
								cwd: options.workspaceRoot,
								...(configuredPersist.allowForeignChanges ===
								true
									? { allowForeignChanges: true }
									: {}),
								...(closeSliceOptions.commitAuthor !== undefined
									? {
											commitAuthor:
												closeSliceOptions.commitAuthor,
										}
									: {}),
								...(closeSliceOptions.persistGit !== undefined
									? { git: closeSliceOptions.persistGit }
									: {}),
							},
						);
						const persistIncomplete =
							(configuredPersist.mode === 'commit' &&
								persistResult.committed !== true) ||
							(configuredPersist.mode === 'commit-and-push' &&
								(persistResult.committed !== true ||
									persistResult.pushed !== true));
						if (persistIncomplete) {
							const err: ICloseSliceThrownError = Object.assign(
								new Error(
									persistResult.reason ??
										'persistence is incomplete; the slice was not closed',
								),
								{
									kind: 'validation-error' as const,
									output: JSON.stringify(persistResult),
									persist: persistResult,
								},
							);
							throw err;
						}
						persisted = persistResult;
						const block = flipSliceStatusDone(rawBlock);
						const sliceClosedContent = md.replace(
							blockRe,
							`${m[1]}${block}`,
						);
						const prepared = markProposalDoneForAutoTransition(
							entry.id,
							sliceClosedContent,
							options.requirePeerReview === undefined
								? {}
								: {
										requirePeerReview:
											options.requirePeerReview,
									},
						);
						const nextContent = prepared.markdown;
						await writeFileAtomic(docPath, nextContent);
					});
				} catch (rawErr: unknown) {
					if (!isCloseSliceThrownError(rawErr)) throw rawErr;
					const err = rawErr;
					if (err.kind === 'validation-error') {
						// One `kind` covers two unrelated failures: the
						// quality probe reported errors (there IS failing
						// output to fix), and the swarm validation gate
						// refused outright (there is no output at all — the
						// activity snapshot is inconsistent, or the caller
						// is not an active actor). Answering both with
						// "fix the failing validate output" sent agents to
						// wait on a green validate that could never have
						// unblocked them, with the work finished and the
						// slice uncloseable. The blocked decision carries
						// its own next step; use it.
						const blocked =
							err.validationDecision?.mode === 'blocked'
								? err.validationDecision
								: undefined;
						const envelope = {
							ok: false as const,
							kind: 'validation-error',
							blockerType:
								blocked !== undefined
									? ('swarm-validation-blocked' as const)
									: ('quality-failed' as const),
							error: {
								reason: String(err.message),
								nextAction:
									blocked?.nextAction ??
									'Fix the failing validate output, then retry close_slice.',
								kind: 'validation-error',
								output: String(err.output ?? ''),
							},
							proposalId: entry.id,
							sliceId: args.sliceId,
							closed: false,
							validationOutput: String(err.output ?? ''),
							...(err.validationDecision !== undefined
								? { validationDecision: err.validationDecision }
								: {}),
							...(err.persist !== undefined
								? { persist: err.persist }
								: {}),
						};
						return toolErrorEnvelope(envelope);
					}
					if (err.kind === 'peer-review-required') {
						const envelope = {
							ok: false as const,
							kind: 'peer-review-required',
							blockerType: 'peer-review-required' as const,
							error: {
								reason: String(err.message),
								nextAction: `${options.namespacePrefix}_proposal_review { action: "submit", proposalId: "${entry.id}", sliceId: "${args.sliceId}", agent: "<implementer>" } then a DIFFERENT agent ${options.namespacePrefix}_proposal_review { action: "approve", proposalId: "${entry.id}", sliceId: "${args.sliceId}", agent: "<reviewer≠implementer>" }`,
								kind: 'peer-review-required',
							},
							proposalId: entry.id,
							sliceId: args.sliceId,
							closed: false,
						};
						return toolErrorEnvelope(envelope);
					}
					if (err.kind === 'quality-failed') {
						const envelope = {
							ok: false as const,
							kind: 'quality-failed',
							blockerType: 'quality-failed' as const,
							blockerDetail: err.detail,
							error: {
								reason: String(err.message),
								nextAction:
									'Fix the reported quality findings, then retry close_slice. The slice was NOT marked done.',
								kind: 'quality-failed',
								output: Array.isArray(err.detail?.findings)
									? err.detail.findings.join('\n')
									: '',
							},
							proposalId: entry.id,
							sliceId: args.sliceId,
							closed: false,
						};
						return toolErrorEnvelope(envelope);
					}
					return toolError(
						err instanceof Error
							? `${err.message}\n${err.stack ?? ''}`
							: String(err),
						'Call proposal_board to list slices.',
					);
				}

				// f00091 S2: non-destructive branch-integration step. When
				// per-agent worktrees are on and the slice was closed on an
				// `agent/*` branch, record that branch for deliberate
				// integration. This runs BEFORE releasing the lock so the
				// finished-branch fact is captured while the agent is still
				// the owner. It performs NO git write — it only *reads* the
				// current branch (via `git rev-parse`) and writes a registry
				// entry. When the gate is off it is a no-op (byte-identical).
				let pendingIntegrationBranch: string | null = null;
				if (
					options.agentWorktreeEnabled === true &&
					options.pendingIntegrationPathAbs !== undefined &&
					options.run !== undefined
				) {
					const branch = await resolveAgentBranch(options.run);
					if (branch !== null) {
						const worktreePath = await resolveWorktreeTopLevel(
							options.run,
						);
						await createPendingIntegrationStore(
							options.pendingIntegrationPathAbs,
						).record({
							branch,
							worktreePath,
							sliceId: args.sliceId,
							proposalId: entry.id,
							recordedAt: new Date().toISOString(),
						});
						pendingIntegrationBranch = branch;
					}
				}

				let lockReleased = false;
				let assignmentReleased = false;
				if (args.releaseLock !== false) {
					lockReleased = await releaseSliceLock(
						options,
						entry.id,
						args.sliceId,
					);
					assignmentReleased = await releaseSliceAssignment(
						options,
						entry.id,
						args.sliceId,
					);
				}
				await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					closed: true,
					lockReleased,
					assignmentReleased,
					persist: persisted,
					pendingIntegrationBranch,
					...(validationDecision !== undefined
						? { validationDecision }
						: {}),
				});
			},
		);
	},
});

/**
 * `proposal_review` — peer-review loop for a slice. An implementer
 * `submit`s a finished slice for review (it is NOT done yet); a DIFFERENT
 * agent `approve`s it (→ done + lock released) or `request_changes` with an
 * objection (→ reworkable, lock released). The fixer re-`submit`s and another
 * agent reviews the fix — the loop repeats until a reviewer has no objection.
 * `status` reads the current review state without changing it.
 */
export const buildReviewRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'proposal_review',
	effects: ['write'],
	summary:
		'Peer-review a slice: submit for review, approve, or request changes — until a reviewer has no objection.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_review`,
			{
				description:
					'Peer-review loop for a slice. action=submit: an implementer marks a finished slice ready for review (not done yet). action=approve: a DIFFERENT agent verifies and approves it → slice is set done + lock released, and must attach empirical evidence (commit hash, passing validate exit code, and passing test counts). action=request_changes (note required): a different agent records an objection → slice becomes reworkable + lock released; the fixer re-submits and another agent reviews the fix. action=status: read current state. Enforces reviewer ≠ implementer (independent verification).',
				inputSchema: REVIEW_INPUT_SCHEMA,
				outputSchema: REVIEW_OUTPUT_SCHEMA,
			},
			async (args: {
				proposalId: string;
				sliceId: string;
				action: 'submit' | 'approve' | 'request_changes' | 'status';
				agent: string;
				note?: string | undefined;
				evidence?: IProposalReviewEvidence | undefined;
			}) => {
				// x00106 S1: same one-shot self-heal as close_slice.
				const resolved = await resolveIndexedDoc(
					options,
					args.proposalId,
				);
				if (!resolved.ok) {
					return toolError(resolved.reason, resolved.nextAction);
				}
				const { entry, docPath } = resolved;
				const missingSliceNextAction = `Call ${options.namespacePrefix}_proposal_get { view: "slices", proposalId: "${entry.id}" } and retry with a declared sliceId. If this historical proposal is already done, do not submit a review: run ${options.namespacePrefix}_proposal_reconcile_folder { id: "${entry.id}", reason: "repair historical proposal state" }; if the done state still needs an audited repair, ask the host to approve ${options.namespacePrefix}_proposal_force_transition { id: "${entry.id}", to: "done", reason: "repair historical proposal state", skipPeerReview: true }.`;
				// x00055 S2: redact the reviewer note...
				const redactedNote = args.note
					? redactSecrets(args.note)
					: { text: '', redactions: 0 };

				if (args.action === 'status') {
					const md = await readTextOrNull(docPath);
					if (md === null)
						return toolError(`proposal file missing: ${docPath}`);
					const blockRe = new RegExp(
						`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
						'm',
					);
					const m = md.match(blockRe);
					if (m === null) {
						return toolError(
							`slice "${args.sliceId}" not found in ${entry.file}`,
							missingSliceNextAction,
						);
					}
					const body = m[2] ?? '';
					const state = parseReviewState(body);
					return toolOk({
						proposalId: entry.id,
						sliceId: args.sliceId,
						action: 'status',
						status: state.status,
						implementer: state.implementer,
						reviewer: state.reviewer,
						rounds: state.rounds,
						lockReleased: false,
						assignmentReleased: false,
						redactedSecrets: 0,
					});
				}

				let nextStatus!:
					| 'none'
					| 'in_review'
					| 'changes_requested'
					| 'done';
				let nextImplementer!: string | null;
				let nextReviewer!: string | null;
				let nextRounds!: readonly IReviewRound[];
				let autoTransitionRequested = false;
				const peerReviewLogPathAbs = join(
					options.workspaceRoot,
					PEER_REVIEW_LOG_RELATIVE_PATH,
				);

				try {
					await withFileMutex(docPath, async () => {
						const md = await readTextOrNull(docPath);
						if (md === null)
							throw new Error(
								`proposal file missing: ${docPath}`,
							);

						const blockRe = new RegExp(
							`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
							'm',
						);
						const m = md.match(blockRe);
						if (m === null) {
							throw new Error(
								`slice "${args.sliceId}" not found in ${entry.file}`,
							);
						}
						const body = m[2] ?? '';
						const state = parseReviewState(body);
						if (args.action === 'approve') {
							const sameAgentNameAsImplementer =
								state.implementer?.trim().toLowerCase() ===
								args.agent.trim().toLowerCase();
							const approver = buildReviewIdentity(
								args.agent,
								options.reviewIdentityDeps ?? {
									hostname: () =>
										require('node:os').hostname(),
									pid: () => process.pid,
									envHost: () => process.env.MCP_HOST,
								},
							);
							const identityCheck = await checkApproveIdentity({
								workspaceRoot: options.workspaceRoot,
								proposalId: entry.id,
								sliceId: args.sliceId,
								approver,
								...(options.reviewIdentityDeps !== undefined
									? { deps: options.reviewIdentityDeps }
									: {}),
							});
							if (!identityCheck.ok) {
								if (
									sameAgentNameAsImplementer &&
									identityCheck.reason === 'self-approve'
								) {
									throw Object.assign(
										new Error(
											'reviewer must be a different agent from the implementer',
										),
										{
											toolError: toolError(
												'reviewer must be a different agent from the implementer',
											),
										},
									);
								}
								throw Object.assign(
									new Error(identityCheck.reason),
									{
										toolError: toolError(
											identityCheck.reason,
											identityCheck.nextAction,
										),
									},
								);
							}
							const evidenceError = requireProposalReviewEvidence(
								args.evidence,
							);
							if (evidenceError !== null) {
								throw Object.assign(
									new Error('missing empirical evidence'),
									{
										toolError: evidenceError,
									},
								);
							}
						}

						// x00156 S5: `args.action === 'status'` already returned
						// above, but that narrowing does not cross the
						// `withFileMutex(docPath, async () => { ... })` closure
						// boundary this code runs inside — TS re-widens `args`
						// back to its full declared union inside any nested
						// function. Re-proving it here (rather than an `as
						// any` cast) keeps the check real: if this callback
						// is ever reached with `action: 'status'`, it throws
						// instead of silently mismatching `IReviewAction`.
						if (args.action === 'status') {
							throw new Error(
								'unreachable: action "status" already returned above',
							);
						}
						const result = reviewTransition(
							state,
							args.action,
							args.agent,
							redactedNote.text,
							args.action === 'approve'
								? { enforceDistinctAgentName: false }
								: undefined,
						);
						if (!result.ok || result.next === undefined) {
							// Two DIFFERENT rules both phrase their refusal
							// with "different agent": reviewer ≠ implementer,
							// and reviewer ≠ the previous round's reviewer
							// (the x00056 chain rule). Matching the shared
							// phrase collapsed them into the first message,
							// so an agent refused for reviewing two rounds in
							// a row was told it was the implementer — and the
							// fix that message names does not resolve the gate
							// that actually fired. Only the implementer rule
							// gets the implementer wording; anything else is
							// reported verbatim, because the reason a caller
							// is refused has to be the reason it was refused.
							if (
								result.reason
									?.toLowerCase()
									.includes('than the implementer')
							) {
								throw Object.assign(new Error(result.reason), {
									toolError: toolError(
										'reviewer must be a different agent from the implementer',
									),
								});
							}
							throw Object.assign(
								new Error(
									result.reason ??
										'invalid review transition',
								),
								{
									toolError: toolError(
										result.reason ??
											'invalid review transition',
										'Call proposal_board to list slices.',
									),
								},
							);
						}
						const next = result.next;
						nextStatus = next.status;
						nextImplementer = next.implementer;
						nextReviewer = next.reviewer;
						nextRounds = next.rounds;

						// Rewrite the slice block: replace the review lines, and on approval
						// also flip `- status: done`.
						let block = body.replace(
							/^[-*]\s*review-(?:state|implementer|reviewer|log):.*$\n?/gm,
							'',
						);
						block = `${block.replace(/\s*$/, '')}\n${renderReviewLines(next).join('\n')}\n`;
						if (next.status === 'done') {
							block = flipSliceStatusDone(block);
						}
						let updated = md.replace(blockRe, `${m[1]}${block}`);
						if (args.action === 'approve') {
							const prepared = markProposalDoneForAutoTransition(
								entry.id,
								updated,
							);
							autoTransitionRequested = prepared.changed;
							updated = prepared.markdown;
						}
						await writeFileAtomic(docPath, updated);
						if (args.action === 'submit') {
							await recordReviewSubmitIdentity({
								workspaceRoot: options.workspaceRoot,
								proposalId: entry.id,
								sliceId: args.sliceId,
								agent: args.agent,
								...(options.reviewIdentityDeps !== undefined
									? { deps: options.reviewIdentityDeps }
									: {}),
							});
						}
						if (
							args.action === 'approve' ||
							args.action === 'request_changes'
						) {
							await appendPeerReviewLog(peerReviewLogPathAbs, {
								ts: new Date().toISOString(),
								proposal_id: entry.id,
								slice_id: args.sliceId,
								agent: args.agent,
								verdict:
									args.action === 'approve'
										? 'approved'
										: 'request_changes',
								...(redactedNote.text !== ''
									? { note: redactedNote.text }
									: {}),
							});
						}
					});
				} catch (rawErr: unknown) {
					if (!isToolErrorCarryingError(rawErr)) throw rawErr;
					if (rawErr.toolError !== undefined) return rawErr.toolError;
					const nextAction =
						rawErr.message.includes('slice "') &&
						rawErr.message.includes('not found')
							? missingSliceNextAction
							: 'Call proposal_board to list slices.';
					return toolError(rawErr.message, nextAction);
				}

				// approve/request_changes free the slice (done, or reworkable).
				let lockReleased = false;
				let assignmentReleased = false;
				if (
					nextStatus === 'done' ||
					nextStatus === 'changes_requested'
				) {
					lockReleased = await releaseSliceLock(
						options,
						entry.id,
						args.sliceId,
					);
					assignmentReleased = await releaseSliceAssignment(
						options,
						entry.id,
						args.sliceId,
					);
				}
				await syncProposalRegistry(
					options.workspaceRoot,
					options.layout,
					options.extraFolders ?? [],
				);
				if (autoTransitionRequested) {
					const located = await locateProposal(entry.id, {
						indexPathAbs: options.indexPathAbs,
						proposalsDirAbs: options.proposalsDirAbs,
					});
					if (located === null || located.status !== 'done') {
						await recordAutoTransitionRepair({
							workspaceRoot: options.workspaceRoot,
							proposalId: entry.id,
							path: entry.file,
							reason: 'auto-transition did not leave the proposal in done after approve',
						});
					}
				}
				if (options.peerReviewLogPathAbs !== undefined) {
					await recordProposalReviewAction({
						logPathAbs: options.peerReviewLogPathAbs,
						proposalId: entry.id,
						sliceId: args.sliceId,
						action: args.action,
						implementer: nextImplementer,
						reviewer: nextReviewer,
						...(args.action === 'approve'
							? { verdict: 'approved' as const }
							: args.action === 'request_changes'
								? { verdict: 'requested_changes' as const }
								: {}),
					}).catch(() => undefined);
				}
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					action: args.action,
					status: nextStatus,
					implementer: nextImplementer,
					reviewer: nextReviewer,
					rounds: nextRounds,
					lockReleased,
					assignmentReleased,
					redactedSecrets: redactedNote.redactions,
				});
			},
		);
	},
});

/**
 * `proposal_board` — orchestrator overview: each actionable proposal with
 * its slices (status + owner) and which are claimable now. One low-token
 * call to plan multi-agent work.
 */
export const buildProposalBoardRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'proposal_board',
	summary:
		'Orchestrator view: actionable proposals × slices (status/owner) + claimable now.',
	tags: ['proposals', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_board`,
			{
				outputSchema: z.object({
					proposals: z.array(
						z.object({
							id: z.string(),
							status: z.string(),
							slices: z.array(
								z.object({
									sliceId: z.string(),
									status: z.string(),
									owner: z.string().nullable(),
								}),
							),
							claimableSliceIds: z.array(z.string()).optional(),
							/**
							 * Why the board could not read this proposal.
							 *
							 * Absent on the happy path. Without it, an index
							 * entry pointing at a moved or deleted file was
							 * indistinguishable from a proposal that genuinely
							 * has no slices: both came back as `slices: []`,
							 * and an orchestrator would report "actionable,
							 * nothing to claim" and stall.
							 */
							unreadable: z.string().optional(),
						}),
					),
				}),
				description:
					'Returns each actionable proposal with its slices (status, owner) and the slices claimable right now. Read-only; the orchestrator board for planning multi-agent work. A proposal whose document cannot be read reports `unreadable` instead of an empty slice list.',
			},
			async () => {
				const index = await readJsonOrNull<{
					proposals: Array<{
						id: string;
						file: string;
						status: string;
					}>;
				}>(options.indexPathAbs);
				if (index === null) {
					return toolJson({ proposals: [] });
				}
				const locks = await readActiveLocks(options.lockPathAbs);
				// x00098 S2: real documents carry the hyphenated status; keep
				// the underscore spellings for indexes written before the
				// vocabulary converged.
				const actionable = index.proposals.filter((p) =>
					['pending', 'ready', 'in_progress', 'in-progress'].includes(
						p.status,
					),
				);
				const board = await Promise.all(
					actionable.map(async (p) => {
						const docPath = join(
							options.proposalsDirAbs ??
								dirname(options.indexPathAbs),
							p.file,
						);
						const md = await readTextOrNull(docPath);
						if (md === null) {
							// El índice apunta a un fichero que ya no está.
							// Pasa en cuanto alguien mueve una propuesta a
							// mano —archivarla en `done/`, por ejemplo— sin
							// pasar por `sync_proposals`, y en un repo donde
							// el humano también toca los ficheros eso es lo
							// normal, no la excepción.
							//
							// Antes devolvía `slices: []`, que es exactamente
							// lo que devuelve una propuesta sin slices. Un
							// orquestador veía "accionable, nada que
							// reclamar" y se quedaba parado sin ninguna pista.
							return {
								id: p.id,
								status: p.status,
								slices: [],
								unreadable: `index points at ${p.file}, which does not exist — run sync_proposals`,
							};
						}
						const parsed = parseProposalSlicePlan(p.id, md);
						if (parsed === null) {
							return {
								id: p.id,
								status: p.status,
								slices: [],
								unreadable:
									'the document has no parseable `## Slices` section',
							};
						}
						const plan = deriveSliceStatuses(parsed, locks);
						return {
							id: p.id,
							status: p.status,
							slices: plan.slices.map((s) => ({
								sliceId: s.sliceId,
								status: s.status,
								owner: s.owner,
							})),
							claimableSliceIds: plan.slices
								.filter(
									(s) => validateClaim(plan, s.sliceId).ok,
								)
								.map((s) => s.sliceId),
						};
					}),
				);
				return toolJson({ proposals: board });
			},
		);
	},
});
