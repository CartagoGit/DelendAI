import { describe, expect, it } from 'vitest';

import { deriveAuditTasks, parseAuditPlan } from '../../../src/lib/plan-reader';

describe('audit plan reader', () => {
	it('requires a type: plan document and derives ordered tasks', () => {
		const plan = parseAuditPlan(`---
id: q00001
status: ready
type: plan
kind: plan
title: Example implementation plan
contains:
    proposals:
        - id: x00001
          kind: fix
          required: true
          title: Repair boundary
---

# q00001

## Slices

### q00001-s1 — Fix: Repair boundary
- **Files**:
    - \`src/example.ts\`
- **Acceptance**: tests pass
`);

		expect(plan.id).toBe('q00001');
		expect(plan.children).toHaveLength(1);
		expect(deriveAuditTasks(plan)).toEqual([
			{
				id: 'q00001-q00001-s1',
				title: 'Repair boundary',
				description: expect.stringContaining('Plan: q00001.'),
				files: ['src/example.ts'],
				dependsOn: [],
			},
		]);
	});

	it('rejects valuation proposals', () => {
		expect(() =>
			parseAuditPlan('---\nid: x00001\ntype: proposal\ntitle: Fix\n---'),
		).toThrow('type: plan');
	});
});
