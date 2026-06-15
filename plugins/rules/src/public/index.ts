/**
 * Public surface of `@cartago-git/mcp-rules`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * presets, detection and manifest builders for programmatic reuse.
 */
export { default } from '../index';

export {
	RULE_PRESETS,
	PRESET_BY_ID,
	REQUIRED_ESLINT_DEPS,
	SUPPORTED_PRESET_IDS,
} from '../lib/frameworks/presets';
export {
	RULES_MODES,
	RULES_MODE_GUIDANCE,
} from '../lib/frameworks/types';
export type {
	IRulePreset,
	IRulesMode,
	IAreaRules,
	IRulesManifest,
} from '../lib/frameworks/types';
export { detectPresetForArea } from '../lib/frameworks/detect-framework';
export type { IDetectResult } from '../lib/frameworks/detect-framework';
export {
	buildRulesManifest,
	discoverAreas,
	ensureRulesCache,
} from '../lib/frameworks/manifest';
export {
	buildGetRulesRegistration,
	buildCheckRulesRegistration,
	buildApplyRulesRegistration,
} from '../lib/tools/rules-tools';
export type { IRulesToolOptions } from '../lib/tools/rules-tools';
