/**
 * legacy-residue.registry.ts — the one list of what an older delendai left
 * behind. Workspace migrations and user-level migrators read this list, so
 * a layout change declares its residue once.
 *
 * Entries touch files only through the injected IO.
 */
import type {
	ILegacyResidueContext,
	ILegacyResidueEntry,
} from '../../contracts/interfaces/legacy-residue.interface';
import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from '../migrators/identity-renames';

/** Project host configs that can declare a server under the retired name. */
const PROJECT_HOST_CONFIGS = ['.mcp.json'] as const;

const pathsWithResidue = async (
	ctx: ILegacyResidueContext,
): Promise<readonly { path: string; text: string }[]> => {
	const found: { path: string; text: string }[] = [];
	for (const file of PROJECT_HOST_CONFIGS) {
		const path = `${ctx.root}/${file}`;
		const text = await ctx.io.readText(path);
		if (text !== undefined && stringHasLegacyIdentity(text)) {
			found.push({ path, text });
		}
	}
	return found;
};

/**
 * A server declared under the retired product name, launched with the
 * retired config file name: the key and the launch shape take the current
 * spelling.
 */
const retiredNameAndLaunchShape: ILegacyResidueEntry = {
	id: 'retired-name-server-entry',
	since: '0.1.0',
	kind: 'launch-command',
	scope: 'project',
	names: ['mcp-vertex', 'mcp-vertex.config.json'],
	detect: async (ctx) => (await pathsWithResidue(ctx)).length > 0,
	migrate: async (ctx) => {
		const changed: string[] = [];
		for (const { path, text } of await pathsWithResidue(ctx)) {
			await ctx.io.writeText(path, rewriteIdentityInString(text));
			changed.push(path);
		}
		return changed;
	},
};

/** Every known residue, in the order it is migrated. */
export const legacyResidueRegistry: readonly ILegacyResidueEntry[] = [
	retiredNameAndLaunchShape,
] as const;
