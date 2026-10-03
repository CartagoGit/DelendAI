/**
 * work-unit-lease.spec.ts — the lease is recorded by `work enter` through
 * the same engine the CLI runs, with where its client worked.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '@delendai/core/lib/contracts/constants/exit-code.constant';
import { readLeaseOf } from '@delendai/core/lib/work-units/unit-lease.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import { cleanUnitRepos, unitRepo } from './unit-repo.helper';

afterEach(cleanUnitRepos);

describe('the lease through the work engine', () => {
	it('is recorded by enter and shows in status', async () => {
		const repo = unitRepo();
		const entered = await runWorkUnit(
			[
				'enter',
				'--proposal=x1',
				'--slice=S1',
				'--kind=implement',
				'--agent=lease-agent',
				'--session=host-7',
				'--topic=lease-test',
			],
			{
				cwd: repo.root,
				globals: { workspace: repo.root, json: true, format: 'json' },
			},
		);
		expect(entered.code).toBe(EXIT_CODE.OK);
		const status = await runWorkUnit(['status'], {
			cwd: repo.root,
			globals: { workspace: repo.root, json: true, format: 'json' },
		});
		expect((status.data as { units: { live: number } }).units.live).toBe(1);
		const lease = await readLeaseOf(
			repo.root,
			(entered.data as { ref: string }).ref,
		);
		expect(lease?.clientCwd).toBe(repo.root);
		expect(lease?.serverRoot).toBe(repo.root);
	});
});
