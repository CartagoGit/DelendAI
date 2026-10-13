import { describe, expect, it } from 'vitest';

import { renderPrComment } from './pr-comment';

describe('renderPrComment', () => {
	it('renders author and message', () => {
		const out = renderPrComment({
			author: 'copilot',
			message: 'CI is green now.',
		});
		expect(out).toContain('Author: copilot');
		expect(out).toContain('CI is green now.');
	});

	it('renders context when present', () => {
		const out = renderPrComment({
			message: 'Please re-check the latest push.',
			context: 'f00121 / failing lint job',
		});
		expect(out).toContain('Context: f00121 / failing lint job');
	});

	it('falls back to a generic author', () => {
		const out = renderPrComment({
			message: 'Please re-check the latest push.',
		});
		expect(out).toContain('Author: agent');
	});
});
