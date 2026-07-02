/**
 * session-digest-recall.spec.ts (f00090 S3)
 *
 * The selector must pick the NEWEST `session-digest:*` note, ignore
 * non-digest notes, parse the topic, resolve timestamp ties stably, and
 * return null when there is nothing to rehydrate from.
 */
import { describe, expect, it } from 'vitest';

import { selectLatestSessionDigest } from '@mcp-vertex/memory/lib/services/session-digest-recall';
import type { ISessionDigestCandidate } from '@mcp-vertex/memory/lib/contracts/interfaces/session-digest-recall.interface';

const note = (
	title: string,
	createdAt: string,
	body = 'digest body',
): ISessionDigestCandidate => ({ title, body, createdAt });

describe('selectLatestSessionDigest (f00090 S3)', () => {
	it('returns null when there are no candidates', () => {
		expect(selectLatestSessionDigest([])).toBeNull();
	});

	it('returns null when no note carries the session-digest prefix', () => {
		expect(
			selectLatestSessionDigest([
				note('some-fact', '2026-07-02T10:00:00.000Z'),
				note('another-note', '2026-07-02T11:00:00.000Z'),
			]),
		).toBeNull();
	});

	it('picks the newest session digest and parses its topic', () => {
		const selection = selectLatestSessionDigest([
			note('session-digest:morning', '2026-07-02T08:00:00.000Z'),
			note('unrelated', '2026-07-02T23:00:00.000Z'),
			note('session-digest:afternoon', '2026-07-02T15:00:00.000Z'),
		]);
		expect(selection?.topic).toBe('afternoon');
		expect(selection?.title).toBe('session-digest:afternoon');
		expect(selection?.createdAt).toBe('2026-07-02T15:00:00.000Z');
	});

	it('resolves equal timestamps toward the later-positioned candidate (stable)', () => {
		const ts = '2026-07-02T12:00:00.000Z';
		const selection = selectLatestSessionDigest([
			note('session-digest:first', ts, 'first'),
			note('session-digest:second', ts, 'second'),
		]);
		expect(selection?.topic).toBe('second');
		expect(selection?.body).toBe('second');
	});

	it('is pure: identical input yields an identical selection', () => {
		const notes = [
			note('session-digest:a', '2026-07-01T00:00:00.000Z'),
			note('session-digest:b', '2026-07-02T00:00:00.000Z'),
		];
		expect(selectLatestSessionDigest(notes)).toEqual(
			selectLatestSessionDigest(notes),
		);
	});
});
