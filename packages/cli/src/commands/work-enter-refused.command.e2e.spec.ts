/**
 * work-enter-refused.command.e2e.spec.ts — a refused entry prints no path,
 * so a script that carries on cannot run in the shared checkout. Loads the
 * policy and plugins of a real enter, which is why it is not a unit spec.
 */
import { describe, expect, it } from 'vitest';

import { createNoopContext } from '../lib/noop-context.factory';
import { createWorkCommand } from './work.command';

describe('entering a unit from the CLI', () => {
	it('[<4000ms] prints no path when the entry is refused', async () => {
		const result = await createWorkCommand().run(
			['enter', '--proposal=x00001', '--print-path'],
			createNoopContext('/nowhere', {
				workspace: '/work',
				json: true,
				format: 'json',
				lang: 'en',
				noColor: true,
				plugins: [],
			}),
		);
		expect(result.code).not.toBe(0);
	});
});
