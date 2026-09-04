/**
 * MICRO_VALIDATION_LOOP (f00156 S5) — server-observed only.
 *
 * Repeated equivalent validation tools with an unchanged progress hash
 * yield a recommend advisory. Edit+test cycles and a legitimate
 * multi-layer suite after one slice do not.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

export const MICRO_VALIDATION_CODE = 'MICRO_VALIDATION_LOOP';
export const DEFAULT_EQUIVALENT_RUNS_BEFORE_WARNING = 2;

const DEFAULT_VALIDATION_TOOLS = [
	'run_quality',
	'quality_run_all',
	'validate',
	'typecheck',
	'lint',
	'test',
] as const;

export interface IObservedToolCall {
	readonly tool: string;
	readonly kind: 'validation' | 'edit' | 'other';
	readonly progressHash: string;
	readonly sliceId?: string;
}

export interface IMicroValidationOptions {
	readonly equivalentRunsBeforeWarning?: number;
	readonly validationTools?: readonly string[];
}

const kindOf = (
	tool: string,
	validationTools: readonly string[],
	explicit?: IObservedToolCall['kind'],
): IObservedToolCall['kind'] => {
	if (explicit !== undefined) return explicit;
	const stem = tool.includes('_') ? tool.split('_').slice(-1)[0]! : tool;
	const haystack = [...validationTools, ...DEFAULT_VALIDATION_TOOLS];
	if (haystack.some((name) => tool.endsWith(name) || stem === name)) {
		return 'validation';
	}
	return 'other';
};

export const assessMicroValidationLoop = (
	calls: readonly IObservedToolCall[],
	options: IMicroValidationOptions = {},
): ICheckpointAdvisory | null => {
	const threshold =
		options.equivalentRunsBeforeWarning ??
		DEFAULT_EQUIVALENT_RUNS_BEFORE_WARNING;
	const validationTools = options.validationTools ?? DEFAULT_VALIDATION_TOOLS;
	if (calls.length === 0) return null;

	let consecutive = 0;
	let lastHash: string | null = null;
	let sliceId = 'unknown';
	for (const call of calls) {
		const kind = kindOf(call.tool, validationTools, call.kind);
		if (kind === 'edit') {
			consecutive = 0;
			lastHash = call.progressHash;
			continue;
		}
		if (kind !== 'validation') continue;
		if (lastHash === call.progressHash) consecutive += 1;
		else consecutive = 1;
		lastHash = call.progressHash;
		if (call.sliceId !== undefined) sliceId = call.sliceId;
	}
	if (consecutive < threshold || lastHash === null) return null;
	return {
		triggered: true,
		code: MICRO_VALIDATION_CODE,
		severity: 'recommend',
		message:
			'At this point, I recommend stopping micro-validation, completing the current coherent slice, and validating it once at the slice boundary.',
		reason: 'multiple validation cycles have run without a meaningful implementation delta',
		nextAction: 'finish-slice-before-validating',
		dedupeKey: `MICRO_VALIDATION:${sliceId}:${lastHash}`,
	};
};
