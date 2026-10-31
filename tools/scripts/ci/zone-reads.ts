/**
 * zone-reads.ts — which test zones a change outside every workspace can
 * break, from what each zone was observed to read.
 *
 * The module graph answers this for code inside the workspaces. It cannot
 * for a file a spec READS instead of importing: the proposals under
 * `docs/delendai/proposals`, `AGENT-BOOTSTRAP.md`, a root config. Until
 * now any such change ran every zone, so a pull request that only edited a
 * proposal paid for all eleven shards. The map records, per zone, the root
 * files it read and the root directories it listed during a full run, and
 * a change reaches a zone only through something that zone touched.
 *
 * Conservative where it could be wrong:
 * - no map, or an unreadable one: run everything;
 * - a file at the repository root, or under `.github/`: run everything
 *   (configuration can affect any zone in ways no read shows), except a
 *   workflow whose edit leaves the test-running jobs as they were, which
 *   reaches only the zones that read it. Every workflow edit used to run
 *   all eleven shards: #912 changed one trigger of `ci.yml` and a lint
 *   script, and paid eleven minutes for the proposals zone alone;
 * - except prose: a root `*.md`, the licence or the mailmap, and what
 *   `.github/` holds besides workflows and actions (agent briefs, the
 *   security policy, the projected forge settings), configure no tool. A
 *   spec reaches them only by reading them, which the map records, so
 *   they reach the zones that read them. Configuration a child process
 *   reads (`delendai.config.json`) is not prose: the recorder sees the
 *   test workers only, so it still runs everything;
 * - a changed file reaches a zone that read it;
 * - a file added or removed reaches a zone that listed its directory, so a
 *   new file in a folder a zone scans still reaches that zone;
 * - a file under a zone's own paths reaches that zone.
 *
 * Listing a directory depends on which files it holds, not on what they
 * say. The first map also sent every change to any zone that listed a
 * directory ABOVE it, and `core`, `plugins` and `tools` list `docs/` and
 * `tools/`: a pull request that edited two lint scripts and a proposal ran
 * all eleven shards (#648, 2026-09-29).
 */
import { dirname } from 'node:path';

import { parseWorkflowYaml, type YamlValue } from './workflow-yaml';
import { TEST_RUNNER_KEYS } from './test-zones.constant';
import type { IRootChange, IZoneReadMap } from './test-zones.interface';

/** A workflow definition, as opposed to anything else under `.github/`. */
export const isWorkflowFile = (path: string): boolean =>
	/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path);

/**
 * A root file, or something under `.github/` that may change how specs
 * run: nothing can say which zones it reaches.
 */
export const runsEverything = (change: IRootChange): boolean =>
	!isProse(change.path) &&
	!(change.path === ROOT_MANIFEST && change.scriptsOnly === true) &&
	(!change.path.includes('/') ||
		(change.path.startsWith('.github/') &&
			!(isWorkflowFile(change.path) && change.runnerChanged === false)));

/** The root package manifest, whose scripts-only edits reach their readers. */
export const ROOT_MANIFEST = 'package.json';

/**
 * Scripts that change how every spec runs or how the tree is installed: a
 * test runner (`test`, `test:shard`, ...) or an install hook.
 */
const RUNNER_SCRIPT = /^(test|pre|post|prepare)/u;

const withoutScripts = (manifest: Record<string, unknown>): string => {
	const { scripts: _scripts, ...rest } = manifest;
	return JSON.stringify(rest);
};

/**
 * Whether the root manifest changed only in scripts that no test run or
 * install uses. Dependencies change which code every import loads, so any
 * other change — or a side that is missing or does not parse — is not.
 */
export const onlyScriptsChanged = (
	before: string | undefined,
	after: string | undefined,
): boolean => {
	if (before === undefined || after === undefined) return false;
	let old: Record<string, unknown>;
	let next: Record<string, unknown>;
	try {
		old = JSON.parse(before) as Record<string, unknown>;
		next = JSON.parse(after) as Record<string, unknown>;
	} catch {
		return false;
	}
	if (withoutScripts(old) !== withoutScripts(next)) return false;
	const scripts = (manifest: Record<string, unknown>) =>
		(manifest.scripts ?? {}) as Record<string, unknown>;
	const names = new Set([
		...Object.keys(scripts(old)),
		...Object.keys(scripts(next)),
	]);
	return [...names]
		.filter((name) => scripts(old)[name] !== scripts(next)[name])
		.every((name) => !RUNNER_SCRIPT.test(name));
};

/** A root or `.github/` file that only a spec reading it can be affected by. */
export const isProse = (path: string): boolean =>
	path.includes('/')
		? path.startsWith('.github/') &&
			!path.startsWith('.github/workflows/') &&
			!path.startsWith('.github/actions/')
		: /\.md$/u.test(path) || path === 'LICENSE' || path === '.mailmap';

const asRecord = (value: YamlValue | undefined): Record<string, YamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, YamlValue>)
		: {};

/**
 * Whether an edit of the test workflow changes how the test zones run:
 * the jobs that plan, run and merge them, or what every job inherits.
 * A side that is missing or does not parse counts as a change.
 */
export const testRunnerChanged = (
	before: string | undefined,
	after: string | undefined,
): boolean => {
	if (before === undefined || after === undefined) return true;
	const runner = (raw: string): string => {
		const workflow = parseWorkflowYaml(raw);
		const jobs = asRecord(workflow.jobs);
		return JSON.stringify([
			TEST_RUNNER_KEYS.topLevel.map((key) => workflow[key] ?? null),
			TEST_RUNNER_KEYS.jobs.map((key) => jobs[key] ?? null),
		]);
	};
	try {
		return runner(before) !== runner(after);
	} catch {
		return true;
	}
};

/**
 * The zones the changed root files can reach, or `undefined` for "run
 * everything".
 */
export const zonesReadingRootFiles = (
	changes: readonly IRootChange[],
	map: IZoneReadMap | undefined,
	ownPaths: Readonly<Record<string, readonly string[]>> = {},
): ReadonlySet<string> | undefined => {
	if (map === undefined) return undefined;
	const zones = new Set<string>();
	for (const change of changes) {
		if (runsEverything(change)) return undefined;
		const parent = dirname(change.path);
		for (const [zone, touched] of Object.entries(map.zones)) {
			if (
				touched.read.includes(change.path) ||
				(change.listing && touched.listed.includes(parent))
			) {
				zones.add(zone);
			}
		}
		for (const [zone, paths] of Object.entries(ownPaths)) {
			if (paths.some((dir) => change.path.startsWith(`${dir}/`))) {
				zones.add(zone);
			}
		}
	}
	return zones;
};

/**
 * The specs of each zone that read a changed path, or list the directory
 * of one that was added or removed. A zone the map holds no per-spec reads
 * for is left out: nobody can say which of its specs read the file.
 */
export const readersOf = (
	changes: readonly IRootChange[],
	map: IZoneReadMap | undefined,
): ReadonlyMap<string, readonly string[]> => {
	const readers = new Map<string, readonly string[]>();
	for (const [zone, touched] of Object.entries(map?.zones ?? {})) {
		if (touched.specs === undefined) continue;
		const specs = Object.entries(touched.specs)
			.filter(([, reads]) =>
				changes.some(
					(change) =>
						reads.read.includes(change.path) ||
						(change.listing &&
							reads.listed.includes(dirname(change.path))),
				),
			)
			.map(([spec]) => spec)
			.sort();
		readers.set(zone, specs);
	}
	return readers;
};

/** Parse a committed map; anything unexpected is "no map". */
export const parseZoneReadMap = (
	text: string | undefined,
): IZoneReadMap | undefined => {
	if (text === undefined) return undefined;
	try {
		const parsed = JSON.parse(text) as IZoneReadMap;
		if (
			parsed === null ||
			typeof parsed !== 'object' ||
			typeof parsed.zones !== 'object'
		) {
			return undefined;
		}
		for (const entry of Object.values(parsed.zones)) {
			if (!Array.isArray(entry.read) || !Array.isArray(entry.listed))
				return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
};
