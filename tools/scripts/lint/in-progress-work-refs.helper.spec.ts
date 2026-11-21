/**
 * in-progress-work-refs.helper.spec.ts — the queue never reaps the work
 * branch of a proposal that is still in progress.
 */
import { describe, expect, it } from 'vitest';

import {
	inProgressOrUnknown,
	keepInProgressWorkRefs,
	onceRead,
} from './in-progress-work-refs.helper';

const WIP = 'delendai/wip/claude-opus-5-5/implement/f00761-all-g1/plugin';
const DONE = 'delendai/wip/claude-opus-5-5/create/x00897-all-g1/handshake';
const PUBLICATION =
	'delendai/pr/claude-opus-5-5/create/x00897-all-g1/handshake';

describe('keepInProgressWorkRefs', () => {
	const split = (
		inProgress: ReadonlySet<string>,
		landed: ReadonlySet<string> = new Set(),
	) =>
		keepInProgressWorkRefs({
			reapable: [
				{ name: WIP },
				{ name: DONE },
				{ name: PUBLICATION },
				{ name: 'delendai/wip/unreadable' },
			],
			workPrefix: 'delendai/wip/',
			idOf: (name) => /\/([a-z]\d{5})-/u.exec(name)?.[1],
			tipOf: (name) =>
				name === DONE
					? 'sha-done'
					: name === WIP
						? 'sha-wip'
						: undefined,
			integration: 'sha-trunk',
			landed: (sha) => landed.has(sha),
			inProgressAt: (id, sha) => inProgress.has(`${id}@${sha}`),
		});

	it('keeps a work ref with work of its own whose proposal is in progress at its tip', () => {
		const { reapable, kept } = split(new Set(['f00761@sha-wip']));
		expect(kept.map((verdict) => verdict.name)).toEqual([WIP]);
		expect(reapable.map((verdict) => verdict.name)).toEqual([
			DONE,
			PUBLICATION,
			'delendai/wip/unreadable',
		]);
	});

	it('reaps what is finished: a publication, or a proposal that left in progress', () => {
		const { kept } = split(new Set(['x00897@sha-done-elsewhere']));
		expect(kept).toEqual([]);
	});

	it('judges a landed ref by the integration branch, not by its tip', () => {
		const closedElsewhere = split(
			new Set(['f00761@sha-wip']),
			new Set(['sha-wip']),
		);
		expect(closedElsewhere.kept).toEqual([]);
		const stillOpen = split(
			new Set(['f00761@sha-trunk']),
			new Set(['sha-wip']),
		);
		expect(stillOpen.kept.map((verdict) => verdict.name)).toEqual([WIP]);
	});
});

describe('onceRead', () => {
	it('reads once and answers the same, a failure included', () => {
		let calls = 0;
		const value = onceRead(() => ++calls);
		expect([value(), value()]).toEqual([1, 1]);
		const failing = onceRead(() => {
			calls += 1;
			throw new Error('rate limited');
		});
		expect(failing).toThrow('rate limited');
		expect(failing).toThrow('rate limited');
		expect(calls).toBe(2);
	});
});

describe('inProgressOrUnknown', () => {
	it('reads the folder, and says no only when the forge has no such folder', () => {
		expect(
			inProgressOrUnknown('f00763', () => ['f00763-a-delegated-task.md']),
		).toBe(true);
		expect(
			inProgressOrUnknown('f00763', () => ['x00901-findings.md']),
		).toBe(false);
		expect(
			inProgressOrUnknown('f00763', () => {
				throw Object.assign(new Error('Command failed'), {
					stderr: 'gh: Not Found (HTTP 404)',
				});
			}),
		).toBe(false);
	});

	it('keeps a ref it cannot tell about', () => {
		expect(
			inProgressOrUnknown('f00763', () => {
				throw Object.assign(new Error('Command failed'), {
					stderr: 'API rate limit exceeded (HTTP 403)',
				});
			}),
		).toBe(true);
		expect(
			inProgressOrUnknown('f00763', () => {
				throw 'network down';
			}),
		).toBe(true);
	});
});
