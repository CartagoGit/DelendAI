import { describe, expect, it } from 'vitest';

import { buildReviewThisDiffPrompt } from './review-diff';

const render = buildReviewThisDiffPrompt('prompts-pack').template;

describe('review-this-diff', () => {
	it('names the commit range from the refs it is given', () => {
		expect(render({ base: 'a', head: 'b' })).toContain('a..b');
		expect(render({ base: 'a' })).toContain('a..HEAD');
		expect(render({ head: 'b' })).toContain('HEAD~1..b');
	});

	it('reviews the local diff when no ref is given', () => {
		const text = render({});
		expect(text).toContain('working-tree or staged diff');
		expect(text).toContain('`delendai_git_diff`');
	});
});
