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

import { followBranch } from './branch-follow.helper';
import type { IRuntimeState } from '@delendai/core/cli';
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

export type IRun = (
	command: string,
	args: readonly string[],
	cwd: string,
) => string | undefined;

const runQuietly: IRun = (command, args, cwd) => {
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
	| { readonly kind: 'malformed-version'; readonly version: string }
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
			return { kind: 'malformed-version', version };
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

/** The release tags among `tags`, lowest version first. */
const sortedReleases = (tags: readonly string[]) =>
	tags
		.filter((tag) => tag.startsWith(RELEASE_TAG_PREFIX))
		.flatMap((tag) => {
			const parts = versionParts(tag.slice(RELEASE_TAG_PREFIX.length));
			return parts === undefined ? [] : [{ tag, parts }];
		})
		.sort((a, b) => compareVersions(a.parts, b.parts));

/** The tags just below and just above `version`, for a refusal that says what exists. */
export const nearestReleaseTags = (
	version: string,
	tags: readonly string[],
): readonly string[] => {
	const wanted = versionParts(version);
	if (wanted === undefined) return [];
	const known = sortedReleases(tags);
	const below = known.filter((k) => compareVersions(k.parts, wanted) < 0);
	const above = known.filter((k) => compareVersions(k.parts, wanted) > 0);
	return [
		...below.slice(-NEAREST_TAGS_EACH_SIDE),
		...above.slice(0, NEAREST_TAGS_EACH_SIDE),
	].map((k) => k.tag);
};

/** A malformed version has no neighbours, so the newest releases stand in for them. */
export const newestReleaseTags = (tags: readonly string[]): readonly string[] =>
	sortedReleases(tags)
		.slice(-NEAREST_TAGS_EACH_SIDE * 2)
		.map((k) => k.tag);

const tagsNear = (near: readonly string[], lead: string): string =>
	near.length === 0
		? 'This clone has no release tags.'
		: `${lead} ${near.join(', ')}.`;

const releaseTagNames = (root: string, run: IRun): readonly string[] =>
	(run('git', ['tag', '--list', `${RELEASE_TAG_PREFIX}*`], root) ?? '')
		.split('\n')
		.filter((name) => name.length > 0);

/** The refusal for a version that is not MAJOR.MINOR.PATCH: it names the newest tags that exist. */
export const malformedVersionReason = (
	root: string,
	version: string,
	run: IRun = runQuietly,
): string =>
	`--version="${version}" is not a semantic version. Write it as MAJOR.MINOR.PATCH, for example --version=0.3.0. ${tagsNear(
		newestReleaseTags(releaseTagNames(root, run)),
		'The newest release tags are',
	)}`;

export type IRuntimeResolution =
	| { readonly ok: true; readonly script: string; readonly label: string }
	| { readonly ok: false; readonly reason: string };

/** Makes `tree` hold `sha`, detached, with its dependencies installed. */
const prepareTree = (
	root: string,
	tree: string,
	sha: string,
	run: IRun,
	keep = false,
): string | undefined => {
	if (existsSync(tree)) {
		// `keep`: the tree already followed origin (or refused to) and is not moved again.
		if (!keep) run('git', ['checkout', '--quiet', '--detach', sha], tree);
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
	run: IRun = runQuietly,
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
		const near = nearestReleaseTags(version, releaseTagNames(root, run));
		return {
			ok: false,
			reason: `--version=${version}: there is no tag ${tag}. ${tagsNear(near, 'The nearest tags are')}`,
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

const SHA_LENGTH = 12;

/**
 * What the tree at `tree` runs, read from git once: its release tag when
 * HEAD is exactly a release, else the branch (`branch` when the tree is
 * detached on a pinned branch) at its commit, how far it is from
 * `origin/<branch>`, and whether it holds uncommitted changes. This is the
 * only reader of git state for the boot summary, the status tool and the
 * editor tooltip.
 */
export const runtimeState = (
	tree: string,
	pinnedBranch: string | undefined,
	run: IRun = runQuietly,
	follow?: string,
): IRuntimeState | undefined => {
	const sha = run('git', ['rev-parse', 'HEAD'], tree);
	if (sha === undefined || sha.length === 0) return undefined;
	const tag = run(
		'git',
		['describe', '--exact-match', '--tags', 'HEAD'],
		tree,
	);
	if (tag !== undefined && tag.startsWith(RELEASE_TAG_PREFIX))
		return { kind: 'tag', tag, ahead: 0, behind: 0, dirty: false };
	const current = run('git', ['symbolic-ref', '-q', '--short', 'HEAD'], tree);
	const branch = (current?.length ?? 0) > 0 ? current : pinnedBranch;
	const counts = run(
		'git',
		[
			'rev-list',
			'--left-right',
			'--count',
			`HEAD...origin/${branch ?? ''}`,
		],
		tree,
	)?.split(/\s+/u);
	const dirty =
		(run('git', ['status', '--porcelain'], tree) ?? '').length > 0;
	return {
		kind: 'branch',
		...(branch === undefined ? {} : { branch }),
		sha12: sha.slice(0, SHA_LENGTH),
		ahead: Number(counts?.[0] ?? 0),
		behind: Number(counts?.[1] ?? 0),
		dirty,
		...(follow === undefined ? {} : { follow }),
	};
};

/** What the server says it runs, once, on stderr at startup. */
export const runtimeReport = (label: string): string =>
	`[delendai] running ${label}\n`;

/** The tree a host script belongs to. */
export const hostTree = (script: string): string =>
	script.slice(0, script.length - HOST_SCRIPT.length - 1);

/** The label of a branch run: the branch and the commit its tree holds. */
export const branchLabel = (
	branch: string,
	script: string,
	run: IRun = runQuietly,
): string => {
	const sha = run('git', ['rev-parse', 'HEAD'], hostTree(script));
	return `branch ${branch}${sha === undefined || sha.length === 0 ? '' : ` (${shortSha(sha)})`}`;
};

/** The host script of `branch`, up to date; `undefined` when there is no such branch. */
const updatedHostScript = (
	root: string,
	branch: string,
	run: IRun,
): IBranchRun | undefined => {
	// Offline a project still starts, on what this clone last saw.
	const fetched =
		run('git', ['fetch', '--quiet', 'origin', branch], root) !== undefined;
	const sha =
		run('git', ['rev-parse', '-q', '--verify', `origin/${branch}`], root) ??
		run('git', ['rev-parse', '-q', '--verify', branch], root);
	if (sha === undefined || sha.length === 0) return undefined;
	const tree = join(root, RUNTIME_DIR, branch.replaceAll('/', '-'));
	// A tree that exists follows origin by fast-forward only; a new one starts at it.
	const follow = existsSync(tree)
		? followBranch(tree, branch, sha, fetched, run)
		: fetched
			? {}
			: {
					note: 'fetching origin failed: serving what this clone last saw',
				};
	const script = prepareTree(root, tree, sha, run, existsSync(tree));
	return script === undefined
		? undefined
		: {
				script,
				tree,
				...(follow.note === undefined ? {} : { note: follow.note }),
			};
};

export interface IBranchRun {
	readonly script: string;
	readonly tree: string;
	/** Loud text for the boot summary when following origin was not a plain success. */
	readonly note?: string;
}

/**
 * Projects on different branches never meet: each branch has its own tree.
 * Two on one branch can start together, and one of them must not run a tree
 * the other is still installing, so a branch is prepared by one at a time.
 */
export const branchHostRun = async (
	root: string,
	branch: string,
	run: IRun = runQuietly,
): Promise<IBranchRun | undefined> => {
	if (!SAFE_BRANCH.test(branch)) return undefined;
	mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
	return withFileMutex(
		join(root, RUNTIME_DIR, `${branch.replaceAll('/', '-')}.lock`),
		async () => updatedHostScript(root, branch, run),
	);
};

/** The host script of `branch`, up to date; `undefined` when there is no such branch. */
export const branchHostScript = async (
	root: string,
	branch: string,
	run: IRun = runQuietly,
): Promise<string | undefined> =>
	(await branchHostRun(root, branch, run))?.script;
