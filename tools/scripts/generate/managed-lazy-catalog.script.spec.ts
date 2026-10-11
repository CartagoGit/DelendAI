/**
 * Plugins that watch other plugins' calls activate at startup (x00682).
 */
import { describe, expect, it } from 'vitest';

import { observesOtherPlugins } from './managed-lazy-catalog.script';

describe('observesOtherPlugins', () => {
	it('is true for a plugin with any tool-call observer or the logs sink', () => {
		for (const hook of [
			'onToolStart',
			'onToolCall',
			'onToolCancel',
			'logsSink',
		]) {
			expect(observesOtherPlugins({ [hook]: () => undefined })).toBe(
				true,
			);
		}
	});

	it('is false for a plugin that only serves its own tools', () => {
		expect(observesOtherPlugins({})).toBe(false);
	});
});
