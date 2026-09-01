/**
 * proposal-transition.tool.ts
 *
 * `<prefix>_proposal_transition`: move a proposal to a new status,
 * validated against the DFA (f00016 §4.2) and with the folder
 * (f00016 §4.1) and frontmatter `status` kept in sync via one atomic
 * operation (`withFileMutex` + `writeFileAtomic` + `git mv`).
 *
 * Post-SOLID-refactor:
 *   - The tool file is now pure orchestration. All disk I/O and
 *     parsing go through injected helpers:
 *       • `locateProposal` → shared helper in `proposals/locate.ts`
 *         (DRY; the previous inline copy is gone).
 *       • `setFrontmatterStatus` → `proposals/proposal-frontmatter-writer.ts`
 *         (pure byte-level mutation, unit-testable in isolation).
 *       • `isPlanProposal` → `proposals/proposal-type-detector.ts`
 *         (single source of truth for "is this a plan?").
 *       • `runPlanClosureGuard` → `swarm/plan-closure-guard.ts`
 *         (the q00001 closure composition; the inline 12-line block
 *         is gone).
 *   - The tool no longer reaches into low-level modules. It composes
 *     abstractions (DIP) and only knows about the DFA, the
 *     frontmatter-writer, and the guard.
 *
 * Legacy handling:
 *   Only operates on proposals whose CURRENT frontmatter status is
 *   already one of the new 7 (`IProposalStatus`). The 14 legacy files
 *   still use the old 8-status union and are untouched until
 *   S11/S12 migrate them. A legacy file's status simply won't be
 *   found in `PROPOSAL_STATUS_TRANSITIONS`, so the tool refuses
 *   cleanly without needing a feature flag.
 */

import { randomUUID } from 'node:crypto';
import { access, mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	SafeWorkspaceReader,
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
} from '../contracts/constants/proposal-glossary.constant';
import {
	proposalFolderFor,
	type IProposalFolderPolicy,
} from '../contracts/proposal-folder-policy';
import type {
	IProposalKind,
	IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { locateProposal } from '../proposals/locate';
import type { ILocatedProposal } from '../proposals/locate';
import {
	readFrontmatterField,
	setFrontmatterStatus,
	setFrontmatterField,
} from '../proposals/proposal-frontmatter-writer';
import { isPlanProposal } from '../proposals/proposal-type-detector';
import {
	findDependentProposalStatuses,
	syncProposalRegistry,
} from '../proposals/sync-proposal-registry';
import { runPlanClosureGuard } from '../swarm/plan-closure-guard';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import { rewriteStaleProposalSelfPaths } from '../proposals/rewrite-stale-self-paths';
import { recordPeerReviewBypass } from '../shared/peer-review-bypass-log';
import { recordPlanClosureBypass } from '../shared/plan-closure-bypass-log';
import {
	hasIndependentApprovalSinceLastReview,
	logHasAnyReviewVerdictFor,
	recordProposalEnteredReview,
} from '../shared/peer-review-log';
import {
	buildForcedRegressionCaller,
	guardDoneToReviewRegression,
	guardShippedInPresent,
	logForcedRegression,
} from '../services/proposal-state';
import {
	checkTransitionEvidence,
	type IValidateEvidence,
} from '../services/transition-evidence';
import { guardTransitionToDone } from '../services/proposal-completeness';
import { runProposalTransitionCompat } from './proposal-transition.compat';
import { VALIDATE_LOG_RELATIVE_PATH } from '../contracts/constants/proposal-paths.constant';
import {
	PROPOSAL_TRANSITION_INPUT_SCHEMA,
	type IProposalTransitionArgs,
} from '../contracts/proposal-transition-input.contract';

export type { IProposalTransitionArgs } from '../contracts/proposal-transition-input.contract';

const VALIDATE_EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

type IProposalTransitionSourceStatus = IProposalStatus | 'pending';

export interface IPeerReviewLogEntry {
	readonly ts: string;
	readonly proposal_id: string;
	readonly slice_id?: string;
	readonly agent?: string;
	readonly verdict?: string;
	readonly note?: string;
}

export interface IPeerReviewGateDeps {
	readonly readPeerReviewLog: (
		logPathAbs: string,
	) => Promise<readonly IPeerReviewLogEntry[]>;
}

interface IValidateLogEntry {
	readonly timestamp?: string;
	readonly ts?: string;
	readonly result?: string;
	readonly exitCode?: number;
	readonly logPath?: string;
	readonly [key: string]: unknown;
}

export interface IValidateEvidenceDeps {
	readonly readValidateLog: (
		logPathAbs: string,
	) => Promise<readonly IValidateLogEntry[]>;
}

const readValidateLogEntries = async (
	logPathAbs: string,
): Promise<readonly IValidateLogEntry[]> => {
	const raw = await new SafeWorkspaceReader(dirname(logPathAbs))
		.readText(basename(logPathAbs))
		.then((value) => value.content)
		.catch((error: unknown) => {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return '';
			}
			throw error;
		});
	if (raw.trim() === '') return [];
	const entries: IValidateLogEntry[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === 'object') {
				entries.push(parsed as IValidateLogEntry);
			}
		} catch (error: unknown) {
			if (error instanceof SyntaxError) continue;
			throw error;
		}
	}
	return entries;
};

export interface IProposalTransitionToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path to `docs/mcp-vertex/proposals/` (the 7 status folders live here). */
	readonly proposalsDirAbs: string;
	readonly workspaceRoot: string;
	/**
	 * f00016 + q00001: absolute path to `<cacheDir>/proposals/index.json`
	 * (the regenerable registry index — see x00052 for the move from
	 * `docs/mcp-vertex/proposals/index.json`). Used by the q00001
	 * plan-closure guard to look up child proposal statuses when the
	 * caller transitions a `type: plan` proposal to `done`. Optional —
	 * when absent, the plan-closure guard is skipped (legacy hosts
	 * that have not yet adopted the index file keep working).
	 */
	readonly indexPathAbs?: string;
	/** Injectable for tests; defaults to a real `git mv` in `workspaceRoot`. */
	readonly gitRunner?: IGitRunner;
	/** Absolute path to the append-only peer-review journal. */
	readonly peerReviewLogPathAbs?: string;
	/**
	 * a00069 S7: when true (default), `review → done` requires at least
	 * one peer `proposal_review { action: "approve" }` recorded in the
	 * doc (reviewer ≠ implementer). Hosts opt out via
	 * `proposals.options.requirePeerReview: false`.
	 */
	readonly requirePeerReview?: boolean;
	/**
	 * When true (default), `→ review` and `→ done` require a passing
	 * `bun run validate` from the last 24h, journalled to
	 * `.cache/mcp-vertex/results/logs/validate.jsonl`.
	 *
	 * Not every adopter has a validate chain worth blocking on — a docs
	 * repo, a spike, a project whose CI is the real gate. Those hosts set
	 * `proposals.options.requireValidateEvidence: false` rather than
	 * teaching every agent to pass `force: true`, which would disable the
	 * peer-review and slice-completeness gates along with it.
	 */
	readonly requireValidateEvidence?: boolean;
	/** Folder layout policy per proposal status. */
	readonly folderPolicy?: IProposalFolderPolicy;
	readonly peerReviewGateDeps?: IPeerReviewGateDeps;
	readonly validateEvidenceDeps?: IValidateEvidenceDeps;
}

/**
 * Legacy helper kept for compatibility with existing recovery/tests.
 * The new gate reads peer-review.jsonl first, but markdown approvals still
 * matter for older diagnostics and for transitional specs.
 */
export const hasIndependentPeerApproval = (markdown: string): boolean => {
	const implementers = [
		...markdown.matchAll(/^[-*]\s*review-implementer:\s*(\S+)/gim),
	].map((m) => (m[1] ?? '').toLowerCase());
	const approves = [
		...markdown.matchAll(/^[-*]\s*review-log:\s*approved\s+by\s+(\S+)/gim),
	].map((m) => (m[1] ?? '').toLowerCase());
	if (approves.length === 0) return false;
	if (implementers.length === 0) return true;
	return approves.some((agent) => !implementers.includes(agent));
};

const isKnownStatus = (value: string): value is IProposalStatus =>
	value in PROPOSAL_STATUSES;

const KNOWN_KINDS: ReadonlySet<string> = new Set([
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
	'plan',
]);

const isKnownKind = (value: string): value is IProposalKind =>
	KNOWN_KINDS.has(value);

const isPendingAliasEligible = (input: {
	readonly proposalId: string;
	readonly absPath: string;
}): boolean => {
	const filename = input.absPath.split('/').pop() ?? '';
	const prefix = (filename[0] ?? input.proposalId[0] ?? '').toLowerCase();
	return prefix !== 'p' && prefix in PROPOSAL_KIND_BY_PREFIX;
};

/**
 * Resolve the folder a transition should land in.
 *
 * For terminal `done`, the convention (f00042 + f00016 §4.1) is
 * `done/<kind-subfolder>/` — `done/feats/`, `done/fixes/`, … — so the
 * closure view scales. For every other status the folder is the plain
 * status folder. The kind is read from the file's frontmatter on disk
 * (not from the index snapshot) because the index entry may predate a
 * kind field added later, and the on-disk source of truth is the file
 * itself. A missing or unknown kind falls back to `done/` itself — same
 * safe behaviour the engine had before f00042 landed.
 *
 * Pure I/O: reads the file once, no other side effects.
 */
const resolveTargetFolder = async (
	to: IProposalStatus,
	found: ILocatedProposal,
	proposalsDirAbs: string,
	folderPolicy?: IProposalFolderPolicy,
): Promise<string> => {
	const raw = await new SafeWorkspaceReader(proposalsDirAbs)
		.readText(relative(proposalsDirAbs, found.absPath))
		.then((value) => value.content)
		.catch(() => '');
	const kindRaw =
		readFrontmatterField(raw, 'kind') ?? readFrontmatterField(raw, 'type');
	const kind =
		kindRaw !== undefined && isKnownKind(kindRaw) ? kindRaw : undefined;
	const folder = proposalFolderFor(to, kind, folderPolicy);
	void proposalsDirAbs;
	return folder;
};

const TOOL_ERROR_SCHEMA = z.object({
	reason: z.string(),
	nextAction: z.string().optional(),
	code: z.string().optional(),
	blockerType: z.string().optional(),
	/** a00069 S3 — legal DFA targets from the current status. */
	nextHops: z.array(z.string()).optional(),
});

export const PROPOSAL_TRANSITION_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: TOOL_ERROR_SCHEMA.optional(),
	id: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	reason: z.string().optional(),
	transitionId: z.string().optional(),
	correlationId: z.string().optional(),
	idempotencyKey: z.string().optional(),
	idempotentReplay: z.boolean().optional(),
	movedFrom: z.string().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
	/** True when the registry index was regenerated after the move. */
	indexSynced: z.boolean().optional(),
	/** Count of self-referential `**Files**` paths rewritten to the new location. */
	filesRewritten: z.number().optional(),
});

const isFreshValidateEvidence = (
	evidence: IValidateEvidence,
	nowMs = Date.now(),
): boolean => {
	if (evidence.exitCode !== 0) return false;
	const tsMs = Date.parse(evidence.timestamp);
	if (Number.isNaN(tsMs)) return false;
	return tsMs >= nowMs - VALIDATE_EVIDENCE_WINDOW_MS;
};

const LAST_TRANSITION_ID_FIELD = 'last-transition-id';
const LAST_CORRELATION_ID_FIELD = 'last-correlation-id';
const LAST_IDEMPOTENCY_KEY_FIELD = 'last-idempotency-key';
const LAST_TRANSITION_FROM_FIELD = 'last-transition-from';

interface IStoredTransitionMetadata {
	readonly transitionId: string | undefined;
	readonly correlationId: string | undefined;
	readonly idempotencyKey: string | undefined;
	readonly from: string | undefined;
}

interface IResolvedTransitionMetadata {
	readonly transitionId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string | undefined;
}

const normalizeOptionalString = (
	value: string | undefined,
): string | undefined => {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const resolveTransitionMetadata = (
	args: IProposalTransitionArgs,
): IResolvedTransitionMetadata => {
	const transitionId =
		normalizeOptionalString(args.transitionId) ?? randomUUID();
	const correlationId =
		normalizeOptionalString(args.correlationId) ?? transitionId;
	return {
		transitionId,
		correlationId,
		idempotencyKey: normalizeOptionalString(args.idempotencyKey),
	};
};

const readStoredTransitionMetadata = (
	raw: string,
): IStoredTransitionMetadata => ({
	transitionId: readFrontmatterField(raw, LAST_TRANSITION_ID_FIELD),
	correlationId: readFrontmatterField(raw, LAST_CORRELATION_ID_FIELD),
	idempotencyKey: readFrontmatterField(raw, LAST_IDEMPOTENCY_KEY_FIELD),
	from: readFrontmatterField(raw, LAST_TRANSITION_FROM_FIELD),
});

const buildIdempotentReplayResult = (input: {
	readonly proposalId: string;
	readonly currentStatus: string;
	readonly reason: string;
	readonly relativePath: string;
	readonly metadata: IStoredTransitionMetadata;
}) => {
	const envelope = {
		ok: true as const,
		id: input.proposalId,
		from: input.metadata.from ?? input.currentStatus,
		to: input.currentStatus,
		reason: input.reason,
		transitionId: input.metadata.transitionId,
		correlationId:
			input.metadata.correlationId ?? input.metadata.transitionId,
		idempotencyKey: input.metadata.idempotencyKey,
		idempotentReplay: true,
		movedTo: input.relativePath,
		warning:
			'idempotent replay detected; the transition was already applied and no new mutation ran.',
	};
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
		structuredContent: envelope,
	};
};

const setFrontmatterMetadataField = (
	raw: string,
	fieldName: string,
	newValue: string,
): string => {
	const existing = readFrontmatterField(raw, fieldName);
	if (existing !== undefined) {
		return setFrontmatterField(raw, fieldName, newValue);
	}
	return raw.replace(
		/^(---\r?\n[\s\S]*?)(\r?\n---)/,
		`$1\n${fieldName}: ${newValue}$2`,
	);
};

const toValidateEvidence = (
	entry: IValidateLogEntry,
	logPathAbs: string,
): IValidateEvidence | null => {
	if (entry.result !== 'pass') return null;
	const timestamp =
		typeof entry.timestamp === 'string'
			? entry.timestamp
			: typeof entry.ts === 'string'
				? entry.ts
				: null;
	if (timestamp === null) return null;
	const exitCode = typeof entry.exitCode === 'number' ? entry.exitCode : 0;
	return {
		timestamp,
		exitCode,
		...(typeof entry.logPath === 'string'
			? { logPath: entry.logPath }
			: { logPath: logPathAbs }),
	};
};

export const resolveRecentValidateEvidence = async (input: {
	readonly workspaceRoot: string;
	readonly validateEvidence?: IValidateEvidence | undefined;
	readonly deps?: IValidateEvidenceDeps | undefined;
}): Promise<IValidateEvidence | null> => {
	if (input.validateEvidence !== undefined) {
		return isFreshValidateEvidence(input.validateEvidence)
			? input.validateEvidence
			: null;
	}
	const logPathAbs = join(input.workspaceRoot, VALIDATE_LOG_RELATIVE_PATH);
	const deps = input.deps ?? { readValidateLog: readValidateLogEntries };
	const entries = await deps.readValidateLog(logPathAbs);
	let latest: IValidateEvidence | null = null;
	let latestMs = Number.NEGATIVE_INFINITY;
	for (const entry of entries) {
		const evidence = toValidateEvidence(entry, logPathAbs);
		if (evidence === null || !isFreshValidateEvidence(evidence)) continue;
		const tsMs = Date.parse(evidence.timestamp);
		if (Number.isNaN(tsMs) || tsMs <= latestMs) continue;
		latest = evidence;
		latestMs = tsMs;
	}
	return latest;
};

const buildValidateRequiredEnvelope = () => ({
	ok: false as const,
	error: 'validate required' as const,
	nextAction: 'bun run validate' as const,
});

const buildCodeError = (
	code: string,
	reason: string,
	nextAction?: string,
	fix?: string,
) => {
	const envelope: {
		ok: false;
		error: {
			code: string;
			reason: string;
			nextAction?: string;
			fix?: string;
		};
	} = {
		ok: false as const,
		error: {
			code,
			reason,
		},
	};
	if (nextAction !== undefined) envelope.error.nextAction = nextAction;
	if (fix !== undefined) envelope.error.fix = fix;
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(envelope),
			},
		],
		structuredContent: envelope,
		isError: true,
	};
};

const appendWarning = (current: string | undefined, next: string): string =>
	current === undefined ? next : `${current}; ${next}`;

const isTrackedFile = async (
	gitRunner: IGitRunner,
	filePath: string,
): Promise<boolean> =>
	(await gitRunner(['ls-files', '--error-unmatch', filePath])).ok;

const isCiEnvironment = (): boolean =>
	process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

const readProposalCiEvidenceCommit = (raw: string): string | null => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return null;
	const match = yamlBlock.match(/^\s+commit:\s*"?([^"\n]+)"?\s*$/mu);
	return match?.[1]?.trim() || null;
};

const hasProposalCiEvidence = (raw: string): boolean => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return false;
	if (readProposalCiEvidenceCommit(raw) === null) return false;
	return /^evidence:\s*$[\s\S]*?^\s+ci-runs:\s*$[\s\S]*?^\s+-\s+name:\s*.+$[\s\S]*?^\s+status:\s*.+$/mu.test(
		yamlBlock,
	);
};

const hasExactCiCommitEvidence = (raw: string): boolean => {
	const currentSha = process.env.GITHUB_SHA?.trim();
	if (currentSha === undefined || currentSha === '') return false;
	return readProposalCiEvidenceCommit(raw) === currentSha;
};

export const runProposalTransition = async (
	args: IProposalTransitionArgs,
	options: IProposalTransitionToolOptions,
) => {
	const rejection = validateTransitionArgs(args);
	if (rejection !== null) return rejection;
	// After `validateTransitionArgs` succeeded, `args.to` is one of
	// the 7 known statuses. The `as IProposalStatus` cast is the
	// explicit narrow — TypeScript cannot infer the type narrowing
	// across the early-return boundary, so we re-state it.
	const to: IProposalStatus = isKnownStatus(args.to)
		? args.to
		: (args.to as IProposalStatus);

	const found = await locateProposal(args.id, {
		indexPathAbs: options.indexPathAbs ?? '',
		proposalsDirAbs: options.proposalsDirAbs,
	});
	if (found === null) {
		return toolError(
			`no proposal with id "${args.id}" found under ${options.proposalsDirAbs}`,
			'Check the id, or run sync_proposals first.',
		);
	}

	const from = validateCurrentStatus(args.id, found);
	if (typeof from !== 'string') return from;
	const raw = await new SafeWorkspaceReader(options.proposalsDirAbs)
		.readText(relative(options.proposalsDirAbs, found.absPath))
		.then((value) => value.content)
		.catch(() => '');
	const transitionMetadata = resolveTransitionMetadata(args);
	const storedTransitionMetadata = readStoredTransitionMetadata(raw);

	let finalTo = to;
	let depId: string | undefined;

	if (to === 'paused') {
		const pausedReason = readFrontmatterField(raw, 'paused-reason');
		if (!pausedReason || pausedReason.trim() === '') {
			const PROPOSAL_ID_PATTERN = /[a-z]\d{5}/;
			const match = PROPOSAL_ID_PATTERN.exec(args.reason);
			const hasDepInReason = match !== null;
			if (match) depId = match[0];

			const blockedByRaw = readFrontmatterField(raw, 'blocked-by');
			const hasDepInFrontmatter =
				blockedByRaw &&
				blockedByRaw.trim() !== '' &&
				blockedByRaw.trim() !== '[]';

			if (hasDepInReason || hasDepInFrontmatter) {
				finalTo = 'blocked';
				if (!depId && blockedByRaw) {
					const fmMatch = PROPOSAL_ID_PATTERN.exec(blockedByRaw);
					if (fmMatch) depId = fmMatch[0];
				}
			} else {
				return toolError(
					'paused requires a paused-reason field or a blocked-by dependency',
					'Add `paused-reason: <text>` to the frontmatter and retry, OR transition to `blocked` with `blocked-by: [X]`',
				);
			}
		}
	}

	if (
		transitionMetadata.idempotencyKey !== undefined &&
		storedTransitionMetadata.idempotencyKey ===
			transitionMetadata.idempotencyKey
	) {
		if (found.status === finalTo) {
			return buildIdempotentReplayResult({
				proposalId: args.id,
				currentStatus: found.status,
				reason: args.reason,
				relativePath: relative(options.proposalsDirAbs, found.absPath),
				metadata: storedTransitionMetadata,
			});
		}
		return buildCodeError(
			'idempotency-key-conflict',
			`idempotencyKey "${transitionMetadata.idempotencyKey}" was already applied to ${args.id} and cannot be reused for a different target status`,
		);
	}

	const regressionGuard = guardDoneToReviewRegression({
		from,
		to: finalTo,
		force: args.force,
		reason: args.reason,
	});
	if (!regressionGuard.ok) {
		return buildCodeError(regressionGuard.code, regressionGuard.reason);
	}
	if (
		args.reason.trim() === '' &&
		!(from === 'done' && finalTo === 'review' && args.force === true)
	) {
		return toolError(
			'reason is required',
			'Call proposal_transition with a non-empty reason (audit trail).',
		);
	}

	const isZeroWorkShortcut =
		(from === 'ready' || from === 'pending') && finalTo === 'done';
	const skipsDfa =
		(from === 'done' && finalTo === 'review' && args.force === true) ||
		isZeroWorkShortcut ||
		args.skipDfaForPlanClosure === true;
	// a00072 S4 (plan-closure shortcut): every skip is audited with the
	// proposal id, caller reason, and `via: 'plan-closure-shortcut'`
	// marker — same shape as `recordPeerReviewBypass`. Only the
	// `proposals_close_plan` wrapper sets this flag (after a successful
	// closure preflight); the compat layer strips it from MCP callers,
	// so only audited wrapper invocations ever reach this branch.
	if (args.skipDfaForPlanClosure === true) {
		recordPlanClosureBypass({
			proposalId: args.id,
			reason: args.reason,
			...(args.agent !== undefined ? { agent: args.agent } : {}),
		});
	}
	if (!skipsDfa) {
		const dfaRejection = validateTransition(
			args.id,
			from === 'pending' ? 'ready' : from,
			finalTo,
		);
		if (dfaRejection !== null) return dfaRejection;
	}

	if (isZeroWorkShortcut) {
		const evidenceCheck = await checkTransitionEvidence(
			args.validateEvidence,
		);
		if (!evidenceCheck.ok) {
			return buildCodeError(evidenceCheck.code, evidenceCheck.reason);
		}
	}
	// a00074 S5 / a00084 F17: every slice must be `Status: done` and every
	// `Files:` declared in done slices must resolve on disk. Originally
	// gated to the ready/pending→done shortcut only, on the theory that
	// `review → done` already has the peer-review gate as its strong
	// signal — but peer review only ever sees the proposal's MARKDOWN
	// TEXT, never the filesystem; an approving reviewer has no way to
	// notice that a `Files:` entry doesn't exist or a slice is still
	// `rework`. Now runs on every transition that lands on `done`,
	// regardless of which prior state it came from. `force: true` still
	// bypasses it — same precedent as the validate-evidence check below —
	// an explicit, audited (required `reason`) override, not a new gap.
	if (finalTo === 'done' && args.force !== true) {
		const completenessGuard = await guardTransitionToDone({
			proposalPath: found.absPath,
			markdown: raw,
			workspaceRoot: options.workspaceRoot,
		});
		if (!completenessGuard.ok) {
			return buildCodeError(
				completenessGuard.code,
				`slice-completeness gate: ${completenessGuard.code}; ` +
					`pendingSlices=[${completenessGuard.pendingSlices.join(',')}] ` +
					`missingFiles=${JSON.stringify(completenessGuard.missingFiles.slice(0, 5))}`,
			);
		}
	}

	if (
		!isZeroWorkShortcut &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		options.requireValidateEvidence !== false &&
		(finalTo === 'review' || finalTo === 'done')
	) {
		const validateEvidence = await resolveRecentValidateEvidence({
			workspaceRoot: options.workspaceRoot,
			validateEvidence: args.validateEvidence,
			deps: options.validateEvidenceDeps,
		});
		if (validateEvidence === null) {
			const envelope = buildValidateRequiredEnvelope();
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(envelope),
					},
				],
				structuredContent: envelope,
				isError: true,
			};
		}
	}

	if (
		isCiEnvironment() &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		(finalTo === 'review' || finalTo === 'done') &&
		!hasProposalCiEvidence(raw)
	) {
		return buildCodeError(
			'missing-ci-evidence',
			`CI requires frontmatter evidence.commit and at least one evidence.ci-runs entry before moving a proposal to ${finalTo}`,
		);
	}

	if (
		isCiEnvironment() &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		(finalTo === 'review' || finalTo === 'done') &&
		!hasExactCiCommitEvidence(raw)
	) {
		return buildCodeError(
			'ci-evidence-sha-mismatch',
			`CI requires evidence.commit to match GITHUB_SHA before moving a proposal to ${finalTo}`,
		);
	}

	if (from === 'review' && finalTo === 'done') {
		const openDependents = (
			await findDependentProposalStatuses(
				options.proposalsDirAbs,
				args.id,
			)
		).filter((dependent) => dependent.status !== 'done');
		if (openDependents.length > 0) {
			return toolError(
				`proposal ${args.id} cannot close before its dependents are done`,
				`Review and close dependent proposal(s) first: ${openDependents.map((dependent) => `${dependent.id} (${dependent.status})`).join(', ')}. Then retry proposal_transition for ${args.id}.`,
			);
		}
	}

	// a00069 S7: review → done requires an independent peer approve unless
	// the host disabled requirePeerReview or the caller passed force:true.
	// a00069 S11: force bypass is audited (reason already required + non-empty).
	const requirePeer = options.requirePeerReview !== false;
	if (requirePeer && from === 'review' && finalTo === 'done') {
		if (args.force === true) {
			recordPeerReviewBypass({
				proposalId: args.id,
				reason: args.reason,
				via: 'force',
			});
		} else {
			// The JSONL log is authoritative wherever it has something to
			// say about this proposal. When it has NOTHING — a fresh
			// clone, a CI runner, a different worktree, a cleared cache —
			// fall back to the proposal document, which carries
			// `review-implementer:` and `review-log: approved by …` per
			// slice and is the committed, reviewable record.
			//
			// Without this fallback the gate was unreachable in exactly
			// those situations: `.cache/` is gitignored and disposable, and
			// `proposal_review` refuses to re-review a slice already marked
			// `review-state: done`, so nothing could ever repopulate the
			// log. A genuinely reviewed proposal could not be closed by
			// anyone who had not personally run the review in this very
			// worktree.
			const readProposalMarkdown = async (): Promise<string> =>
				new SafeWorkspaceReader(options.proposalsDirAbs)
					.readText(relative(options.proposalsDirAbs, found.absPath))
					.then((value) => value.content)
					.catch(() => '');
			const approved =
				typeof options.peerReviewLogPathAbs === 'string' &&
				(await logHasAnyReviewVerdictFor(
					options.peerReviewLogPathAbs,
					args.id,
				))
					? await hasIndependentApprovalSinceLastReview(
							options.peerReviewLogPathAbs,
							args.id,
						)
					: hasIndependentPeerApproval(await readProposalMarkdown());
			if (!approved) {
				const envelope = {
					ok: false as const,
					error: {
						code: 'peer-review-missing',
						blockerType: 'missing-peer-review',
						reason: 'proposal requires at least one independent peer-review entry in peer-review.jsonl after its latest transition to review before it can move to done',
						nextAction: `Run ${options.namespacePrefix}_proposal_review { action: "approve", proposalId: "${args.id}", sliceId: "<finished-slice>", agent: "<reviewer≠implementer>" } before ${options.namespacePrefix}_proposal_transition { id: "${args.id}", to: "done", reason }. Emergency bypass: force:true (host-approved only).`,
					},
				};
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(envelope),
						},
					],
					structuredContent: envelope,
					isError: true,
				};
			}
		}
	}

	if (finalTo === 'done') {
		const yamlBlock = extractYamlBlock(raw);
		const frontmatter =
			yamlBlock === null
				? {}
				: (parseFrontmatterBlock(yamlBlock) as Record<string, unknown>);
		const shippedInGuard = guardShippedInPresent(frontmatter);
		if (!shippedInGuard.ok) {
			return buildCodeError(
				shippedInGuard.code,
				shippedInGuard.reason,
				shippedInGuard.nextAction,
				shippedInGuard.fix,
			);
		}
	}

	const guardRejection = await maybeApplyPlanClosureGuard(
		args,
		found,
		options,
	);
	if (guardRejection !== null) return guardRejection;

	if (from === 'done' && finalTo === 'review' && args.force === true) {
		await logForcedRegression({
			workspaceRoot: options.workspaceRoot,
			proposalId: args.id,
			from,
			to: finalTo,
			reason: args.reason.trim(),
			ts: new Date().toISOString(),
			caller: buildForcedRegressionCaller(args.agent),
		});
	}

	// a00069 S3: applyTransition rewrites self-`**Files**` paths and
	// regenerates the index (when indexPathAbs is set) before returning.
	const result = await applyTransition(
		{
			id: args.id,
			from,
			to: finalTo,
			reason: args.reason,
			transitionId: transitionMetadata.transitionId,
			correlationId: transitionMetadata.correlationId,
			idempotencyKey: transitionMetadata.idempotencyKey,
		},
		found,
		options,
		depId,
	);
	if (
		result.isError !== true &&
		finalTo === 'review' &&
		typeof options.peerReviewLogPathAbs === 'string'
	) {
		// Await (not fire-and-forget): the audit line must land before the
		// tool returns so tests and hosts can tear down the workspace
		// without racing the `withFileMutex` sidecar write (ENOTEMPTY on
		// `rm -rf .cache`). Failures are swallowed — the transition result
		// must never fail because a best-effort log append failed.
		await recordProposalEnteredReview({
			logPathAbs: options.peerReviewLogPathAbs,
			proposalId: args.id,
			from,
		}).catch(() => undefined);
	}
	return result;
};

// ---------------------------------------------------------------------------
// Step 1 — Validate args (cheap, no I/O).
// ---------------------------------------------------------------------------

const validateTransitionArgs = (
	args: IProposalTransitionArgs,
): ReturnType<typeof toolError> | null => {
	if (args.reason === '') {
		return toolError(
			'reason is required',
			'Call proposal_transition with a non-empty reason (audit trail).',
		);
	}
	if (!isKnownStatus(args.to)) {
		return toolError(
			`"${args.to}" is not one of the 7 known statuses`,
			`Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		);
	}
	return null;
};

// ---------------------------------------------------------------------------
// Step 2 — Reject legacy / off-state-machine proposals.
// Returns the narrowed status on success, or a toolError on failure.
// ---------------------------------------------------------------------------

const validateCurrentStatus = (
	id: string,
	found: ILocatedProposal,
): IProposalTransitionSourceStatus | ReturnType<typeof toolError> => {
	if (isKnownStatus(found.status)) return found.status;
	if (
		found.status === 'pending' &&
		isPendingAliasEligible({ proposalId: id, absPath: found.absPath })
	) {
		return 'pending';
	}
	return toolError(
		`"${id}" has current status "${found.status}", which is not on the new state machine yet`,
		'This proposal predates f00016 (legacy 8-status union) — it is migrated by S11/S12, not transitioned by this tool.',
	);
};

// ---------------------------------------------------------------------------
// Step 3 — Validate the DFA edge (status → status transition allowed?).
// ---------------------------------------------------------------------------

const validateTransition = (
	_id: string,
	from: IProposalStatus,
	to: IProposalStatus,
): ReturnType<typeof toolError> | null => {
	const legalTargets = PROPOSAL_STATUS_TRANSITIONS[from];
	if (legalTargets.has(to)) return null;
	const nextHops = [...legalTargets].sort();
	const nextAction =
		nextHops.length > 0
			? `From "${from}", the only legal targets are: ${nextHops.join(', ')}.`
			: `"${from}" is terminal — no transitions out.`;
	// a00069 S3: surface nextHops as a machine-readable field so agents do
	// not have to re-parse the prose. toolError only takes reason/nextAction,
	// so we build the envelope manually (same shape + structuredContent).
	const envelope = {
		ok: false as const,
		error: {
			reason: `illegal transition: "${from}" → "${to}"`,
			nextAction,
			nextHops,
		},
	};
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		isError: true,
	};
};

// ---------------------------------------------------------------------------
// Step 4 — q00001 closure guard (only fires for `type: plan` → done).
// ---------------------------------------------------------------------------

const maybeApplyPlanClosureGuard = async (
	args: IProposalTransitionArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
): Promise<ReturnType<typeof toolError> | null> => {
	if (args.to !== 'done') return null;
	if (options.indexPathAbs === undefined) return null;

	// `locateProposal` returns a partial record when only the index
	// matched (no re-read of the file). The plan-closure guard needs
	// the full markdown, so we re-read it here. Cheap and keeps the
	// locate helper single-responsibility.
	const raw = (
		await new SafeWorkspaceReader(options.proposalsDirAbs).readText(
			relative(options.proposalsDirAbs, found.absPath),
		)
	).content;
	if (!isPlanProposal(raw)) return null;

	const guard = await runPlanClosureGuard({
		planId: args.id,
		planAbsPath: found.absPath,
		proposalsDirAbs: options.proposalsDirAbs,
		indexPathAbs: options.indexPathAbs,
	});
	if (guard.closable) return null;
	return toolError(
		`plan ${args.id} is not closable: ${guard.blockerCount} blocker(s)`,
		`Resolve the blockers first, then call proposal_transition again.\n${guard.blockerLines.join('\n')}\n\nTip: use proposals_close_plan for a friendlier wrapper that runs this same guard.`,
	);
};

// ---------------------------------------------------------------------------
// Step 5 — Apply the transition (file mutation + git mv).
// ---------------------------------------------------------------------------

interface IApplyArgs {
	readonly id: string;
	readonly from: string;
	readonly to: IProposalStatus;
	readonly reason: string;
	readonly transitionId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string | undefined;
}

const applyTransition = async (
	args: IApplyArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
	depId?: string,
) => {
	const gitRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const newFolder = await resolveTargetFolder(
		args.to,
		found,
		options.proposalsDirAbs,
		options.folderPolicy,
	);
	const filename = found.absPath.split('/').pop() ?? found.absPath;
	const newAbsPath = join(options.proposalsDirAbs, newFolder, filename);
	const moved = newAbsPath !== found.absPath;

	let gitWarning: string | undefined;
	let filesRewritten = 0;
	const movedFromRel = relative(options.proposalsDirAbs, found.absPath);
	const movedToRel = relative(options.proposalsDirAbs, newAbsPath);
	await withFileMutex(found.absPath, async () => {
		const current = (
			await new SafeWorkspaceReader(options.proposalsDirAbs).readText(
				relative(options.proposalsDirAbs, found.absPath),
			)
		).content;
		let updated = setFrontmatterStatus(current, args.to);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_TRANSITION_ID_FIELD,
			args.transitionId,
		);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_CORRELATION_ID_FIELD,
			args.correlationId,
		);
		updated = setFrontmatterMetadataField(
			updated,
			LAST_TRANSITION_FROM_FIELD,
			args.from,
		);
		if (args.idempotencyKey !== undefined) {
			updated = setFrontmatterMetadataField(
				updated,
				LAST_IDEMPOTENCY_KEY_FIELD,
				args.idempotencyKey,
			);
		}
		if (args.to === 'blocked' && depId) {
			updated = setFrontmatterField(updated, 'blocked-by', `[${depId}]`);
		}
		// a00069 S3: rewrite stale self-paths in `**Files**` / `files:` so
		// slice plans do not keep pointing at the pre-transition location
		// (e.g. ready/… after a move to done/feats/…).
		if (moved) {
			// `**Files**` entries are resolved against the REPO ROOT — every
			// other entry in these lists is repo-root-relative
			// (`packages/core/src/…`). Rewriting a self-path to the
			// proposals-dir-relative form (`review/f00293-x.md`) therefore
			// produced a path the very next gate could not resolve: the
			// transition broke the document it had just moved, and the
			// following `→ done` failed with `missing-declared-files`.
			//
			// Both spellings are normalised to the repo-root form; the
			// helper's lookbehind keeps the short pass from matching inside
			// an already-rewritten long path.
			const movedFromRepoRel = relative(
				options.workspaceRoot,
				found.absPath,
			);
			const movedToRepoRel = relative(options.workspaceRoot, newAbsPath);
			const longPass = rewriteStaleProposalSelfPaths(updated, {
				oldRelPath: movedFromRepoRel,
				newRelPath: movedToRepoRel,
			});
			const shortPass = rewriteStaleProposalSelfPaths(longPass.markdown, {
				oldRelPath: movedFromRel,
				newRelPath: movedToRepoRel,
			});
			updated = shortPass.markdown;
			filesRewritten = longPass.replacements + shortPass.replacements;
		}
		await writeFileAtomic(found.absPath, updated);

		if (moved) {
			// Keep dynamically-created status/kind folders visible to git too.
			const targetDir = dirname(newAbsPath);
			await mkdir(targetDir, { recursive: true });
			const gitkeep = join(targetDir, '.gitkeep');
			if (
				!(await access(gitkeep).then(
					() => true,
					() => false,
				))
			) {
				await writeFileAtomic(gitkeep, '');
			}
			if (!(await isTrackedFile(gitRunner, found.absPath))) {
				await rename(found.absPath, newAbsPath);
				await gitRunner(['add', newAbsPath]);
			} else {
				const result = await gitRunner([
					'mv',
					found.absPath,
					newAbsPath,
				]);
				if (!result.ok) {
					// Best-effort: git mv failing (no git, dirty tree) must
					// not strand the frontmatter mid-update. A plain rename
					// still gets the folder/status pair consistent; blame
					// preservation is lost, surfaced as a warning.
					await rename(found.absPath, newAbsPath);
					gitWarning = `git mv failed (${result.reason ?? 'unknown'}); fell back to a plain rename — blame history for this file was not preserved by git.`;
				}
			}
		}
	});

	// a00069 S3: regenerate the proposals index so continue_proposal /
	// locate no longer resolve the pre-move path. Best-effort — a sync
	// failure must not roll back a successful file move; surface it as a
	// warning instead.
	let indexSynced = false;
	if (options.indexPathAbs !== undefined) {
		try {
			const layout = {
				proposalsDir: relative(
					options.workspaceRoot,
					options.proposalsDirAbs,
				),
				proposalIndexFile: relative(
					options.workspaceRoot,
					options.indexPathAbs,
				),
			};
			await syncProposalRegistry(
				options.workspaceRoot,
				layout,
				[],
				gitRunner,
				options.folderPolicy,
			);
			indexSynced = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gitWarning = appendWarning(
				gitWarning,
				`index sync failed after transition (${msg}); run sync_proposals`,
			);
		}
	}

	return toolOk({
		id: args.id,
		from: args.from,
		to: args.to,
		reason: args.reason,
		transitionId: args.transitionId,
		correlationId: args.correlationId,
		idempotencyKey: args.idempotencyKey,
		idempotentReplay: false,
		movedFrom: movedFromRel,
		movedTo: movedToRel,
		indexSynced,
		filesRewritten,
		...(gitWarning ? { warning: gitWarning } : {}),
	});
};

// ---------------------------------------------------------------------------
// Tool registration.
// ---------------------------------------------------------------------------

/** Registration for `<prefix>_proposal_transition`. */
export const buildProposalTransitionRegistration = (
	options: IProposalTransitionToolOptions,
): IToolRegistration => ({
	id: 'proposal_transition',
	effects: ['write'],
	summary:
		'Move a proposal to a new status; validated, folder+frontmatter kept in sync.',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_transition`,
			{
				outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
				description:
					'Move a proposal to a new status. Validates against the DFA, updates frontmatter + git mv. Requires reason.',
				inputSchema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			},
			async (args: IProposalTransitionArgs) =>
				runProposalTransitionCompat(args, options).then((result) =>
					result.ok
						? result.payload
						: toolError(
								`invalid input: ${JSON.stringify(result.error.issues)}`,
							),
				),
		);
	},
});
