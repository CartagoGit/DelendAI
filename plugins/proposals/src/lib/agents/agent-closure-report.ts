import { readFile } from 'node:fs/promises';

import { appendToClosedTasks } from './closed-tasks-log';
import { AGENT_CANONICAL_ROLES } from '../shared/agent-conventions';

/**
 * Host vocabulary for closure-report validation. The framework owns
 * the report mechanics; the host owns which agent slots exist and
 * which models are valid (moved from the host project where
 * these values came from `the host model inventory`).
 */
export interface IAgentClosureVocabulary {
	readonly slots: readonly string[];
	/** When undefined, model validation is skipped (any model accepted). */
	readonly validModels?: ReadonlySet<string> | undefined;
	/** Label appended to gate reasons, e.g. the inventory observation date. */
	readonly modelInventoryLabel?: string | undefined;
}

export const DEFAULT_AGENT_CLOSURE_VOCABULARY: IAgentClosureVocabulary = {
	slots: AGENT_CANONICAL_ROLES,
};

const SELF_REVIEW_VALUES = ['pass', 'fail'] as const;

export type IAgentClosureReportErrorCode =
	| 'INVALID_FRONTMATTER'
	| 'MISSING_FIELD'
	| 'INVALID_MODEL'
	| 'INCONSISTENT_REVIEW'
	| 'INVALID_SLOT'
	| 'TEMPORAL_INCONSISTENCY';

export interface IAgentClosureReportError {
	readonly code: IAgentClosureReportErrorCode;
	readonly field?: string;
	readonly path: string;
	readonly message: string;
}

export interface IAgentClosureReport {
	readonly agentName: string;
	readonly agentSlot: (typeof AGENT_CANONICAL_ROLES)[number];
	readonly model: string;
	readonly selfReview: (typeof SELF_REVIEW_VALUES)[number];
	readonly filesReRead: number;
	readonly reviewEvidence: readonly string[];
	readonly proposalId?: string;
	readonly taskId?: string;
	readonly summary?: string;
	readonly startedAt?: string;
	readonly closedAt?: string;
}

export interface IClosureDecision {
	readonly closureDecision: 'close' | 'open_fix' | 'awaiting_user';
	readonly reason: string;
	readonly blockerType:
		| 'none'
		| 'state-inconsistency'
		| 'owned-validation-failure'
		| 'hard-blocker';
	readonly nextAction: string;
}

export class AgentClosureGateError extends Error {
	readonly closureDecision: IClosureDecision['closureDecision'];
	readonly reason: string;
	readonly blockerType: IClosureDecision['blockerType'];
	readonly nextAction: string;

	constructor(decision: IClosureDecision) {
		super(decision.reason);
		this.name = 'AgentClosureGateError';
		this.closureDecision = decision.closureDecision;
		this.reason = decision.reason;
		this.blockerType = decision.blockerType;
		this.nextAction = decision.nextAction;
	}
}

export class AgentClosureReportParseError extends Error {
	readonly code: IAgentClosureReportErrorCode;
	readonly field?: string | undefined;
	readonly path: string;

	constructor(
		code: IAgentClosureReportErrorCode,
		path: string,
		message: string,
		field?: string
	) {
		super(message);
		this.name = 'AgentClosureReportParseError';
		this.code = code;
		this.field = field;
		this.path = path;
	}

	toJSON(): IAgentClosureReportError {
		return {
			code: this.code,
			...(this.field ? { field: this.field } : {}),
			path: this.path,
			message: this.message,
		};
	}
}

const hasOwn = <T extends string>(
	value: object,
	key: T
): value is Record<T, unknown> =>
	Object.prototype.hasOwnProperty.call(value, key);

const ensureObject = (
	value: unknown,
	path: string
): Record<string, unknown> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			path,
			`Agent closure report at ${path} must be a JSON object`
		);
	}

	return value as Record<string, unknown>;
};

const requireField = <T extends string>(
	record: Record<string, unknown>,
	field: T,
	path: string
): unknown => {
	if (!hasOwn(record, field) || record[field] === undefined) {
		throw new AgentClosureReportParseError(
			'MISSING_FIELD',
			path,
			`Missing required field ${field} in ${path}`,
			field
		);
	}

	return record[field];
};

const ensureString = (value: unknown, field: string, path: string): string => {
	if (typeof value !== 'string') {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			path,
			`Field ${field} in ${path} must be a string`,
			field
		);
	}

	return value;
};

const ensureNumber = (value: unknown, field: string, path: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			path,
			`Field ${field} in ${path} must be a finite number >= 0`,
			field
		);
	}

	return value;
};

const ensureStringArray = (
	value: unknown,
	field: string,
	path: string
): readonly string[] => {
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== 'string')
	) {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			path,
			`Field ${field} in ${path} must be a string array`,
			field
		);
	}

	return value;
};

const ensureTimestamp = (
	value: unknown,
	field: 'startedAt' | 'closedAt',
	path: string
): string | undefined => {
	if (value === undefined) {
		return undefined;
	}

	const timestamp = ensureString(value, field, path);
	if (Number.isNaN(Date.parse(timestamp))) {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			path,
			`Field ${field} in ${path} must be an ISO timestamp`,
			field
		);
	}

	return timestamp;
};

const optionalString = (
	value: unknown,
	field: string,
	path: string
): string | undefined => {
	if (value === undefined || value === null) {
		return undefined;
	}

	const trimmed = ensureString(value, field, path).trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const isAgentSlot = (
	value: string,
	vocabulary: IAgentClosureVocabulary
): value is IAgentClosureReport['agentSlot'] =>
	vocabulary.slots.includes(value);

const isSelfReview = (
	value: string
): value is IAgentClosureReport['selfReview'] =>
	(SELF_REVIEW_VALUES as readonly string[]).includes(value);

const isKnownModel = (
	value: string,
	vocabulary: IAgentClosureVocabulary
): boolean =>
	vocabulary.validModels === undefined || vocabulary.validModels.has(value);

const readJson = async (absolutePath: string): Promise<unknown> => {
	try {
		const raw = await readFile(absolutePath, 'utf8');
		return JSON.parse(raw) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			absolutePath,
			`Unable to parse agent closure report ${absolutePath}: ${detail}`
		);
	}
};

export const parseAgentClosureReport = async (
	absolutePath: string,
	vocabulary: IAgentClosureVocabulary = DEFAULT_AGENT_CLOSURE_VOCABULARY
): Promise<IAgentClosureReport> => {
	const parsed = ensureObject(await readJson(absolutePath), absolutePath);
	const agentName = ensureString(
		requireField(parsed, 'agentName', absolutePath),
		'agentName',
		absolutePath
	);
	const agentSlot = ensureString(
		requireField(parsed, 'agentSlot', absolutePath),
		'agentSlot',
		absolutePath
	);
	const model = ensureString(
		requireField(parsed, 'model', absolutePath),
		'model',
		absolutePath
	);
	const selfReview = ensureString(
		requireField(parsed, 'selfReview', absolutePath),
		'selfReview',
		absolutePath
	);
	const filesReRead = ensureNumber(
		requireField(parsed, 'filesReRead', absolutePath),
		'filesReRead',
		absolutePath
	);
	const reviewEvidence = ensureStringArray(
		requireField(parsed, 'reviewEvidence', absolutePath),
		'reviewEvidence',
		absolutePath
	);
	const proposalId = optionalString(
		parsed['proposalId'],
		'proposalId',
		absolutePath
	);
	const taskId = optionalString(parsed['taskId'], 'taskId', absolutePath);
	const summary = optionalString(parsed['summary'], 'summary', absolutePath);
	const startedAt = ensureTimestamp(
		parsed['startedAt'],
		'startedAt',
		absolutePath
	);
	const closedAt = ensureTimestamp(
		parsed['closedAt'],
		'closedAt',
		absolutePath
	);

	if (!isAgentSlot(agentSlot, vocabulary)) {
		throw new AgentClosureReportParseError(
			'INVALID_SLOT',
			absolutePath,
			`agentSlot ${agentSlot} is not canonical`,
			'agentSlot'
		);
	}

	if (!isSelfReview(selfReview)) {
		throw new AgentClosureReportParseError(
			'INVALID_FRONTMATTER',
			absolutePath,
			`selfReview must be one of: ${SELF_REVIEW_VALUES.join(', ')}`,
			'selfReview'
		);
	}

	if (!isKnownModel(model, vocabulary)) {
		throw new AgentClosureReportParseError(
			'INVALID_MODEL',
			absolutePath,
			`model ${model} is not in hostModelInventory`,
			'model'
		);
	}

	if (selfReview === 'pass' && filesReRead === 0) {
		throw new AgentClosureReportParseError(
			'INCONSISTENT_REVIEW',
			absolutePath,
			`selfReview pass requires filesReRead >= 1 in ${absolutePath}`,
			'filesReRead'
		);
	}

	if (selfReview === 'pass' && reviewEvidence.length === 0) {
		throw new AgentClosureReportParseError(
			'INCONSISTENT_REVIEW',
			absolutePath,
			`selfReview pass requires reviewEvidence in ${absolutePath}`,
			'reviewEvidence'
		);
	}

	if (
		startedAt !== undefined &&
		closedAt !== undefined &&
		Date.parse(closedAt) < Date.parse(startedAt)
	) {
		throw new AgentClosureReportParseError(
			'TEMPORAL_INCONSISTENCY',
			absolutePath,
			`closedAt must be >= startedAt in ${absolutePath}`,
			'closedAt'
		);
	}

	return {
		agentName,
		agentSlot,
		model,
		selfReview,
		filesReRead,
		reviewEvidence,
		...(proposalId !== undefined ? { proposalId } : {}),
		...(taskId !== undefined ? { taskId } : {}),
		...(summary !== undefined ? { summary } : {}),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(closedAt !== undefined ? { closedAt } : {}),
	};
};

export const evaluateSelfReviewGate = (
	report: IAgentClosureReport,
	vocabulary: IAgentClosureVocabulary = DEFAULT_AGENT_CLOSURE_VOCABULARY
): IClosureDecision => {
	if (report.agentName.trim().length === 0) {
		return {
			closureDecision: 'awaiting_user',
			reason: 'agentName missing — cannot attribute the slice to a symbolic name',
			blockerType: 'state-inconsistency',
			nextAction:
				'Repair the closure checkpoint with the actual symbolic agent name if it is knowable from lock, registry, chat context, or the running agent; ask the user only if attribution cannot be recovered.',
		};
	}

	if (!isKnownModel(report.model, vocabulary)) {
		const label =
			vocabulary.modelInventoryLabel !== undefined
				? ` (${vocabulary.modelInventoryLabel})`
				: '';
		return {
			closureDecision: 'open_fix',
			reason: `model ${report.model} not in host inventory${label}`,
			blockerType: 'state-inconsistency',
			nextAction:
				'Rewrite the checkpoint model to one of hostModelInventory when the actual model is evident; otherwise create a narrow verifier handoff instead of blocking unrelated work.',
		};
	}

	if (report.selfReview === 'fail') {
		return {
			closureDecision: 'open_fix',
			reason: 'self-review fail requires repair',
			blockerType: 'owned-validation-failure',
			nextAction:
				'Re-read the owned diff, repair the finding inside current ownership, rerun the smallest required validation, and invoke the self-review gate again once evidence is updated.',
		};
	}

	return {
		closureDecision: 'close',
		reason: 'self-review pass + model declared',
		blockerType: 'none',
		nextAction: 'Close the slice and release its lock.',
	};
};

export const assertGate = (
	report: IAgentClosureReport,
	vocabulary: IAgentClosureVocabulary = DEFAULT_AGENT_CLOSURE_VOCABULARY
): void => {
	const decision = evaluateSelfReviewGate(report, vocabulary);
	if (decision.closureDecision !== 'close') {
		throw new AgentClosureGateError(decision);
	}
};

// ---------------------------------------------------------------------------
// self-review gate → closedTasks.json hook
// ---------------------------------------------------------------------------
//
// The pure `evaluateSelfReviewGate` and `assertGate` above are part of the
// the existing contract and are exercised by specs. To avoid regressing
// them, the closedTasks hook lives in a NEW entry point that wraps the
// pure gate. When the pure gate returns `close`, this entry point also calls
// `appendToClosedTasks(closedTasksPath, ...)` so the task appears in the
// append-only log and unlocks `observe` for any waiters that subscribed
// to its taskId. On `open_fix` / `awaiting_user`, the hook does nothing.

export interface IClosureHookParams {
	readonly closedTasksPath: string;
	readonly taskId: string;
	readonly filesOwned: readonly string[];
}

export const evaluateSelfReviewGateWithClosedTasksHook = async (
	report: IAgentClosureReport,
	hookParams: IClosureHookParams,
	vocabulary: IAgentClosureVocabulary = DEFAULT_AGENT_CLOSURE_VOCABULARY
): Promise<IClosureDecision> => {
	// Reuse the pure gate; do not modify it (regression risk).
	const decision = evaluateSelfReviewGate(report, vocabulary);

	if (decision.closureDecision !== 'close') {
		return decision;
	}

	// Append to closedTasks. Use the report's closedAt if present,
	// otherwise the current time. AppendToClosedTasks is idempotent.
	const closedAt = report.closedAt ?? new Date().toISOString();
	await appendToClosedTasks(hookParams.closedTasksPath, {
		taskId: hookParams.taskId,
		closedAt,
		agentName: report.agentName,
		filesOwned: hookParams.filesOwned,
	});

	return decision;
};
