import type { IAreaRulesLite } from '../registry/preset-registry';

/**
 * Single Responsibility: this file is the *only* place that
 * knows the legacy per-area shape (`eslint` / `typecheck` field
 * names). It maps the legacy shape to the narrow
 * `IAreaRulesLite` consumed by the new `PresetRegistry`.
 *
 * Interface Segregation: the registry depends on the narrow
 * shape; this file is the adapter between the narrow shape
 * and the historical wide shape that the legacy
 * `manifest.ts` produces.
 *
 * When the legacy shape is retired (the f00051 S1 migration),
 * this file is the *only* file that disappears. The registry
 * and the tools do not change.
 */
export const toAreaRulesLite = (
	rules: Readonly<{
		eslint: readonly string[];
		typecheck: readonly string[];
	}>,
): IAreaRulesLite => ({
	linterConfigs: rules.eslint,
	typecheckConfigs: rules.typecheck,
});
