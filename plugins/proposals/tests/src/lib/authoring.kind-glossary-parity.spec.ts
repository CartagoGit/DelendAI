/**
 * authoring.kind-glossary-parity.spec.ts — x00504 S2 regression test.
 *
 * Pins the invariant that `CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind`
 * (the input schema `create_proposal` accepts) carries exactly the
 * values declared in the canonical glossary
 * (`PROPOSAL_KIND_VALUES`, derived from `proposal-glossary.constant.ts`).
 *
 * Why this test exists: until x00513 the input schema held a 13-value
 * hand-written enum that lagged the 15-value glossary, so a caller
 * could not mint a `qNNNNN-...` plan or `eNNNNN-...` repair proposal
 * without lying with `kind: 'chore'`. The fix added the two missing
 * values; this test makes that invariant self-enforcing — any future
 * kind added to the glossary must, by passing through `proposalKindSchema`,
 * land in `CREATE_PROPOSAL_INPUT_SCHEMA` on the same code path (or
 * the test fails with a targeted message).
 */
import { describe, expect, it } from 'vitest';

import { CREATE_PROPOSAL_INPUT_SCHEMA } from '@delendai/proposals/lib/tools/authoring.tool';
import {
	kindMatchesId,
	proposalKindSchema,
	PROPOSAL_KIND_VALUES,
} from '@delendai/proposals/lib/contracts/schemas/proposal-kind.schema';

/**
 * Zod v4 stores enum members on `_def.entries` as an object map
 * (`{ feat: 'feat', plan: 'plan', … }`), not on `_def.values` as an
 * array the way Zod v3 did. The runtime layout is identical for the
 * callers in this spec (every value round-trips through
 * `proposalKindSchema.safeParse`); we only need `Object.keys` to
 * iterate the names.
 */
const inputSchemaKinds = (): string[] =>
	Object.keys(
		CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.unwrap()._def.entries as Record<
			string,
			unknown
		>,
	);

describe('CREATE_PROPOSAL_INPUT_SCHEMA.kind ≡ PROPOSAL_KIND_VALUES (x00504)', () => {
	it('every member of PROPOSAL_KIND_VALUES is accepted by the input schema', () => {
		const accepted = new Set<string>(inputSchemaKinds());
		const missing: string[] = [];
		for (const kind of PROPOSAL_KIND_VALUES) {
			if (!accepted.has(kind)) {
				missing.push(
					`Expected kind '${kind}' to be present in CREATE_PROPOSAL_INPUT_SCHEMA.kind, but it was missing`,
				);
			}
		}
		expect(missing, missing.join('\n')).toEqual([]);
	});

	it('the input schema accepts each kind in the same order as PROPOSAL_KIND_VALUES', () => {
		expect(inputSchemaKinds()).toEqual([...PROPOSAL_KIND_VALUES]);
	});

	it('cross-cutting `plan` is accepted (previously rejected as unrecognized_enum_value)', () => {
		const result =
			CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.safeParse('plan');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe('plan');
		}
	});

	it('cross-cutting `repair` is accepted (previously rejected as unrecognized_enum_value)', () => {
		const result =
			CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.safeParse('repair');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe('repair');
		}
	});

	it('legacy `chore` still parses (the pre-x00513 fallback path)', () => {
		const result =
			CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.safeParse('chore');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe('chore');
		}
	});

	it('rejects unknown kinds (e.g. `not-a-kind`) with a structured error', () => {
		const result =
			CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.safeParse('not-a-kind');
		expect(result.success).toBe(false);
	});

	it('the `kind` field stays optional (legacy callers may omit it)', () => {
		expect(CREATE_PROPOSAL_INPUT_SCHEMA.shape.kind.isOptional()).toBe(true);
	});

	it('proposalKindSchema (the glossary-derived schema) round-trips every value the input schema accepts', () => {
		// Set equality: glossary names == input schema names. Direction-aware:
		// a kind added to the glossary without updating the input schema
		// (the bug class x00504 fixes) would fail the glossary → input
		// direction; the reverse direction catches an enum drift.
		const inputValues = new Set(inputSchemaKinds());
		const glossaryValues = new Set(
			PROPOSAL_KIND_VALUES as readonly string[],
		);
		expect(inputValues).toEqual(glossaryValues);
		for (const kind of inputValues) {
			expect(proposalKindSchema.safeParse(kind).success).toBe(true);
		}
	});
});

describe('kindMatchesId coherence for the cross-cutting kinds (x00504)', () => {
	it("`kindMatchesId('plan', 'q00020')` returns { ok: true }", () => {
		expect(kindMatchesId('plan', 'q00020')).toEqual({ ok: true });
	});

	it("`kindMatchesId('repair', 'e00001')` returns { ok: true }", () => {
		expect(kindMatchesId('repair', 'e00001')).toEqual({ ok: true });
	});

	it('rejects mismatched pairs with a structured reason', () => {
		// `plan` should not match a `feat` (f-prefixed) id.
		const result = kindMatchesId('plan', 'f00050');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/does not match kind/);
		}
	});
});
