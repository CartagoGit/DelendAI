import { describe, expect, it } from 'vitest';

import { parseCliInvocation } from '../src/lib/parser';

describe('parseCliInvocation', () => {
	it('parses globals before the command', () => {
		const parsed = parseCliInvocation(
			['--workspace', 'repo', '--json', 'overview', '--full'],
			'/tmp',
		);
		expect(parsed.globals.workspace).toBe('/tmp/repo');
		expect(parsed.globals.json).toBe(true);
		expect(parsed.commandPath).toEqual(['overview']);
		expect(parsed.commandArgs).toEqual(['--full']);
	});

	it('lifts supported global flags after the command', () => {
		const parsed = parseCliInvocation(
			['search', 'needle', '--plugins=search', '--max=5'],
			'/tmp',
		);
		expect(parsed.globals.plugins).toEqual(['search']);
		expect(parsed.commandArgs).toEqual(['needle', '--max=5']);
	});
});
