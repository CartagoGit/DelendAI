/**
 * Plugins that watch other plugins' calls activate at startup (x00682).
 */
import { describe, expect, it } from 'vitest';

import z from 'zod';

import {
	needsStartupCheck,
	observesOtherPlugins,
	requireLoadedPlugins,
} from './managed-lazy-catalog.script';

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

describe('needsStartupCheck', () => {
	it('flags a plugin that checks the configuration or cannot run on empty options', () => {
		expect(needsStartupCheck({})).toBe(false);
		expect(
			needsStartupCheck({
				optionsSchema: z.object({ a: z.string().optional() }),
			}),
		).toBe(false);
		expect(
			needsStartupCheck({ optionsSchema: z.object({ a: z.string() }) }),
		).toBe(true);
		expect(needsStartupCheck({ validateConfiguration: () => [] })).toBe(
			true,
		);
	});
});

describe('requireLoadedPlugins', () => {
	it('fails when the repository has plugins and none loaded', () => {
		expect(() => requireLoadedPlugins(0, 37)).toThrow(/0 of 37/u);
	});

	it('accepts a load, and a repository that has no plugins', () => {
		expect(() => requireLoadedPlugins(37, 37)).not.toThrow();
		expect(() => requireLoadedPlugins(0, 0)).not.toThrow();
	});
});
