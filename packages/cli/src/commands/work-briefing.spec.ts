import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { briefOnEntering } from './work.command';
import { taskBriefingFor } from '@delendai/core/lib/work-units/task-briefing.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('entering a unit from the CLI', () => {
	it('asks the planning plugin, which knows no such proposal here', async () => {
		const worktree = mkdtempSync(join(tmpdir(), 'work-briefing-'));
		roots.push(worktree);
		await briefOnEntering();
		expect(
			await taskBriefingFor({
				worktree,
				proposal: 'f00001',
				slice: 'S1',
			}),
		).toBeUndefined();
	});
});
