/**
 * Public surface of `@delendai/rules`. The default export (in
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
// NOTE: `buildRulesManifest` (legacy manifest builder) is intentionally
// NOT re-exported from the public barrel. The plugin's tool surface
// (`rules-tools.ts`) consumes `buildManifestViaComposition` exclusively
// — the composition root is the single source of truth. Programmatic
// consumers that still need the legacy builder should import from the
// deep path `@delendai/rules/lib/frameworks/manifest` (tests do this).
export {
	discoverAreas,
	ensureRulesCache,
} from '../lib/frameworks/manifest';
export {
	buildGetRulesRegistration,
	buildCheckRulesRegistration,
	buildApplyRulesRegistration,
} from '../lib/tools/rules-tools';
export type { IRulesToolOptions } from '../lib/tools/rules-tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
