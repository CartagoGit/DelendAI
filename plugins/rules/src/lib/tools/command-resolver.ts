import type { ICommandSet, ICommandSetProvider } from '../frameworks/contracts';
import type { IAreaRulesLite } from '../frameworks/registry';

/**
 * Default `ICommandSetProvider` for adapters that do not bring
 * their own. Today the only such adapters are JS/TS ones (the
 * `eslint-base.provider.ts` already handles them); this default
 * is a safety net that returns a no-op command set so the
 * `check_rules` tool surfaces a "missing linter" finding rather
 * than crashing.
 *
 * Single Responsibility: the last-resort command emitter.
 * Dependency Inversion: the registry wires this in as the
 * default via constructor injection.
 */
export const fallbackCommandSetProvider: ICommandSetProvider = {
	buildCommandSet(_areaDir, _rules): ICommandSet {
		return { checkCommand: 'echo "no linter configured for this area"' };
	},
};

/**
 * Helper to coerce the legacy per-area shape (currently a
 * `readonly string[]` of config paths) into the narrow
 * `IAreaRulesLite` consumed by the registry's `commandsFor`.
 *
 * Interface Segregation: the registry never sees the full
 * `IAreaRules` (which has `framework` / `presetId` / `reason`
 * / etc.); it only needs the two config lists.
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
