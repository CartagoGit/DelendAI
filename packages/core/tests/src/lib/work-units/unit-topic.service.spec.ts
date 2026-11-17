/**
 * unit-topic.service.spec.ts — a unit entered with no topic is named for
 * what it is.
 */
import { describe, expect, it } from 'vitest';

import { MAX_WORK_TOPIC_LENGTH } from '@delendai/core/lib/contracts/constants/work-topic.constant';
import { pullRequestText } from '@delendai/core/lib/work-units/publication-pull-request.service';
import { derivedTopic } from '@delendai/core/lib/work-units/unit-topic.service';

describe('derivedTopic', () => {
	it('[<10ms] names every review pack the same, whatever it reviews', () => {
		expect(
			derivedTopic({
				kind: 'review',
				proposal: 'batch',
				documentPath: undefined,
			}),
		).toBe('verdicts');
	});

	it("[<10ms] takes the words of the proposal's title for any other unit", () => {
		expect(
			derivedTopic({
				kind: 'implement',
				proposal: 'x00001',
				documentPath: 'docs/items/ready/x00001-a-thing-that-works.md',
			}),
		).toBe('a-thing-that-works');
	});

	it('[<10ms] cuts a long title between words', () => {
		const topic = derivedTopic({
			kind: 'implement',
			proposal: 'x00001',
			documentPath:
				'docs/items/ready/x00001-a-review-swarm-leaves-verdicts-that-can-be-checked-and-loses-none.md',
		});
		expect(topic.length).toBeLessThanOrEqual(MAX_WORK_TOPIC_LENGTH);
		expect(topic).toBe('a-review-swarm-leaves-verdicts-that-can-be');
	});

	it('[<10ms] falls back to the plain word when the proposal has no document', () => {
		expect(
			derivedTopic({
				kind: 'implement',
				proposal: 'x00001',
				documentPath: undefined,
			}),
		).toBe('work');
	});
});

describe('the title of a pull request with several deliveries', () => {
	it('[<10ms] names them by the oldest delivery, with no count', () => {
		const text = pullRequestText(
			[
				'fix(work): third',
				'chore(generated): recompute the catalog',
				'fix(work): second',
				'fix(cli): first',
			],
			'branch',
			'fallback',
		);
		expect(text.title).toBe('fix(repo): first');
	});

	it('[<10ms] keeps a single delivery as it is', () => {
		expect(
			pullRequestText(['fix(cli): only'], 'branch', 'fallback').title,
		).toBe('fix(repo): only');
	});
});
