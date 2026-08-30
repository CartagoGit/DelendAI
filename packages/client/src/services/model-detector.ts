import {
	detectModelTier,
	type TModelTier,
} from '@mcp-vertex/core/lib/presets/model-profiles';

export const MODEL_TIER_HEADER = 'x-model-tier';

export type ModelTierHeaders = Readonly<
	Record<string, string | null | undefined>
>;

export interface ModelTierHeaderSource {
	get(name: string): string | null | undefined;
}

/** Read a provider tier header, defaulting to medium when absent. */
export const detectModelTierFromHeaders = (
	headers: ModelTierHeaders | ModelTierHeaderSource | Headers | undefined,
): TModelTier => {
	if (headers === undefined) return 'medium';
	let value: string | null | undefined;
	if (headers instanceof Headers) {
		value = headers.get(MODEL_TIER_HEADER);
	} else if (
		typeof headers === 'object' &&
		'get' in headers &&
		typeof headers.get === 'function'
	) {
		value = headers.get(MODEL_TIER_HEADER);
	} else {
		const plainHeaders = headers as ModelTierHeaders;
		value =
			plainHeaders[MODEL_TIER_HEADER] ??
			plainHeaders[MODEL_TIER_HEADER.toLowerCase()];
	}
	return detectModelTier(value);
};
