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
 *
 * Only paths that exist in the repository are kept: the recorder also
 * sees the module resolver probing names that never existed (`zod.ts`,
 * `node:util.js`), which are not reads of anything. A path that is a
 * directory counts as listed; a file as a read in its directory.
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
import { dirname, join } from 'node:path';

import { repoRoot } from '../lib/repo-root';
import { ZONE_READ_MAP_PATH } from './test-zones.constant';
import type { IZoneReadMap } from './test-zones.interface';

/** Turn raw recorded paths per zone into the committed map. */
export const buildZoneReadMap = (
	raw: Readonly<Record<string, readonly string[]>>,
	kindOf: (path: string) => 'file' | 'dir' | undefined,
): IZoneReadMap => {
	const zones: Record<string, { readIn: string[]; listed: string[] }> = {};
	for (const [zone, paths] of Object.entries(raw).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const readIn = new Set<string>();
		const listed = new Set<string>();
		for (const path of paths) {
			const kind = kindOf(path);
			if (kind === 'file') readIn.add(dirname(path));
			else if (kind === 'dir') listed.add(path);
		}
		zones[zone] = {
			readIn: [...readIn].sort(),
			listed: [...listed].sort(),
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
	const dir =
		from ?? (process.argv.includes('--record') ? record(root) : undefined);
	if (dir === undefined) {
		console.error(
			'zone-reads: pass --record, or --from=<dir> with existing recordings.',
		);
		process.exit(1);
	}
	const map = buildZoneReadMap(readRecordings(dir), (path) => {
		const abs = join(root, path);
		if (!existsSync(abs)) return undefined;
		return statSync(abs).isDirectory() ? 'dir' : 'file';
	});
	writeFileSync(
		join(root, ZONE_READ_MAP_PATH),
		`${JSON.stringify(map, null, '\t')}\n`,
	);
	for (const [zone, touched] of Object.entries(map.zones)) {
		console.log(
			`${zone}: read in ${touched.readIn.length} root dir(s), listed ${touched.listed.length}`,
		);
	}
}
