/**
 * dry-run-violation-log.spec.ts — r00037 S1.
 *
 * Unit-level coverage of the bounded ring buffer itself, mirroring
 * `shared/git-write.ts`'s force-push-authorization idiom. Router-level
 * wiring (that `applyDryRunContract` actually calls
 * `recordDryRunViolation` with the right plugin/tool) is covered in
 * `router-enforcement.spec.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
	clearDryRunViolationsForTests,
	listDryRunViolations,
	recordDryRunViolation,
} from '@delendai/core/public';
import type { IDryRunContractViolationRecord } from '@delendai/core/public';

const record = (
	overrides: Partial<IDryRunContractViolationRecord> = {},
): IDryRunContractViolationRecord => ({
	ts: '2026-08-29T00:00:00.000Z',
	tool: 'mcp-vertex_writer_run',
	pluginId: 'writer',
	reason: 'handler ignored args.dryRun and returned a non-dryRun payload',
	issues: [],
	...overrides,
});

describe('dry-run violation log', () => {
	beforeEach(() => {
		clearDryRunViolationsForTests();
	});

	it('is empty until a violation is recorded', () => {
		expect(listDryRunViolations()).toEqual([]);
	});

	it('records violations oldest-first', () => {
		recordDryRunViolation(record({ tool: 'a' }));
		recordDryRunViolation(record({ tool: 'b' }));

		expect(listDryRunViolations().map((r) => r.tool)).toEqual(['a', 'b']);
	});

	it('returns a snapshot, not a live reference — mutating the result cannot corrupt the buffer', () => {
		recordDryRunViolation(record());

		const snapshot =
			listDryRunViolations() as IDryRunContractViolationRecord[];
		snapshot.push(record({ tool: 'injected' }));

		expect(listDryRunViolations()).toHaveLength(1);
	});

	it('caps the buffer and drops the oldest entry once full', () => {
		for (let i = 0; i < 205; i += 1) {
			recordDryRunViolation(record({ tool: `tool-${i}` }));
		}

		const violations = listDryRunViolations();
		expect(violations).toHaveLength(200);
		expect(violations[0]?.tool).toBe('tool-5');
		expect(violations.at(-1)?.tool).toBe('tool-204');
	});

	it('clearDryRunViolationsForTests empties the buffer', () => {
		recordDryRunViolation(record());
		clearDryRunViolationsForTests();

		expect(listDryRunViolations()).toEqual([]);
	});
});
