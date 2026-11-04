/**
 * proposal-transition.compat.spec.ts — x00153 S9.
 *
 * Audit + coverage for the v1/v2 compat wrapper that fronts every
 * `proposal_transition` call. The wrapper exposes the canonical
 * `PROPOSAL_TRANSITION_COMPAT` window metadata + the
 * `runProposalTransitionCompat` runner; today v1 === v2 (seed slice)
 * but the framework is real and the spec must pin the contract so
 * future shape narrowing is a safe refactor.
 */
import { describe, expect, it } from 'vitest';

import {
	PROPOSAL_TRANSITION_COMPAT,
	runProposalTransitionCompat,
} from '@delendai/proposals/lib/tools/proposal-transition.compat';
import type { IProposalTransitionToolOptions } from '@delendai/proposals/lib/tools/proposal-transition.tool';
import { fakePartial } from '@delendai/test-kit/public';

const baseArgs = {
	id: 'x00153',
	to: 'done',
	reason: 'test',
};

// x00153 S9: the handler resolves `proposalsDirAbs` eagerly; point it
// at a guaranteed-absent directory so the handler's own locate step is
// a deterministic "not found" (toolError), not a thrown TypeError. The
// compat layer is exercised BEFORE the handler runs, so the inner
// failure is irrelevant — we assert on `deprecatedShapeUsed` only.
// `namespacePrefix`/`workspaceRoot` (real required fields) are never
// read on this path, so only `proposalsDirAbs` is declared required.
const stubOptions = fakePartial<
	IProposalTransitionToolOptions,
	'proposalsDirAbs'
>({
	proposalsDirAbs: '/tmp/delendai-x00153-s9-compat',
	indexPathAbs: '/tmp/delendai-x00153-s9-compat/index.json',
});

describe('x00153 S9 — PROPOSAL_TRANSITION_COMPAT window metadata', () => {
	it('exposes both v1 and v2 versions', () => {
		expect(PROPOSAL_TRANSITION_COMPAT.v2.version).toBe('v2');
		expect(PROPOSAL_TRANSITION_COMPAT.v1.version).toBe('v1');
	});

	it('marks v1 as deprecated with a removal target', () => {
		expect(PROPOSAL_TRANSITION_COMPAT.v1.removedIn).not.toBe('never');
		expect(typeof PROPOSAL_TRANSITION_COMPAT.v1.migrationHint).toBe(
			'string',
		);
		expect(
			PROPOSAL_TRANSITION_COMPAT.v1.migrationHint.length,
		).toBeGreaterThan(0);
	});

	it('keeps v2 as the canonical version with `removedIn: never`', () => {
		expect(PROPOSAL_TRANSITION_COMPAT.v2.removedIn).toBe('never');
	});
});

describe('x00153 S9 — runProposalTransitionCompat v1/v2 routing', () => {
	it('accepts v2 input without a deprecated-shape warning', async () => {
		const result = await runProposalTransitionCompat(baseArgs, stubOptions);
		// We don't assert on `result.ok` here (the handler may
		// fail under the stub options — that is fine), only on
		// the *compat layer*: v2 input must NOT carry a
		// deprecated-shape warning.
		if (result.ok) {
			expect(result.deprecatedShapeUsed).toBeNull();
		} else {
			// If the handler refused, the compat layer
			// still must not be the cause: error.code must
			// be the underlying handler code, NOT
			// 'compat-window-invalid'.
			expect(result.error.code).not.toBe('compat-window-invalid');
		}
	});

	it('rejects malformed input with compat-window-invalid', async () => {
		const result = await runProposalTransitionCompat(
			{ id: '' },
			stubOptions,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('compat-window-invalid');
			expect(Array.isArray(result.error.issues)).toBe(true);
		}
	});

	it('rejects an invalid target status with compat-window-invalid', async () => {
		const result = await runProposalTransitionCompat(
			{ ...baseArgs, to: 'shipping' },
			stubOptions,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('compat-window-invalid');
			expect(Array.isArray(result.error.issues)).toBe(true);
		}
	});

	it('rejects unknown keys with compat-window-invalid', async () => {
		const result = await runProposalTransitionCompat(
			{ ...baseArgs, extra: 1 },
			stubOptions,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('compat-window-invalid');
			expect(Array.isArray(result.error.issues)).toBe(true);
		}
	});

	it('rejects non-object input with compat-window-invalid', async () => {
		const result = await runProposalTransitionCompat(
			'a string',
			stubOptions,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('compat-window-invalid');
		}
	});
});
