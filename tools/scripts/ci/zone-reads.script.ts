#!/usr/bin/env bun
/**
 * zone-reads.script.ts — build the map of what each test zone reads
 * outside the workspaces.
 *
 *   bun tools/scripts/ci/zone-reads.script.ts --record
 *       Run every zone with `DELENDAI_RECORD_READS`, then write the map.
 *   bun tools/scripts/ci/zone-reads.script.ts --from=<dir>
 *       Build the map from recordings already made, one sub-folder per
 *       zone, each holding the recorder's `reads-*.txt` files.
 *   bun tools/scripts/ci/zone-reads.script.ts --prune
 *       Rebuild the committed map from itself, keeping what still exists:
 *       the step a removed path needs, without re-running every zone.
 *
 * Only paths that exist in the repository are kept: the recorder also
 * sees the module resolver probing names that never existed (`zod.ts`,
 * `node:util.js`), which are not reads of anything. A path that is a
 * directory counts as listed; a file as read.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';
import { ZONE_READ_MAP_PATH } from './test-zones.constant';
import type { IZoneReadMap } from './test-zones.interface';

/** Turn raw recorded paths per zone into the committed map. */
export const buildZoneReadMap = (
	raw: Readonly<Record<string, readonly string[]>>,
	kindOf: (path: string) => 'file' | 'dir' | undefined,
): IZoneReadMap => {
	const zones: Record<
		string,
		{
			read: string[];
			listed: string[];
			specs?: Record<string, { read: string[]; listed: string[] }>;
		}
	> = {};
	for (const [zone, lines] of Object.entries(raw).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const read = new Set<string>();
		const listed = new Set<string>();
		const bySpec = new Map<
			string,
			{ read: Set<string>; listed: Set<string> }
		>();
		for (const line of lines) {
			// `spec<TAB>path`, or a bare path from a recording made before
			// reads were kept by spec.
			const tab = line.indexOf('\t');
			const spec = tab < 0 ? '' : line.slice(0, tab);
			const path = tab < 0 ? line : line.slice(tab + 1);
			const kind = kindOf(path);
			if (kind === undefined) continue;
			(kind === 'file' ? read : listed).add(path);
			if (spec.length === 0) continue;
			const entry = bySpec.get(spec) ?? {
				read: new Set(),
				listed: new Set(),
			};
			(kind === 'file' ? entry.read : entry.listed).add(path);
			bySpec.set(spec, entry);
		}
		zones[zone] = {
			read: [...read].sort(),
			listed: [...listed].sort(),
			...(bySpec.size === 0
				? {}
				: {
						specs: Object.fromEntries(
							[...bySpec.entries()]
								.sort(([a], [b]) => a.localeCompare(b))
								.map(([spec, entry]) => [
									spec,
									{
										read: [...entry.read].sort(),
										listed: [...entry.listed].sort(),
									},
								]),
						),
					}),
		};
	}
	return { zones };
};

const readRecordings = (dir: string): Record<string, string[]> => {
	const raw: Record<string, string[]> = {};
	for (const zone of readdirSync(dir)) {
		const zoneDir = join(dir, zone);
		if (!statSync(zoneDir).isDirectory()) continue;
		raw[zone] = readdirSync(zoneDir)
			.filter((name) => name.startsWith('reads-'))
			.flatMap((name) =>
				readFileSync(join(zoneDir, name), 'utf8').split('\n'),
			)
			.filter((line) => line.length > 0);
	}
	return raw;
};

/** The committed map's paths per zone, as if they had just been recorded. */
export const recordedPathsOf = (map: IZoneReadMap): Record<string, string[]> =>
	Object.fromEntries(
		Object.entries(map.zones).map(([zone, touched]) => [
			zone,
			[
				...touched.read,
				...touched.listed,
				...Object.entries(touched.specs ?? {}).flatMap(
					([spec, reads]) =>
						[...reads.read, ...reads.listed].map(
							(path) => `${spec}\t${path}`,
						),
				),
			],
		]),
	);

const record = (root: string): string => {
	const out = mkdtempSync(join(tmpdir(), 'zone-reads-'));
	const zones = execFileSync(
		'bun',
		['tools/scripts/ci/test-zones.script.ts', '--matrix'],
		{ cwd: root, encoding: 'utf8' },
	);
	const seen = new Set<string>();
	for (const job of JSON.parse(zones) as { name: string; paths: string }[]) {
		const zone = job.name.split(' ')[0] ?? job.name;
		if (seen.has(zone)) continue;
		seen.add(zone);
		const env: Record<string, string | undefined> = {
			...process.env,
			DELENDAI_RECORD_READS: join(out, zone),
		};
		for (const marker of ['CLAUDECODE', 'AI_AGENT', 'DELENDAI_AGENT_ID']) {
			delete env[marker];
		}
		execFileSync(
			'npx',
			['vitest', 'run', ...job.paths.split(/\s+/u), '--passWithNoTests'],
			{ cwd: root, env, stdio: 'ignore' },
		);
	}
	return out;
};

if (import.meta.main) {
	const root = repoRoot();
	const from = process.argv
		.find((arg) => arg.startsWith('--from='))
		?.slice(7);
	const prune = process.argv.includes('--prune');
	const dir =
		from ?? (process.argv.includes('--record') ? record(root) : undefined);
	if (dir === undefined && !prune) {
		console.error(
			'zone-reads: pass --record, --prune, or --from=<dir> with existing recordings.',
		);
		process.exit(1);
	}
	const raw =
		dir === undefined
			? recordedPathsOf(
					JSON.parse(
						readFileSync(join(root, ZONE_READ_MAP_PATH), 'utf8'),
					) as IZoneReadMap,
				)
			: readRecordings(dir);
	const map = buildZoneReadMap(raw, (path) => {
		const abs = join(root, path);
		if (!existsSync(abs)) return undefined;
		return statSync(abs).isDirectory() ? 'dir' : 'file';
	});
	writeFileSync(
		join(root, ZONE_READ_MAP_PATH),
		`${JSON.stringify(map, null, '\t')}\n`,
	);
	// In the layout the format gate holds the file to, so a run on a clean
	// tree reproduces the committed map byte for byte.
	execFileSync('npx', ['biome', 'format', '--write', ZONE_READ_MAP_PATH], {
		cwd: root,
		stdio: 'ignore',
	});
	for (const [zone, touched] of Object.entries(map.zones)) {
		console.log(
			`${zone}: read ${touched.read.length} root file(s), listed ${touched.listed.length} dir(s)`,
		);
	}
}
