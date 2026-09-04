/**
 * classify-origin.ts — f00107 S1.
 *
 * Pure classifier for a plugin's {@link PluginOrigin}. No I/O, no
 * filesystem, no hardcoded plugin-name list: it decides from the config
 * entry + the resolved module specifier alone, so it cannot drift as the
 * shipped plugin set changes.
 */
import { FIRST_PARTY_SCOPE } from '../contracts/constants/first-party-scope.constant';
import type {
	IPluginOriginInput,
	PluginOrigin,
} from '../contracts/interfaces/plugin-origin.interface';

/**
 * Classify where a loaded plugin came from. Precedence (most specific
 * first):
 *   1. an external-mcps composed server (`ext.*`) → `external`;
 *   2. an explicit `path` entry → `user-local` (the user pointed at their
 *      own module — this wins even if the path happens to sit under the
 *      scope, because ownership is the user's, not ours);
 *   3. a resolved specifier under `@delendai/` → `bundled`;
 *   4. anything else (a third-party `mcp-*` / bare package the user added)
 *      → `user-local`.
 */
export const classifyOrigin = (input: IPluginOriginInput): PluginOrigin => {
	if (input.isExternalServer === true) return 'external';
	if (input.hasExplicitPath === true) return 'user-local';
	if (input.resolvedSpecifier.startsWith(FIRST_PARTY_SCOPE)) return 'bundled';
	return 'user-local';
};

/** True when a resolved specifier is a first-party `@delendai/*` module. */
export const isFirstPartySpecifier = (resolvedSpecifier: string): boolean =>
	resolvedSpecifier.startsWith(FIRST_PARTY_SCOPE);
