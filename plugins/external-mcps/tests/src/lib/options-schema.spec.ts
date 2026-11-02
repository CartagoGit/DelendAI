import { describe, expect, it } from 'vitest';

import {
	pinnedLaunchArgs,
	ServerEntrySchema,
} from '../../../src/lib/options-schema';

const entry = (over: Record<string, unknown> = {}) => ({
	version: '1.4.2',
	command: 'stub-mcp',
	args: ['--stdio'],
	...over,
});

describe('ServerEntrySchema', () => {
	it('accepts eager:true as part of the declared server contract', () => {
		const parsed = ServerEntrySchema.parse(entry({ eager: true }));
		expect(parsed.eager).toBe(true);
	});

	it('defaults eager to false when omitted', () => {
		const parsed = ServerEntrySchema.parse(entry());
		expect(parsed.eager).toBe(false);
	});
});

describe('pinnedLaunchArgs', () => {
	const run = (command: string, args: string[]) =>
		pinnedLaunchArgs({ command, args, version: '1.4.2' });

	it('pins a bare, tagged or ranged package spec to the exact version', () => {
		expect(run('npx', ['-y', 'pkg'])).toEqual(['-y', 'pkg@1.4.2']);
		expect(run('npx', ['-y', 'pkg@latest'])).toEqual(['-y', 'pkg@1.4.2']);
		expect(run('bunx', ['@scope/pkg@^1.0.0', '--stdio'])).toEqual([
			'@scope/pkg@1.4.2',
			'--stdio',
		]);
		expect(run('npx', ['@scope/pkg'])).toEqual(['@scope/pkg@1.4.2']);
	});

	it('leaves other launchers untouched', () => {
		expect(run('uvx', ['pkg'])).toEqual(['pkg']);
	});
});
