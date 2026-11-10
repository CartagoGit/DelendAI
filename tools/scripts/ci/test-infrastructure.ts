/**
 * test-infrastructure.ts — the specs a change to the shared test setup
 * reaches.
 *
 * Every spec runs under the root vitest configuration, loads the setup
 * files it names (and whatever they import), and resolves its imports
 * through the tsconfig paths, yet no spec imports any of them: neither the
 * touched specs nor the symbol analysis could see the reach. #1827 changed
 * a constant the agent-identity setup imports, and the specs that ran were
 * the few that import the constant themselves. What the setup reaches is
 * mapped here, once, for the touched scope and the analysis alike.
 */

/** The file that names the setup files every vitest project loads. */
export const SHARED_VITEST_CONFIG = 'vitest.shared.ts';

const SPEC = /\.(?:spec|test)\.tsx?$/u;
const CONFIG_NAME = String.raw`(?:vitest[\w.-]*\.[cm]?[jt]s|tsconfig[\w.-]*\.json)`;
/** A root runner or compiler configuration: every spec runs under it. */
const ROOT_CONFIG = new RegExp(`^${CONFIG_NAME}$`, 'u');
/** A workspace's own runner or compiler configuration. */
const WORKSPACE_CONFIG = new RegExp(`^([^/]+/[^/]+)/${CONFIG_NAME}$`, 'u');
/** The shared test kit's sources. */
const TEST_KIT_SOURCE = /^packages\/test-kit\/src\/.+\.tsx?$/u;
/** A path quoted in the shared config that names a setup file. */
const QUOTED_SETUP = /['"`]([\w./-]+setup\.ts)['"`]/gu;

/** Whether a changed path is a source of `@delendai/test-kit`. */
export const isTestKitSource = (path: string): boolean =>
	TEST_KIT_SOURCE.test(path);

/**
 * The tracked setup files the shared config names, read from its text so
 * the list is never written twice. Sorted, without duplicates. Pure.
 */
export const setupFilesOf = (
	sharedConfig: string | undefined,
	tracked: readonly string[],
): readonly string[] => {
	const known = new Set(tracked);
	return [
		...new Set(
			[...(sharedConfig ?? '').matchAll(QUOTED_SETUP)]
				.map((match) => match[1] ?? '')
				.filter((path) => known.has(path)),
		),
	].sort();
};

/**
 * The specs the change reaches through the shared test setup. Every spec
 * for a root vitest config or tsconfig, or a change to a setup file or
 * anything it imports; a workspace's specs for its own vitest config or
 * tsconfig; the specs a test-kit change reaches. Sorted. Pure.
 */
export const testInfrastructureSpecs = (input: {
	readonly changed: readonly string[];
	/** Every tracked spec. */
	readonly specs: readonly string[];
	/** The setup files and every file they import, transitively. */
	readonly setupClosure: ReadonlySet<string>;
	/** The files the test-kit changes reach through the module graph. */
	readonly kitReached: ReadonlySet<string>;
}): readonly string[] => {
	const specs = input.specs.filter((file) => SPEC.test(file));
	if (
		input.changed.some(
			(path) => ROOT_CONFIG.test(path) || input.setupClosure.has(path),
		)
	)
		return [...specs].sort();
	const workspaces = input.changed.flatMap((path) => {
		const workspace = WORKSPACE_CONFIG.exec(path)?.[1];
		return workspace === undefined ? [] : [`${workspace}/`];
	});
	return specs
		.filter(
			(spec) =>
				input.kitReached.has(spec) ||
				workspaces.some((prefix) => spec.startsWith(prefix)),
		)
		.sort();
};
