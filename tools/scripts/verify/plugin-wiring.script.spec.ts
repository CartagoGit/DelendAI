/**
 * plugin-wiring.script.spec.ts — the gate fails on an unwired plugin
 * nobody allowed, on a stale allowlist entry, and on measuring nothing.
 */
import { describe, expect, it } from 'vitest';

import type { IPluginWiringReport } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';

import { judgeWiring } from './plugin-wiring.script';

const report = (pluginId: string, fullyWired: boolean) =>
	fakePartial<IPluginWiringReport>({ pluginId, fullyWired });

describe('judgeWiring', () => {
	it('passes a wired plugin and an allowed unwired one', () => {
		expect(
			judgeWiring([report('a', true), report('b', false)], { b: 'why' }),
		).toEqual([]);
	});

	it('fails an unwired plugin that is not on the allowlist', () => {
		expect(judgeWiring([report('a', false)], {})).toEqual([
			'a is not wired and is not on the allowlist',
		]);
	});

	it('fails an allowlist entry for a plugin that is now wired', () => {
		expect(judgeWiring([report('a', true)], { a: 'why' })).toHaveLength(1);
	});

	it('fails when no plugin was found at all', () => {
		expect(judgeWiring([], {})).toEqual([
			'no plugin was found: the gate measured nothing',
		]);
	});
});
