export interface IPublishTarballsInput {
	readonly pkgDir: string;
	readonly tarballPaths: readonly string[];
	readonly tool: 'npm' | 'bun';
	readonly registry: string | undefined;
}
export interface IPublishTarballResult {
	readonly tool: 'npm' | 'bun';
	readonly tarballPath: string;
	readonly ok: boolean;
	readonly stderr?: string;
}
export declare function assertTarballsProvided(
	input: IPublishTarballsInput,
): asserts input is IPublishTarballsInput & {
	readonly tarballPaths: readonly string[];
};
/**
 * Publishes each tarball using the configured tool. For 'npm' it uses
 * `npm publish <tarball> --registry=<registry>`. For 'bun' it extracts
 * the tarball in a temp dir and runs `bun publish --registry=<registry>`.
 *
 * Returns one result per tarball. Bails fast on the first failure.
 */
export declare const publishTarballs: (
	input: IPublishTarballsInput,
) => Promise<readonly IPublishTarballResult[]>;
