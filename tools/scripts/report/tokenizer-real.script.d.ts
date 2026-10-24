#!/usr/bin/env bun
/**
 * How much to trust a profile's token count:
 *  - `measured-real-bpe`: the model's own published tokenizer, run
 *    directly against the exact serialized text.
 *  - `measured-legacy-bpe`: a real BPE encode, but on a vocabulary the
 *    vendor published for an older model generation — a genuine token
 *    count, just not provably this model's own vocabulary.
 *  - `estimated-byte-ratio`: no offline tokenizer exists for this model;
 *    this is `bytes / bytesPerEstimatedToken`, a heuristic, not a count.
 */
export type ITokenizerConfidence =
	| 'measured-real-bpe'
	| 'measured-legacy-bpe'
	| 'estimated-byte-ratio';
export interface ITokenizerProfile {
	readonly model: string;
	readonly confidence: ITokenizerConfidence;
	/** The exact tokenizer/package that produced the count, for reproducibility. */
	readonly tokenizerId: string;
	readonly note: string;
}
export interface ITokenizerModelEstimate extends ITokenizerProfile {
	readonly tokenCount: number;
}
export interface ITokenizerPresetMeasurement {
	readonly presetId: string;
	readonly toolsListBytes: number;
	readonly toolCount: number;
	readonly estimates: readonly ITokenizerModelEstimate[];
}
export declare const estimateTokensFromBytes: (bytes: number) => number;
export declare const TOKENIZER_MODELS: string[];
/** Real (or, where unavailable, clearly-labelled estimated) token counts
 * for every registered model profile, over one exact JSON text. */
export declare const buildTokenizerEstimates: (
	jsonText: string,
) => readonly ITokenizerModelEstimate[];
export declare const measurePresetTokenizerCosts: (
	presetIds?: readonly string[],
) => Promise<readonly ITokenizerPresetMeasurement[]>;
