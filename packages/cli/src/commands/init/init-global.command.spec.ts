import { describe, expect, it } from 'vitest';

import { parseGlobalArgs } from './init-global.command';

describe('init:global argument parsing', () => {
	it('installs every global target when no target is specified', () => {
		expect(parseGlobalArgs([])).toEqual({
			options: { all: true, globalOnly: true },
		});
	});

	it('keeps an explicit global target list and global-only scope', () => {
		expect(parseGlobalArgs(['--ide=cursor-global,zed'])).toEqual({
			options: {
				ide: ['cursor-global', 'zed'],
				all: false,
				globalOnly: true,
			},
		});
	});

	it('rejects an empty target list instead of falling back to autodetection', () => {
		expect(parseGlobalArgs(['--ide='])).toEqual({
			error: 'usage: --ide must contain at least one target id',
		});
	});

	it('rejects unknown and project-scoped targets', () => {
		expect(parseGlobalArgs(['--ide=not-a-host']).error).toContain(
			'unknown global host target',
		);
		expect(parseGlobalArgs(['--ide=cursor']).error).toContain(
			'project-scoped',
		);
	});
});
