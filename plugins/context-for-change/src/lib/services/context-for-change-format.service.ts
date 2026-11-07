import type { ITruncatedEnvelope } from '@delendai/core/public';
import {
	POLICY_GUIDANCE,
	resolveTestPolicy,
} from '@delendai/test-policy/public';

import {
	CONTEXT_FOR_CHANGE_DEPENDS_ON,
	CONTEXT_FOR_CHANGE_MAX_PREVIEW_CHARS,
	DEFAULT_CONTEXT_FOR_CHANGE_MAX_BYTES,
} from '../contracts/constants/context-for-change.constant';
import type {
	IContextForChangeOutput,
	IContextForChangeSection,
	TContextForChangeSource,
} from '../contracts/interfaces/context-for-change.interface';

/**
 * `value` within `maxChars`, and when it is cut, how much: `…+N` names the
 * characters left out, so a reader knows to ask for the rest.
 */
export const limitContextPreview = (
	value: string,
	maxChars: number = CONTEXT_FOR_CHANGE_MAX_PREVIEW_CHARS,
): string => {
	if (value.length <= maxChars) return value;
	let kept = maxChars - 1;
	for (;;) {
		const suffix = `…+${String(value.length - kept)}`;
		if (kept + suffix.length <= maxChars || kept === 0) {
			return `${value.slice(0, kept)}${suffix}`;
		}
		kept -= 1;
	}
};

export const makeContextSection = (
	source: TContextForChangeSource,
	summary: string,
): IContextForChangeSection => ({
	source,
	summary: limitContextPreview(summary),
});

const isTruncatedEnvelope = (value: unknown): value is ITruncatedEnvelope =>
	typeof value === 'object' && value !== null && '__truncated' in value;

export const formatTestPolicySummary = (
	testPolicyMode?: 'tdd' | 'tests-after' | 'free' | 'none',
): string => {
	const resolved = resolveTestPolicy({
		...(testPolicyMode !== undefined ? { configMode: testPolicyMode } : {}),
	});
	const firstRule =
		POLICY_GUIDANCE[resolved.mode][0] ?? 'No policy guidance available.';
	return `${resolved.mode} (${resolved.source}): ${firstRule}`;
};

export const buildTruncatedContextOutput = (
	truncation: {
		readonly value: unknown;
		readonly finalBytes: number;
		readonly originalBytes: number;
	},
	files: readonly string[],
	maxBytes: number = DEFAULT_CONTEXT_FOR_CHANGE_MAX_BYTES,
): IContextForChangeOutput => {
	const head = JSON.stringify(
		(isTruncatedEnvelope(truncation.value)
			? truncation.value.head
			: undefined) ?? {},
	);
	return {
		dependsOn: [...CONTEXT_FOR_CHANGE_DEPENDS_ON],
		files,
		sections: [
			makeContextSection(
				'git',
				`Output truncated to stay within ${String(maxBytes)} bytes (it was ${String(truncation.originalBytes)}): name fewer files, or raise maxBytes. Preview: ${limitContextPreview(head)}`,
			),
		],
		bytes: truncation.finalBytes,
		truncated: true,
		originalBytes: truncation.originalBytes,
	};
};
