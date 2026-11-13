/**
 * init-default-help.service.spec.ts — the help text names the pack
 * `init:default` really installs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_INIT_PRESET } from '../../contracts/constants/init-answers.constant';
import {
	printInitDefaultHelp,
	renderInitDefaultHelp,
} from './init-default-help.service';

afterEach(() => vi.restoreAllMocks());

describe('init:default help', () => {
	it('names the default pack and the flags', () => {
		const text = renderInitDefaultHelp();
		expect(text).toContain(`${DEFAULT_INIT_PRESET} preset`);
		expect(text).toContain('--dry-run');
	});

	it('writes the help to stderr', () => {
		const write = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		printInitDefaultHelp();
		expect(write).toHaveBeenCalledOnce();
	});
});
