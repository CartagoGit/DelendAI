/**
 * validate-evidence.tool.spec.ts — an approval counts only when someone
 * other than the implementer gave it (a00069 S7).
 */
import { describe, expect, it } from 'vitest';

import { hasPeerApprovedReview } from '@delendai/proposals/lib/swarm/proposal-review';
import { hasIndependentPeerApproval } from '@delendai/proposals/lib/tools/transition/validate-evidence.tool';

const DOC = (extra: string) => `---
id: f00888
status: review
---

# peer review fixture

### S1 — work
- **Status**: done
- **Files**: \`src/a.ts\`
${extra}
`;

const PEER_OK = `- review-state: done
- review-implementer: alice
- review-reviewer: bob
- review-log: approved by bob
`;

const SELF_APPROVE = `- review-state: done
- review-implementer: alice
- review-reviewer: alice
- review-log: approved by alice
`;

describe('hasIndependentPeerApproval (a00069 S7)', () => {
	it('rejects empty / self-only approve', () => {
		expect(hasIndependentPeerApproval(DOC(''))).toBe(false);
		expect(
			hasIndependentPeerApproval(
				DOC(
					'- review-implementer: alice\n- review-log: approved by alice\n',
				),
			),
		).toBe(false);
	});

	it('accepts peer approve', () => {
		expect(
			hasIndependentPeerApproval(
				DOC(
					'- review-implementer: alice\n- review-log: approved by bob\n',
				),
			),
		).toBe(true);
	});

	it('accepts approve when no implementer recorded', () => {
		expect(
			hasIndependentPeerApproval(DOC('- review-log: approved by bob\n')),
		).toBe(true);
	});
});

describe('hasPeerApprovedReview (a00069 S7)', () => {
	it('requires done + distinct reviewer + approved round', () => {
		expect(hasPeerApprovedReview(DOC(PEER_OK))).toBe(true);
		expect(hasPeerApprovedReview(DOC(SELF_APPROVE))).toBe(false);
		expect(hasPeerApprovedReview(DOC(''))).toBe(false);
	});
});
