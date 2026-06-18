/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface QualityGetQualityScopesOutput {
	scopes: Record<
		string,
		{
			command: string;
			expect?: string;
		}[]
	>;
}

export interface QualityQualityCancelOutput {
	cancelled: number[];
	count: number;
}

export interface QualityRunQualityOutput {
	scope: string;
	ok: boolean;
	results: {
		command: string;
		ok: boolean;
		code: number;
		timedOut: boolean;
		tail: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface QualityToolOutputs {
	quality_get_quality_scopes: QualityGetQualityScopesOutput;
	quality_quality_cancel: QualityQualityCancelOutput;
	quality_run_quality: QualityRunQualityOutput;
}
