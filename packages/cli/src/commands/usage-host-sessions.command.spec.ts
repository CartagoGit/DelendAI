import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { usageHostSessionsCommand } from './usage-host-sessions.command';

const ctx = fakePartial<ICliCommandContext>({
	globals: fakePartial<ICliCommandContext['globals']>({ workspace: '/w' }),
});
let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('usage host-sessions', () => {
	it('reports the threads of a session and writes nothing', async () => {
		dir = mkdtempSync(join(tmpdir(), 'hs-'));
		writeFileSync(
			join(dir, 's1.jsonl'),
			`${JSON.stringify({
				timestamp: '2026-11-01T10:00:00Z',
				message: {
					id: 'm',
					role: 'assistant',
					usage: { input_tokens: 1, output_tokens: 2 },
				},
			})}\n`,
		);
		const got = await usageHostSessionsCommand.run(
			[`--projects-dir=${dir}`, '--session=s1'],
			ctx,
		);
		expect(got.code).toBe(EXIT_CODE.OK);
		expect(got.text).toContain('session s1');
		expect(got.text).toContain('calls=    1');
		expect(usageHostSessionsCommand.readsOnly?.([])).toBe(true);
	});

	it('says so when there is nothing to read', async () => {
		dir = mkdtempSync(join(tmpdir(), 'hs-'));
		const got = await usageHostSessionsCommand.run(
			[`--projects-dir=${dir}`],
			ctx,
		);
		expect(got.text).toContain('no sessions');
	});
});
