import type { ICommandSet, ICommandSetProvider } from '../frameworks/contracts';

/**
 * Default `ICommandSetProvider` for adapters that do not bring
 * their own. Today the only such adapters are JS/TS ones (the
 * `eslint-base.provider.ts` already handles them); this default
 * is a safety net that returns a no-op command set so the
 * `check_rules` tool surfaces a "missing linter" finding rather
 * than crashing.
 *
 * Single Responsibility: this file is the *only* place that
 * knows the last-resort command emitter. The legacy-shape
 * adapter (`toAreaRulesLite`) lives in
 * `frameworks/legacy-shape/adapter.ts` (SRP — one file per
 * concern).
 *
 * Dependency Inversion: the registry wires this in as the
 * default via constructor injection.
 */
export const fallbackCommandSetProvider: ICommandSetProvider = {
	buildCommandSet(_areaDir, _rules): ICommandSet {
		return { checkCommand: 'echo "no linter configured for this area"' };
	},
};
