/**
 * zone-reads.spec.ts — a change outside every workspace reaches only the
 * zones observed to read it.
 */
import { describe, expect, it } from 'vitest';

import type { IZoneReadMap } from './test-zones.interface';
import { parseZoneReadMap, zonesReadingRootFiles } from './zone-reads';

const MAP: IZoneReadMap = {
	zones: {
		proposals: {
			readIn: ['docs/delendai/proposals/ready/fixes'],
			listed: ['docs/delendai/proposals'],
		},
		core: {
			readIn: ['docs/delendai'],
			listed: [],
		},
		apps: { readIn: [], listed: [] },
	},
};

describe('zonesReadingRootFiles', () => {
	it('runs everything without a map', () => {
		expect(zonesReadingRootFiles(['docs/x.md'], undefined)).toBeUndefined();
	});

	it('runs everything for a file at the repository root or under .github', () => {
		expect(zonesReadingRootFiles(['package.json'], MAP)).toBeUndefined();
		expect(
			zonesReadingRootFiles(['.github/workflows/ci.yml'], MAP),
		).toBeUndefined();
	});

	it('reaches only the zone that reads the proposals, for a proposal edit', () => {
		expect(
			zonesReadingRootFiles(
				['docs/delendai/proposals/ready/fixes/x00001-a.md'],
				MAP,
			),
		).toEqual(new Set(['proposals']));
	});

	it('reaches a zone that lists a folder, for a file new in it', () => {
		// A new proposal was never read, but its folder was scanned.
		expect(
			zonesReadingRootFiles(
				['docs/delendai/proposals/ready/feats/f00999-new.md'],
				MAP,
			),
		).toEqual(new Set(['proposals']));
	});

	it('reaches a zone that read another file in the same directory', () => {
		expect(
			zonesReadingRootFiles(['docs/delendai/NEW-GUIDE.md'], MAP),
		).toEqual(new Set(['core']));
	});

	it('reaches no zone for a file no test reads', () => {
		expect(zonesReadingRootFiles(['docs/unread/notes.md'], MAP)).toEqual(
			new Set(),
		);
	});

	it('unions the zones of several files', () => {
		expect(
			zonesReadingRootFiles(
				[
					'docs/delendai/AGENT-BOOTSTRAP.md',
					'docs/delendai/proposals/review/x00002.md',
				],
				MAP,
			),
		).toEqual(new Set(['core', 'proposals']));
	});
});

describe('parseZoneReadMap', () => {
	it('reads a well-formed map', () => {
		expect(parseZoneReadMap(JSON.stringify(MAP))).toEqual(MAP);
	});

	it('treats anything else as no map at all', () => {
		expect(parseZoneReadMap(undefined)).toBeUndefined();
		expect(parseZoneReadMap('{ not json')).toBeUndefined();
		expect(parseZoneReadMap('null')).toBeUndefined();
		expect(
			parseZoneReadMap('{"zones":{"a":{"readIn":[]}}}'),
		).toBeUndefined();
	});
});
