/**
 * An approved proposal closes by itself (x00700).
 */
import { describe, expect, it } from 'vitest';

import { readyToClose, refusalOf } from './close-approved-proposals.script';

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
