import { USAGE_TRACKING_OPT_IN_SNIPPET } from '../../contracts/constants/opt-in-snippets.constant';
import type {
	IModelAttributionModel,
	IModelAttributionReportPayload,
	IModelAttributionRow,
} from '../../contracts/interfaces/model-attribution.interface';

const numberOrZero = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, value)
		: 0;

export const buildModelAttributionModel = (
	report: IModelAttributionReportPayload | null | undefined,
): IModelAttributionModel => {
	if (report === null || report === undefined) {
		return {
			kind: 'plugin-absent',
			plugin: 'usage-tracking',
			hint: 'The usage-tracking plugin is not loaded. Enable the opt-in plugin to attribute spend and token savings by model.',
			configSnippet: USAGE_TRACKING_OPT_IN_SNIPPET,
		};
	}

	const buckets = Array.isArray(report.buckets) ? report.buckets : [];
	const largestSaving = buckets.reduce(
		(max, bucket) => Math.max(max, numberOrZero(bucket.tokensSaved)),
		0,
	);
	const rows: IModelAttributionRow[] = buckets
		.map((bucket) => {
			const tokensSaved = numberOrZero(bucket.tokensSaved);
			return {
				key: bucket.key,
				unattributed: bucket.key === 'unattributed',
				calls: numberOrZero(bucket.calls),
				totalTokens: numberOrZero(bucket.totalTokens),
				costUsd: numberOrZero(bucket.costUsd),
				tokensSaved,
				savingsPercent: numberOrZero(bucket.savingsPercent),
				savingsBarPct:
					largestSaving === 0
						? 0
						: Math.min(
								100,
								Math.round((100 * tokensSaved) / largestSaving),
							),
			};
		})
		.sort(
			(left, right) =>
				right.tokensSaved - left.tokensSaved ||
				right.costUsd - left.costUsd ||
				left.key.localeCompare(right.key),
		);

	return {
		kind: 'ready',
		empty: numberOrZero(report.totals.calls) === 0 && rows.length === 0,
		totals: {
			calls: numberOrZero(report.totals.calls),
			totalTokens: numberOrZero(report.totals.totalTokens),
			costUsd: numberOrZero(report.totals.costUsd),
			tokensSaved: numberOrZero(report.totals.tokensSaved),
			savingsPercent: numberOrZero(report.totals.savingsPercent),
		},
		rows,
	};
};
