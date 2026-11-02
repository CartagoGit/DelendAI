import { type ReleaseTarget } from './release-plan';
/** Exported for unit testing only. */
export interface ICliFlags {
	target: ReleaseTarget | undefined;
	write: boolean;
	publish: boolean;
	validate: boolean;
	tool: 'bun' | 'npm';
	provenance: boolean;
	/** Audit-h2-fix: when true, suppress every progress banner so this
	 *  script stays quiet inside `bun run validate` and CI logs. The
	 *  plan + publish result still go to stderr so callers see what
	 *  happened if they pipe stdout to a file. */
	quiet: boolean;
}
/** Exported for unit testing only; `main()` is the production entry point. */
export declare function parseFlags(argv: readonly string[]): ICliFlags;
/**
 * f00152 S7: pure decision function — given the current config and a
 * new release version, return the next config. When the existing
 * pin is the `latest-published` sentinel or is absent, we leave it
 * (the sentinel tracks the latest tag and needs no bumping). When
 * the pin is a concrete semver that is now stale, we move it to the
 * new version — this keeps a self-host agent's CI green after the
 * upgrade. Exported for unit testing.
 */
export declare const resolveBumpCoreVersion: <
	T extends {
		coreVersion?: string;
	},
>(
	currentConfig: T,
	newVersion: string,
) => T;
