/**
 * style-profile.service.ts — the style architecture a project declares,
 * resolved once, and what it says of one path.
 *
 * Declared per scope so that `src/legacy/**` can be `legacy-global`: an
 * agent that finds global selectors there has found the architecture of
 * that folder, not drift to repair.
 */
import {
	DEFAULT_STYLE_ARCHITECTURE,
	UTILITY_DIRECTIVES,
} from '../contracts/constants/style-profile.constant';
import type {
	IStyleArchitecture,
	IStyleOptions,
	IStyleProfile,
} from '../contracts/interfaces/selector-graph.interface';
import { globToRegExp } from '../parse/path-glob.helper';

/** What the shared-prefix gate is called when the project names none. */
const DEFAULT_SHARED_AUTHORITY = 'the gate that owns the shared classes';

export const resolveStyleProfile = (options: IStyleOptions): IStyleProfile => ({
	architecture: options.architecture ?? DEFAULT_STYLE_ARCHITECTURE,
	overrides: options.overrides ?? [],
	layers: (options.layers ?? []).map((layer) => ({
		name: layer.name,
		glob: layer.glob,
		prefixes: layer.prefixes ?? [],
	})),
	styleRoots: options.styleRoots ?? [],
	markupRoots: options.markupRoots ?? [],
	tokenFiles: options.tokenFiles ?? [],
	sharedPrefixes: options.sharedPrefixes ?? [],
	sharedAuthority: options.sharedAuthority ?? DEFAULT_SHARED_AUTHORITY,
});

/** The architecture in force for `path`: the last override that matches, else the default. */
export const architectureFor = (
	profile: IStyleProfile,
	path: string,
): IStyleArchitecture =>
	[...profile.overrides]
		.reverse()
		.find((override) => globToRegExp(override.glob).test(path))
		?.architecture ?? profile.architecture;

/** The layer `path` belongs to, by the first layer whose glob matches. */
export const layerOf = (
	profile: IStyleProfile,
	path: string,
): string | undefined =>
	profile.layers.find((layer) => globToRegExp(layer.glob).test(path))?.name;

/** The layer that owns a selector by its prefix: the longest prefix wins. */
export const ownerOfSelector = (
	profile: IStyleProfile,
	selector: string,
): string | undefined => {
	let owner: { readonly name: string; readonly length: number } | undefined;
	for (const layer of profile.layers) {
		for (const prefix of layer.prefixes) {
			if (
				selector.startsWith(prefix) &&
				prefix.length > (owner?.length ?? 0)
			) {
				owner = { name: layer.name, length: prefix.length };
			}
		}
	}
	return owner?.name;
};

/** The major version in a version or range (`^4.1.0` → 4); nothing when unreadable. */
export const majorOf = (version: string | undefined): number | undefined => {
	const digits = /\d+/u.exec(version ?? '')?.[0];
	return digits === undefined ? undefined : Number(digits);
};

/**
 * Whether the installed major accepts a directive: `true`, `false`, or
 * `undefined` when the directive is not one this table knows or no
 * version is installed — nobody can say, which is not a refusal.
 */
export const directiveSupported = (
	directive: string,
	installedMajor: number | undefined,
): boolean | undefined => {
	const range = UTILITY_DIRECTIVES[directive];
	if (range === undefined || installedMajor === undefined) return undefined;
	return (
		(range.since === undefined || installedMajor >= range.since) &&
		(range.until === undefined || installedMajor < range.until)
	);
};
