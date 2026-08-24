import { truncateIfTooLarge } from '@mcp-vertex/core/public';

import type {
	IImpactAnalysisSection,
	IImpactAnalyzeOutput,
	ITestsForChangeOutput,
} from '../contracts/interfaces/impact-analysis.interface';

const compactSections = (
	sections: readonly IImpactAnalysisSection[],
	limit: number,
): Record<string, readonly string[]> =>
	Object.fromEntries(
		sections.map((section) => [
			section.name,
			section.items.slice(0, limit),
		]),
	);

const finalizeBoundedOutput = <TRaw extends Record<string, unknown>, TResult>(
	raw: TRaw,
	sections: readonly IImpactAnalysisSection[],
	maxBytes: number,
	decorate: (bounded: TRaw, bytes: number, truncated: boolean) => TResult,
): TResult => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return decorate(raw, direct.finalBytes, false);
	}
	for (const limit of [8, 4, 2, 1]) {
		const candidate = {
			...raw,
			...compactSections(sections, limit),
		} as TRaw;
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return decorate(candidate, bounded.finalBytes, true);
		}
	}
	const minimal = {
		...raw,
		...compactSections(sections, 0),
		...compactSections(sections, 1),
	} as TRaw;
	const fallback = truncateIfTooLarge(minimal, maxBytes);
	return decorate(minimal, fallback.finalBytes, true);
};

export const finalizeImpactAnalyzeOutput = (
	raw: Omit<IImpactAnalyzeOutput, 'bytes' | 'truncated'>,
	maxBytes: number,
): IImpactAnalyzeOutput =>
	finalizeBoundedOutput(
		raw,
		[
			{ name: 'changedSymbols', items: raw.changedSymbols },
			{ name: 'dependents', items: raw.dependents },
			{ name: 'affectedPackages', items: raw.affectedPackages },
			{ name: 'recommendedTests', items: raw.recommendedTests },
		],
		maxBytes,
		(bounded, bytes, truncated) => ({
			...(bounded as Omit<IImpactAnalyzeOutput, 'bytes' | 'truncated'>),
			bytes,
			truncated,
		}),
	);

export const finalizeTestsForChangeOutput = (
	raw: Omit<ITestsForChangeOutput, 'bytes' | 'truncated'>,
	maxBytes: number,
): ITestsForChangeOutput =>
	finalizeBoundedOutput(
		raw,
		[
			{ name: 'run', items: raw.run },
			{ name: 'skip', items: raw.skip },
			{ name: 'coverageFocus', items: raw.coverageFocus },
			{ name: 'likelyRelatedFailures', items: raw.likelyRelatedFailures },
		],
		maxBytes,
		(bounded, bytes, truncated) => ({
			...(bounded as Omit<ITestsForChangeOutput, 'bytes' | 'truncated'>),
			bytes,
			truncated,
		}),
	);
