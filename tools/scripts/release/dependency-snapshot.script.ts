/**
 * dependency-snapshot.script.ts — the dependency-graph snapshot of what
 * the checkout installs, built from bun.lock.
 *
 * GitHub's automatic graph does not refresh from this repository's
 * bun.lock: on 2026-10-23 it still read a 1.31.0 SDK two weeks after main
 * pinned 1.32.0, and Dependabot kept six alerts open. Submitting this
 * snapshot on each push to main (dependency-snapshot.yml) makes the alerts
 * follow what main resolves.
 *
 *   bun tools/scripts/release/dependency-snapshot.script.ts --sha=<sha> --ref=<ref>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type IScope = 'runtime' | 'development';

interface ILockWorkspace {
	readonly name?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly optionalDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

export interface IBunLock {
	readonly workspaces: Readonly<Record<string, ILockWorkspace>>;
	readonly packages: Readonly<Record<string, readonly unknown[]>>;
}

export interface ISnapshotDependency {
	readonly package_url: string;
	readonly relationship: 'direct';
	readonly scope: IScope;
}

export interface ISnapshotManifest {
	readonly name: string;
	readonly file: { readonly source_location: string };
	readonly resolved: Readonly<Record<string, ISnapshotDependency>>;
}

/** bun.lock is JSON with trailing commas. */
export const parseBunLock = (text: string): IBunLock =>
	JSON.parse(text.replace(/,(\s*[}\]])/gu, '$1')) as IBunLock;

/** The version bun resolved for `name` at the top of the tree. */
const resolvedVersion = (lock: IBunLock, name: string): string | undefined => {
	const entry = lock.packages[name]?.[0];
	if (typeof entry !== 'string') return undefined;
	const at = entry.lastIndexOf('@');
	const version = at > 0 ? entry.slice(at + 1) : '';
	return /^\d/u.test(version) ? version : undefined;
};

/** A package URL: the scope's `@` is percent-encoded, as purl requires. */
const purl = (name: string, version: string): string =>
	`pkg:npm/${name.replace(/^@/u, '%40')}@${version}`;

/**
 * One manifest per workspace, each external direct dependency with the
 * version bun resolved; workspace links and unresolved ranges are left out.
 */
export const snapshotManifests = (
	lock: IBunLock,
): Readonly<Record<string, ISnapshotManifest>> => {
	const manifests: Record<string, ISnapshotManifest> = {};
	for (const [dir, workspace] of Object.entries(lock.workspaces)) {
		const location = dir === '' ? 'package.json' : `${dir}/package.json`;
		const resolved: Record<string, ISnapshotDependency> = {};
		const add = (
			ranges: Readonly<Record<string, string>> | undefined,
			scope: IScope,
		): void => {
			for (const [name, range] of Object.entries(ranges ?? {})) {
				if (
					range.startsWith('workspace:') ||
					resolved[name] !== undefined
				)
					continue;
				const version = resolvedVersion(lock, name);
				if (version === undefined) continue;
				resolved[name] = {
					package_url: purl(name, version),
					relationship: 'direct',
					scope,
				};
			}
		};
		add(workspace.dependencies, 'runtime');
		add(workspace.optionalDependencies, 'runtime');
		add(workspace.peerDependencies, 'runtime');
		add(workspace.devDependencies, 'development');
		manifests[location] = {
			name: location,
			file: { source_location: location },
			resolved,
		};
	}
	return manifests;
};

/** The payload of POST /repos/{owner}/{repo}/dependency-graph/snapshots. */
export const dependencySnapshot = (input: {
	readonly lock: IBunLock;
	readonly sha: string;
	readonly ref: string;
	readonly runId: string;
	readonly scanned: string;
}) => ({
	version: 0,
	sha: input.sha,
	ref: input.ref,
	job: { correlator: 'delendai-bun-lock', id: input.runId },
	detector: {
		name: 'delendai-bun-lock',
		version: '1.0.0',
		url: 'https://github.com/CartagoGit/DelendAI',
	},
	scanned: input.scanned,
	manifests: snapshotManifests(input.lock),
});

const flag = (name: string): string | undefined =>
	process.argv
		.find((arg) => arg.startsWith(`--${name}=`))
		?.slice(name.length + 3);

if (import.meta.main) {
	const sha = flag('sha');
	const ref = flag('ref');
	if (sha === undefined || ref === undefined) {
		console.error(
			'usage: dependency-snapshot --sha=<sha> --ref=<ref> [--run-id=<id>]',
		);
		process.exit(2);
	}
	const lock = parseBunLock(
		readFileSync(join(process.cwd(), 'bun.lock'), 'utf8'),
	);
	console.log(
		JSON.stringify(
			dependencySnapshot({
				lock,
				sha,
				ref,
				runId: flag('run-id') ?? `local-${Date.now()}`,
				scanned: new Date().toISOString(),
			}),
		),
	);
}
