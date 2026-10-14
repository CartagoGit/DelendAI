/**
 * in-progress-work-refs.helper.spec.ts — the queue never reaps the work
 * branch of a proposal that is still in progress.
 */
import { describe, expect, it } from 'vitest';

import { keepInProgressWorkRefs } from './in-progress-work-refs.helper';

const WIP = 'delendai/wip/claude-opus-5-5/implement/f00761-all-g1/plugin';
const DONE = 'delendai/wip/claude-opus-5-5/create/x00897-all-g1/handshake';
const PUBLICATION =
	'delendai/pr/claude-opus-5-5/create/x00897-all-g1/handshake';

describe('keepInProgressWorkRefs', () => {
	const split = (inProgress: ReadonlySet<string>) =>
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
			inProgressAt: (id, sha) => inProgress.has(`${id}@${sha}`),
		});

	it('keeps a work ref whose proposal is in progress at its tip', () => {
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
});
