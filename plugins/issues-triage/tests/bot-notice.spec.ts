import { describe, expect, it } from 'vitest';

import {
	AUTOMATED_NOTICE,
	withBotNotice,
} from '../src/lib/bot-notice.constant';

describe('withBotNotice', () => {
	it('prepends the machine-disclosure notice', () => {
		const comment = withBotNotice('Fixed in #1');
		expect(comment).toContain(AUTOMATED_NOTICE);
		expect(comment).toContain('@delendai/issues-triage');
		expect(comment).toContain('Fixed in #1');
	});

	it('keeps the notice on its own block above the body', () => {
		const comment = withBotNotice('line one\nline two');
		expect(comment.indexOf('line one')).toBeGreaterThan(
			comment.indexOf('Automated response'),
		);
		expect(comment).toContain('> line one');
		expect(comment).toContain('> line two');
	});
});
