import { describe, expect, it } from 'vitest';

import type { IWorkProgressSnapshot } from './contracts/interfaces/work-progress.interface';
import { makeEvent } from './test-support.helper';
import { createWorkProgressService } from './work-progress-api.service';

const setup = () => {
	let clock = 0;
	const service = createWorkProgressService({ now: () => clock });
	const seen: IWorkProgressSnapshot[] = [];
	service.subscribe((s) => seen.push(s));
	return {
		service,
		seen,
		tick: (ms: number) => {
			clock += ms;
		},
	};
};

describe('work progress service', () => {
	it('answers lookups by item and by proposal', () => {
		const { service } = setup();
		service.load(
			[
				makeEvent('a/S1', 'git_change', 1),
				makeEvent('b/S1', 'tool_called', 2),
			],
			[],
		);
		expect(service.getSnapshot('a/S1')?.phase).toBe('implementing');
		expect(service.getSnapshot('zzz')).toBeUndefined();
		expect(
			service.getSnapshotsForProposal('b').map((s) => s.workItemId),
		).toEqual(['b/S1']);
	});

	it('delivers at most once per item per interval and keeps only the newest', () => {
		const { service, seen, tick } = setup();
		service.load([], []);
		service.append([makeEvent('a/S1', 'git_change', 1)]);
		tick(100);
		service.append([makeEvent('a/S1', 'test_started', 2)]);
		tick(100);
		service.append([makeEvent('a/S1', 'slice_submitted', 3)]);
		expect(seen).toHaveLength(1);
		service.flush();
		expect(seen).toHaveLength(1);
		tick(1000);
		service.flush();
		expect(seen).toHaveLength(2);
		expect(seen[1]?.phase).toBe('reviewing');
		service.flush();
		expect(seen).toHaveLength(2);
	});

	it('does not delay a different item and stops after unsubscribe', () => {
		const { service, seen } = setup();
		const quiet: IWorkProgressSnapshot[] = [];
		const off = service.subscribe((s) => quiet.push(s));
		service.append([
			makeEvent('a/S1', 'git_change', 1),
			makeEvent('a/S2', 'git_change', 2),
		]);
		expect(seen.map((s) => s.workItemId)).toEqual(['a/S1', 'a/S2']);
		off();
		service.append([makeEvent('a/S3', 'git_change', 3)]);
		expect(quiet).toHaveLength(2);
	});
});
