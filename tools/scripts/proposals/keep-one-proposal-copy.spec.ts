import { describe, expect, it } from 'vitest';

import {
	KEEP_ONE_COPY_SUBJECT,
	keepOneProposalCopy,
	removedCopiesOf,
} from './keep-one-proposal-copy';

const REMOVED = { id: 'f1', from: 'ready/f1.md', kept: 'review/f1.md' };

describe('keepOneProposalCopy', () => {
	it('[<100ms] commits with the derived-fix subject only when a copy was removed', () => {
		const subjects: string[] = [];
		expect(
			keepOneProposalCopy(
				'.',
				(subject) => subjects.push(subject),
				() => `noise\n${JSON.stringify({ removed: [REMOVED] })}\n`,
			),
		).toEqual([REMOVED]);
		expect(subjects).toEqual([KEEP_ONE_COPY_SUBJECT]);
		expect(
			keepOneProposalCopy(
				'.',
				(subject) => subjects.push(subject),
				() => '{"removed":[]}',
			),
		).toEqual([]);
		expect(subjects).toHaveLength(1);
	});

	it('[<100ms] leaves the merge as it was when the script fails or prints nonsense', () => {
		const subjects: string[] = [];
		const commit = (subject: string) => subjects.push(subject);
		expect(
			keepOneProposalCopy('.', commit, () => {
				throw new Error('boom');
			}),
		).toEqual([]);
		expect(removedCopiesOf('not json')).toEqual([]);
		expect(removedCopiesOf('{}')).toEqual([]);
		expect(subjects).toEqual([]);
	});
});
