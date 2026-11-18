import { describe, expect, it } from 'vitest';

import { toolCancellationContext } from '../../../../src/lib/project/tool-cancellation-context.helper';

describe('toolCancellationContext', () => {
	it('[<100ms] uses the abort reason message', () => {
		const controller = new AbortController();
		controller.abort(new Error('user stopped'));
		const context = toolCancellationContext(controller.signal);
		expect(context.reason).toBe('user stopped');
		expect(context.nextAction).toContain('Retry');
	});

	it('[<100ms] stringifies a non-error reason', () => {
		const controller = new AbortController();
		controller.abort('Error: plain stop');
		expect(toolCancellationContext(controller.signal).reason).toBe(
			'plain stop',
		);
	});

	it('[<100ms] falls back when there is no signal or the reason is empty', () => {
		expect(toolCancellationContext(undefined).reason).toBe(
			'tool invocation aborted',
		);
		const controller = new AbortController();
		controller.abort('');
		expect(toolCancellationContext(controller.signal).reason).toBe(
			'tool invocation aborted',
		);
	});
});
