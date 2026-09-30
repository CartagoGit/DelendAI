/**
 * framework-version.interface.ts — f00547 S1: the pure contract for
 * resolving the INSTALLED version of a detected framework dependency.
 *
 * `matchFramework` (framework-rules.ts) already answers "which
 * framework". This answers "which version of it is actually
 * installed" — read from the lockfile first (the only place a
 * concrete, resolved version lives) and the manifest range second,
 * only when that range is itself an exact pin. A range with no
 * lockfile entry is reported `unresolved` rather than guessed,
 * because a rule keyed to the wrong version is worse than no rule.
 */

/** Which input answered the version, or that none did. */
export type IVersionSource = 'lockfile' | 'manifest' | 'unresolved';

/** One of the lockfile kinds `detect-stack-defaults.helper.ts` already knows. */
export type ILockfileKind =
	| 'bun.lock'
	| 'package-lock.json'
	| 'yarn.lock'
	| 'pnpm-lock.yaml';

/** A lockfile's raw text, named so the parser can dispatch on its format. */
export interface ILockfileRef {
	readonly kind: ILockfileKind;
	readonly text: string;
}

/** The resolved answer for one dependency. */
export interface IResolvedFrameworkVersion {
	readonly depName: string;
	/** The concrete version (e.g. `"17.3.2"`), when one was resolved. */
	readonly version: string | undefined;
	/** The manifest's declared range (e.g. `"^17.0.0"`), when a manifest entry exists. */
	readonly range: string | undefined;
	readonly source: IVersionSource;
}
