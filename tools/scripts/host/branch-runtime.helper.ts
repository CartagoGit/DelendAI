/**
 * branch-runtime.helper.ts — a project picks the delendai branch it runs.
 *
 * Until delendai is on a registry, a project's MCP entry points at this
 * repository's host script, so it ran whatever this checkout held and
 * restarted every time work landed here. `--branch=<name>` runs that branch
 * instead, from a detached worktree delendai keeps in its own cache: the
 * checkout stays where it is, and only that branch moving can restart the
 * server. A branch that does not exist falls back to the checkout's code,
 * and says so.
 *
 * `--version=<semver>` pins a release instead: it runs the tag of that
 * version from its own cached tree. A tag does not move, so nothing ever
 * restarts it. A version with no tag is refused, never replaced by the
 * checkout's code, and so are `--branch` and `--version` together.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withFileMutex } from '@delendai/core/runtime';

const BRANCH_FLAG = '--branch=';
const RUNTIME_DIR = '.cache/delendai/branch-runtime';
const HOST_SCRIPT = 'tools/scripts/host/host-server.script.ts';
const VERSION_FLAG = '--version=';
/** The one place that says how a release is tagged: `v0.3.0`. */
export const RELEASE_TAG_PREFIX = 'v';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/u;
/** `@` cannot start a branch name here, so a release tree never meets a branch tree. */
const RELEASE_TREE_PREFIX = 'release@';
const NEAREST_TAGS_EACH_SIDE = 2;
const SAFE_BRANCH = /^[\w][\w./-]*$/u;

type TRun = (
	command: string,
	args: readonly string[],
	cwd: string,
) => string | undefined;

const runQuietly: TRun = (command, args, cwd) => {
	try {
		return execFileSync(command, [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/** The branch asked for, without its quotes, when there is one. */
export const branchFlag = (argv: readonly string[]): string | undefined => {
	const value = argv
		.find((arg) => arg.startsWith(BRANCH_FLAG))
		?.slice(BRANCH_FLAG.length)
		.replace(/^["']|["']$/gu, '');
	return value === undefined || value.length === 0 ? undefined : value;
};

export const withoutBranchFlag = (argv: readonly string[]): readonly string[] =>
	argv.filter((arg) => !arg.startsWith(BRANCH_FLAG));

/** The version asked for, without its quotes. An empty `--version=` is kept so it is refused. */
export const versionFlag = (argv: readonly string[]): string | undefined =>
	argv
		.find((arg) => arg.startsWith(VERSION_FLAG))
		?.slice(VERSION_FLAG.length)
		.replace(/^["']|["']$/gu, '');

/** What the child host is given: neither flag that chose the runtime. */
export const withoutRuntimeFlags = (
	argv: readonly string[],
): readonly string[] =>
	argv.filter(
		(arg) => !arg.startsWith(BRANCH_FLAG) && !arg.startsWith(VERSION_FLAG),
	);

export type IRuntimePin =
	| { readonly kind: 'checkout' }
	| { readonly kind: 'branch'; readonly branch: string }
	| { readonly kind: 'version'; readonly version: string }
	| { readonly kind: 'refused'; readonly reason: string };

/** Which runtime the arguments ask for; both flags, or a malformed version, are refused. */
export const runtimePin = (argv: readonly string[]): IRuntimePin => {
	const branch = branchFlag(argv);
	const version = versionFlag(argv);
	if (branch !== undefined && version !== undefined)
		return {
			kind: 'refused',
			reason: `--branch=${branch} and --version=${version} together: a project runs one branch or one release, not both. Keep one of them.`,
		};
	if (version !== undefined) {
		if (!SEMVER.test(version))
			return {
				kind: 'refused',
				reason: `--version="${version}" is not a semantic version. Write it as MAJOR.MINOR.PATCH, for example --version=0.3.0.`,
			};
		return { kind: 'version', version };
	}
	return branch === undefined
		? { kind: 'checkout' }
		: { kind: 'branch', branch };
};

export const releaseTag = (version: string): string =>
	`${RELEASE_TAG_PREFIX}${version}`;

const versionParts = (version: string): readonly number[] | undefined => {
	const match = SEMVER.exec(version);
	return match === null
		? undefined
		: [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (a: readonly number[], b: readonly number[]): number =>
	a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

/** The tags just below and just above `version`, for a refusal that says what exists. */
export const nearestReleaseTags = (
	version: string,
	tags: readonly string[],
): readonly string[] => {
	const wanted = versionParts(version);
	if (wanted === undefined) return [];
	const known = tags
		.filter((tag) => tag.startsWith(RELEASE_TAG_PREFIX))
		.flatMap((tag) => {
			const parts = versionParts(tag.slice(RELEASE_TAG_PREFIX.length));
			return parts === undefined ? [] : [{ tag, parts }];
		})
		.sort((a, b) => compareVersions(a.parts, b.parts));
	const below = known.filter((k) => compareVersions(k.parts, wanted) < 0);
	const above = known.filter((k) => compareVersions(k.parts, wanted) > 0);
	return [
		...below.slice(-NEAREST_TAGS_EACH_SIDE),
		...above.slice(0, NEAREST_TAGS_EACH_SIDE),
	].map((k) => k.tag);
};

export type IRuntimeResolution =
	| { readonly ok: true; readonly script: string; readonly label: string }
	| { readonly ok: false; readonly reason: string };

/** Makes `tree` hold `sha`, detached, with its dependencies installed. */
const prepareTree = (
	root: string,
	tree: string,
	sha: string,
	run: TRun,
): string | undefined => {
	if (existsSync(tree)) {
		run('git', ['checkout', '--quiet', '--detach', sha], tree);
	} else {
		run('git', ['worktree', 'add', '--quiet', '--detach', tree, sha], root);
	}
	if (!existsSync(join(tree, HOST_SCRIPT))) return undefined;
	// Scripts off: an install script once rewrote the shared git config.
	run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], tree);
	return join(tree, HOST_SCRIPT);
};

const shortSha = (sha: string): string => sha.slice(0, 9);

/**
 * The seam for a delendai installed from npm, which has no tags to check
 * out. The installed package is the only release it can run today, so a
 * version equal to it runs in place; any other needs the package fetched
 * at that version (a cache of `@delendai/core@<version>`), which is not
 * wired yet.
 */
export const npmVersionHostScript = (
	root: string,
	version: string,
	hostScript: string,
): IRuntimeResolution => {
	let installed: string | undefined;
	try {
		const manifest = JSON.parse(
			readFileSync(join(root, 'package.json'), 'utf8'),
		) as { version?: unknown };
		installed =
			typeof manifest.version === 'string' ? manifest.version : undefined;
	} catch {
		installed = undefined;
	}
	if (installed === version)
		return {
			ok: true,
			script: hostScript,
			label: `npm package @delendai/core ${version}`,
		};
	return {
		ok: false,
		reason: `--version=${version}: this delendai is installed from npm at ${installed ?? 'an unknown version'}, and running another release from npm is not wired yet (it needs @delendai/core@${version} fetched into a cache). Install that version, or run delendai from a checkout.`,
	};
};

/**
 * The host script of the release `version`, from its own tree. A version
 * with no tag is refused: nothing else stands in for a release.
 */
export const versionHostScript = async (
	root: string,
	version: string,
	run: TRun = runQuietly,
): Promise<IRuntimeResolution> => {
	const tag = releaseTag(version);
	if (!existsSync(join(root, '.git'))) {
		return npmVersionHostScript(root, version, join(root, HOST_SCRIPT));
	}
	// Offline a project still starts, on the tags this clone already holds.
	run(
		'git',
		['fetch', '--quiet', 'origin', `refs/tags/${tag}:refs/tags/${tag}`],
		root,
	);
	const sha = run(
		'git',
		['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`],
		root,
	);
	if (sha === undefined || sha.length === 0) {
		const tags = (
			run('git', ['tag', '--list', `${RELEASE_TAG_PREFIX}*`], root) ?? ''
		)
			.split('\n')
			.filter((name) => name.length > 0);
		const near = nearestReleaseTags(version, tags);
		return {
			ok: false,
			reason: `--version=${version}: there is no tag ${tag}. ${
				near.length === 0
					? 'This clone has no release tags.'
					: `The nearest tags are ${near.join(', ')}.`
			}`,
		};
	}
	mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
	const name = `${RELEASE_TREE_PREFIX}${tag}`;
	const script = await withFileMutex(
		join(root, RUNTIME_DIR, `${name}.lock`),
		async () => prepareTree(root, join(root, RUNTIME_DIR, name), sha, run),
	);
	return script === undefined
		? {
				ok: false,
				reason: `--version=${version}: tag ${tag} holds no ${HOST_SCRIPT}, so it cannot be run.`,
			}
		: { ok: true, script, label: `release ${tag} (${shortSha(sha)})` };
};

/** What the server says it runs, once, on stderr at startup. */
export const runtimeReport = (label: string): string =>
	`[delendai] running ${label}\n`;

/** The label of a branch run: the branch and the commit its tree holds. */
export const branchLabel = (
	branch: string,
	script: string,
	run: TRun = runQuietly,
): string => {
	const tree = script.slice(0, script.length - HOST_SCRIPT.length - 1);
	const sha = run('git', ['rev-parse', 'HEAD'], tree);
	return `branch ${branch}${sha === undefined || sha.length === 0 ? '' : ` (${shortSha(sha)})`}`;
};

/** The host script of `branch`, up to date; `undefined` when there is no such branch. */
const updatedHostScript = (
	root: string,
	branch: string,
	run: TRun,
): string | undefined => {
	// Offline a project still starts, on what this clone last saw.
	run('git', ['fetch', '--quiet', 'origin', branch], root);
	const sha =
		run('git', ['rev-parse', '-q', '--verify', `origin/${branch}`], root) ??
		run('git', ['rev-parse', '-q', '--verify', branch], root);
	if (sha === undefined || sha.length === 0) return undefined;
	const tree = join(root, RUNTIME_DIR, branch.replaceAll('/', '-'));
	return prepareTree(root, tree, sha, run);
};

/**
 * Projects on different branches never meet: each branch has its own tree.
 * Two on one branch can start together, and one of them must not run a tree
 * the other is still installing, so a branch is prepared by one at a time.
 */
export const branchHostScript = async (
	root: string,
	branch: string,
	run: TRun = runQuietly,
): Promise<string | undefined> => {
	if (!SAFE_BRANCH.test(branch)) return undefined;
	mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
	return withFileMutex(
		join(root, RUNTIME_DIR, `${branch.replaceAll('/', '-')}.lock`),
		async () => updatedHostScript(root, branch, run),
	);
};
