import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	__resetIdleStreakForTesting,
	runAutoWork,
	type IAutoWorkToolOptions,
} from '@mcp-vertex/proposals/lib/tools/auto-work.tool';

const parse = (result: { content: Array<{ text: string }> }): any =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('auto_work (one-call action plan)', () => {
	let root = '';
	let options: IAutoWorkToolOptions;

	beforeEach(() => {
		__resetIdleStreakForTesting();
		root = mkdtempSync(join(tmpdir(), 'auto-'));
		options = {
			namespacePrefix: 'proposals',
			indexPathAbs: join(root, 'index.json'),
			lockPathAbs: join(root, 'lock.json'),
			validationCommand: 'bun run validate',
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('returns idle when nothing is actionable', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const out = parse(await runAutoWork(options));
		expect(out.state).toBe('idle');
	});

	it('escalates to a hard stop after 3 consecutive idle calls (and resets on work)', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // 1
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // 2
		const third = parse(await runAutoWork(options)); // 3 → stop
		expect(third.stop).toBe(true);
		expect(third.idleStreak).toBe(3);

		// Actionable work resets the streak; idle afterwards no longer stops.
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({ proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }] })
		);
		expect(parse(await runAutoWork(options)).state).toBe('work');
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // streak reset → 1
	});

	it('returns a work plan with the configured validation command', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			})
		);
		const out = parse(await runAutoWork(options));
		expect(out.state).toBe('work');
		expect(out.proposalId).toBe('p1-x');
		expect(out.validationCommand).toBe('bun run validate');
		expect(Array.isArray(out.steps)).toBe(true);
	});
});
