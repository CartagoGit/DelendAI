/** Every preset id the catalogue retired; each one still resolves (see `PRESET_ALIASES`). */
export const RETIRED_PRESET_ID = [
	'vertex',
	'lean',
	'standard',
	'full',
	'web-app',
	'backend-api',
	'cli-tool',
] as const;

export type IRetiredPresetId = (typeof RETIRED_PRESET_ID)[number];
