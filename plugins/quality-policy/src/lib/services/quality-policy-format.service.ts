import { truncateIfTooLarge } from '@mcp-vertex/core/public';

import type {
	IQualityPolicyArea,
	IQualityPolicyEntry,
	IQualityPolicyOutput,
} from '../contracts/interfaces/quality-policy.interface';

const QUALITY_POLICY_ORDER: readonly IQualityPolicyArea[] = [
	'tests',
	'conventions',
	'lint',
	'types',
	'coverage',
];

const withBytes = (
	value: Omit<IQualityPolicyOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	bytes: number,
	truncated: boolean,
	originalBytes?: number,
): IQualityPolicyOutput => ({
	...value,
	bytes,
	truncated,
	...(originalBytes === undefined ? {} : { originalBytes }),
});

const compactEntry = (
	entry: IQualityPolicyEntry,
	level: number,
): IQualityPolicyEntry => {
	if (level <= 0) return entry;
	if (level === 1) {
		return {
			...entry,
			...(entry.guidance === undefined
				? {}
				: { guidance: entry.guidance.slice(0, 2) }),
			...(entry.sampledPaths === undefined
				? {}
				: { sampledPaths: entry.sampledPaths.slice(0, 4) }),
			...(entry.presets === undefined
				? {}
				: { presets: entry.presets.slice(0, 2) }),
		};
	}
	if (level === 2) {
		return {
			summary: entry.summary,
			...(entry.mode === undefined ? {} : { mode: entry.mode }),
			...(entry.source === undefined ? {} : { source: entry.source }),
			...(entry.runner === undefined ? {} : { runner: entry.runner }),
			...(entry.strict === undefined ? {} : { strict: entry.strict }),
			...(entry.exactOptionalPropertyTypes === undefined
				? {}
				: {
						exactOptionalPropertyTypes:
							entry.exactOptionalPropertyTypes,
					}),
			...(entry.coverageThreshold === undefined
				? {}
				: { coverageThreshold: entry.coverageThreshold }),
			...(entry.static === undefined ? {} : { static: entry.static }),
		};
	}
	return {
		summary: entry.summary,
		...(entry.static === undefined ? {} : { static: entry.static }),
	};
};

const compactOutput = (
	raw: Omit<IQualityPolicyOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	level: number,
): Omit<IQualityPolicyOutput, 'bytes' | 'truncated' | 'originalBytes'> => {
	const compacted: Partial<
		Record<IQualityPolicyArea, IQualityPolicyEntry>
	> & {
		dependsOn: readonly string[];
	} = {
		dependsOn: raw.dependsOn,
	};
	for (const area of QUALITY_POLICY_ORDER) {
		const entry = raw[area];
		if (entry !== undefined) compacted[area] = compactEntry(entry, level);
	}
	return compacted as Omit<
		IQualityPolicyOutput,
		'bytes' | 'truncated' | 'originalBytes'
	>;
};

export const finalizeQualityPolicyOutput = (
	raw: Omit<IQualityPolicyOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	maxBytes: number,
): IQualityPolicyOutput => {
	const firstPass = truncateIfTooLarge(raw, maxBytes);
	if (!firstPass.truncated)
		return withBytes(raw, firstPass.finalBytes, false);
	const originalBytes = firstPass.originalBytes;
	for (const level of [1, 2, 3]) {
		const candidate = compactOutput(raw, level);
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return withBytes(
				candidate,
				bounded.finalBytes,
				true,
				originalBytes,
			);
		}
	}
	const minimal = {
		dependsOn: raw.dependsOn,
		...(raw.tests === undefined
			? {}
			: { tests: { summary: raw.tests.summary } }),
	};
	const fallback = truncateIfTooLarge(minimal, maxBytes);
	return withBytes(minimal, fallback.finalBytes, true, originalBytes);
};
