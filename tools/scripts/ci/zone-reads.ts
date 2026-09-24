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
 * Conservative in every direction where it could be wrong:
 * - no map, or an unreadable one: run everything;
 * - a file at the repository root, or under `.github/`: run everything
 *   (configuration can affect any zone in ways no read shows);
 * - a changed file reaches a zone that read it, read anything else in the
 *   same directory, or listed any directory above it, so a new file in a
 *   folder a zone scans still reaches that zone.
 */
import { dirname } from 'node:path';

import type { IZoneReadMap } from './test-zones.interface';

const ancestorsOf = (path: string): string[] => {
	const out: string[] = [];
	let dir = dirname(path);
	while (dir !== '.' && dir !== '/' && dir !== '') {
		out.push(dir);
		dir = dirname(dir);
	}
	return out;
};

const runsEverything = (path: string): boolean =>
	!path.includes('/') || path.startsWith('.github/');

/**
 * The zones the changed root files can reach, or `undefined` for "run
 * everything".
 */
export const zonesReadingRootFiles = (
	rootFiles: readonly string[],
	map: IZoneReadMap | undefined,
): ReadonlySet<string> | undefined => {
	if (map === undefined) return undefined;
	const zones = new Set<string>();
	for (const file of rootFiles) {
		if (runsEverything(file)) return undefined;
		const parent = dirname(file);
		const ancestors = ancestorsOf(file);
		for (const [zone, touched] of Object.entries(map.zones)) {
			if (
				touched.readIn.includes(parent) ||
				ancestors.some((dir) => touched.listed.includes(dir))
			) {
				zones.add(zone);
			}
		}
	}
	return zones;
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
			if (!Array.isArray(entry.readIn) || !Array.isArray(entry.listed))
				return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
};
