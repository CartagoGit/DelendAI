/**
 * roi-report.interface.ts — what the token-ROI report says about one plugin.
 *
 * A plugin nobody called has no ROI, not an ROI of zero: zero would rank it
 * as measured and worthless, which nothing observed. The union keeps the
 * two apart, as `hasSamples` does for payload percentiles.
 */

export type IRoiConfidence = 'low' | 'medium' | 'high';

/** A plugin that was called: its score and how many calls it rests on. */
export interface IRoiMeasuredReport {
	readonly pluginId: string;
	readonly measured: true;
	readonly roi: number;
	readonly sampleSize: number;
	readonly confidence: IRoiConfidence;
}

/** A plugin whose tools were served but never called successfully. */
export interface IRoiUnmeasuredReport {
	readonly pluginId: string;
	readonly measured: false;
	readonly reason: 'no-successful-calls';
}

export type IRoiReport = IRoiMeasuredReport | IRoiUnmeasuredReport;

/** Why a plugin could not be ranked at all. */
export type IRoiUnrankedReason = 'no-value-declared' | 'value-rejected';

export interface IRoiUnranked {
	readonly pluginId: string;
	readonly reason: IRoiUnrankedReason;
}

/** One tool's figures in a metrics snapshot, as the ROI producer reads them. */
export interface IRoiToolFigures {
	readonly calls: number;
	readonly errors: number;
	readonly cost: {
		readonly estimatedTokens: { readonly estimatedTokens4B: number };
	};
}
