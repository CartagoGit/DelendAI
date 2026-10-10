import type { ICommandSet, ICommandSetProvider } from '../../contracts';
import type { IAreaRulesLite } from '../../registry/preset-registry';

/**
 * Shared `ICommandSetProvider` for every JS/TS adapter. Lives
 * here in `languages/base/` (not in `tools/`) because it is one
 * of the adapter implementations, not a tool concern. The tools
 * consume it through `ICommandSetProvider` (DIP).
 *
 * Single Responsibility: emit the three commands for one ESLint
 * area. Nothing else. Every JS/TS preset reuses this; adding a
 * new framework (Vue, Svelte, Solid) reuses this without edits.
 */
export const eslintCommandSetProvider: ICommandSetProvider = {
	buildCommandSet(areaDir, rules): ICommandSet {
		const target = areaDir === '' || areaDir === 'root' ? '.' : areaDir;
		// First linter entry is the project's own config when present;
		// if our cache default is the only one, point ESLint at it.
		const projectOwns = rules.linterConfigs.length > 1;
		const checkCommand = projectOwns
			? `eslint ${target}`
			: `eslint ${target} --config ${rules.linterConfigs[0]}`;
		const fixCommand = `${checkCommand} --fix`;
		const typecheckCommand = resolveTsconfigCommand(rules);
		return typecheckCommand === undefined
			? { checkCommand, fixCommand }
			: { checkCommand, fixCommand, typecheckCommand };
	},
};

/**
 * Project-config-first tsconfig picker. Prefer the project's
 * own typecheck config (the entry not under the cache dir);
 * otherwise fall back to the cache default.
 */
const resolveTsconfigCommand = (rules: IAreaRulesLite): string | undefined => {
	if (rules.typecheckConfigs.length === 0) return undefined;
	const projectCfg = rules.typecheckConfigs.find(
		(p) => !p.includes('.cache/'),
	);
	return `tsc --noEmit -p ${projectCfg ?? rules.typecheckConfigs[0]}`;
};
