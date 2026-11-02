/**
 * Whether a plugin's manifest budget still describes its real tools/list
 * bytes. Most manifests carried a copied placeholder for months, and nothing
 * compared it with what the plugin actually lists.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveTokenBudget } from '../../../packages/core/src/lib/contracts/interfaces/plugin-token-budget.interface';
import type { IPluginTokenBudget } from '../../../packages/core/src/lib/contracts/interfaces/plugin-token-budget.interface';

/** Below this share of its declared bytes a budget describes an older plugin. */
const STALE_SHARE = 0.5;

/** Why `bytes` disagrees with `budget`, or undefined when it does not. */
export const manifestBudgetDivergence = (
	owner: string,
	bytes: number,
	budget: IPluginTokenBudget,
): string | undefined => {
	if (bytes > budget.caps.hard) {
		return `${owner}: ${String(bytes)} B is over its manifest hard cap ${String(budget.caps.hard)} B. Shrink the tools, or re-measure and update plugins/${owner}/plugin.manifest.ts.`;
	}
	if (bytes < budget.staticBytes * STALE_SHARE) {
		return `${owner}: ${String(bytes)} B is far below its manifest ${String(budget.staticBytes)} B. Re-measure and update plugins/${owner}/plugin.manifest.ts.`;
	}
	return undefined;
};

/** The budget `owner`'s manifest declares; undefined for a fixture plugin. */
export const readManifestBudget = async (
	repoRoot: string,
	owner: string,
): Promise<IPluginTokenBudget | undefined> => {
	const path = join(repoRoot, 'plugins', owner, 'plugin.manifest.ts');
	if (!existsSync(path)) return undefined;
	const manifest = (await import(path)) as {
		readonly default: {
			readonly tokenBudget: Parameters<typeof resolveTokenBudget>[0];
		};
	};
	return resolveTokenBudget(manifest.default.tokenBudget, 'declared');
};
