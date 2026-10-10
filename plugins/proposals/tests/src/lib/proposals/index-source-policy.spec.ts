import { describe, expect, it } from 'vitest';

import {
	compareIndexEntries,
	decideIndexSource,
} from '../../../../src/lib/proposals/index-source-policy';

const json = [
	{ id: 'f00001', file: 'done/f00001.md', status: 'done' },
	{ id: 'f00002', file: 'ready/f00002.md', status: 'ready' },
] as const;

describe('index source policy (f00535 S3)', () => {
	it('serves SQL only after metadata-backed parity', () => {
		const result = decideIndexSource({
			sql: [...json],
			json,
			metadata: { sourceCommit: 'abc123', logicalDigest: 'digest' },
		});
		expect(result.source).toBe('sql');
		expect(result.reason).toBe('parity');
		expect(result.entries).toEqual(json);
	});

	it('falls back to JSON on divergence', () => {
		const result = decideIndexSource({
			sql: [{ ...json[0], status: 'review' }],
			json,
			metadata: { sourceCommit: 'abc123', logicalDigest: 'digest' },
		});
		expect(result.source).toBe('json');
		expect(result.reason).toBe('divergence');
		expect(result.divergence).toEqual(['f00001', 'f00002']);
	});

	it('does not treat an unavailable or unmetadataed projection as empty', () => {
		expect(
			decideIndexSource({ sql: null, json, metadata: null }).reason,
		).toBe('unavailable');
		expect(
			decideIndexSource({ sql: [], json, metadata: null }).reason,
		).toBe('metadata-missing');
	});

	it('compares entries deterministically without reconciling', () => {
		expect(compareIndexEntries(json, [...json].reverse())).toEqual([]);
	});
});
