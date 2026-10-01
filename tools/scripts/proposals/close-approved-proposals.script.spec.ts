/**
 * An approved proposal closes by itself (x00700).
 */
import { describe, expect, it } from 'vitest';

import {
	ownPublications,
	ownWorkRefs,
	readyToClose,
	refusalOf,
} from './close-approved-proposals.script';

const doc = (frontmatter: string, body: string) =>
	`---\nid: x1\n${frontmatter}---\n\n# x1\n\n${body}`;
const approved = `### S1 — work

- **Status**: done
- review-implementer: claude-opus-5-5
- review-log: approved by glm-5.3-max — verified
`;

describe('readyToClose', () => {
	it('is ready when every slice is done and independently approved, with shipped-in', () => {
		expect(
			readyToClose(doc('shipped-in:\n  - "abc1234"\n', approved)),
		).toBe(true);
	});

	it('waits without shipped-in, for an unfinished slice, or for the owner', () => {
		expect(readyToClose(doc('', approved))).toBe(false);
		expect(
			readyToClose(
				doc(
					'shipped-in:\n  - "abc1234"\n',
					approved.replace('Status**: done', 'Status**: review'),
				),
			),
		).toBe(false);
		expect(
			readyToClose(
				doc(
					'shipped-in:\n  - "abc1234"\nowner-decision: pending\n',
					approved,
				),
			),
		).toBe(false);
	});

	it('waits for an approval by someone other than the implementer', () => {
		expect(
			readyToClose(
				doc(
					'shipped-in:\n  - "abc1234"\n',
					approved.replace('glm-5.3-max', 'claude-opus-5-5'),
				),
			),
		).toBe(false);
	});
});

describe('refusalOf (x00706)', () => {
	it('names the reason a transition printed', () => {
		const printed = Object.assign(new Error('Command failed'), {
			stdout: '{"ok":false,"error":"validate required","reason":"No validate run has been journalled."}\n',
			stderr: '',
		});
		expect(refusalOf(printed)).toBe(
			'validate required: No validate run has been journalled.',
		);
	});

	it('falls back to the last line printed, and never to nothing', () => {
		expect(
			refusalOf(
				Object.assign(new Error('x'), { stderr: 'a\nENOENT: gone\n' }),
			),
		).toBe('ENOENT: gone');
		expect(refusalOf(new Error('x'))).toBe('no reason printed');
	});
});

describe('ownPublications (x00710)', () => {
	const listing = [
		'aaa\trefs/heads/delendai/pr/delendai-queue/review/batch-all-g1/close-approved-1817',
		'bbb\trefs/heads/delendai/pr/claude-opus-5-5/implement/x00706-all-g1/t',
		'ccc\trefs/heads/delendai/wip/delendai-queue/review/batch-all-g1/close-approved-1900',
		'ddd\trefs/heads/develop',
		'',
	].join('\n');

	it("finds the closer's publications and nothing else", () => {
		const expected = [
			{
				ref: 'refs/heads/delendai/pr/delendai-queue/review/batch-all-g1/close-approved-1817',
				sha: 'aaa',
			},
		];
		expect(ownPublications(listing, 'delendai/pr/')).toEqual(expected);
		expect(ownPublications(listing, 'refs/heads/delendai/pr/')).toEqual(
			expected,
		);
	});

	it('finds none when the closer has no pull request open', () => {
		expect(
			ownPublications('ddd\trefs/heads/develop\n', 'delendai/pr/'),
		).toEqual([]);
	});
});

describe('ownWorkRefs (x00711)', () => {
	it('finds the backed-up units of the closer and nothing else', () => {
		const listing = [
			'aaa\trefs/heads/delendai/pr/delendai-queue/review/batch-all-g1/close-approved-1817',
			'bbb\trefs/heads/delendai/wip/delendai-queue/review/batch-all-g1/close-approved-1849',
			'ccc\trefs/heads/delendai/wip/glm-5.3-max/review/batch-all-g1/packs',
			'',
		].join('\n');
		for (const prefix of [
			'delendai/wip/',
			'heads/delendai/wip/',
			'refs/heads/delendai/wip/',
		]) {
			expect(ownWorkRefs(listing, prefix)).toEqual([
				'refs/heads/delendai/wip/delendai-queue/review/batch-all-g1/close-approved-1849',
			]);
		}
	});
});
