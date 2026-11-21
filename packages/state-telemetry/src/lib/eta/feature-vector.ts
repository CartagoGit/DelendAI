/**
 * feature-vector.ts — q00020 F3 S1.
 *
 * Canonical feature vector for ETA computation. The vector has six
 * integer/numeric fields; the `canonicalHash()` is the SHA-256 of a
 * deterministic JSON projection (keys sorted alphabetically) so two
 * slices that look identical to the engine produce the same hash
 * regardless of object layout.
 *
 * `complexity_proxy` is a fixed-weight linear combination defined by
 * the proposal acceptance: it does not learn from data, it is a
 * heuristic the operator signed off on before the slice shipped.
 */

import { createHash } from 'node:crypto';

export interface IWorkFeatureVector {
	readonly slice_count: number;
	readonly affected_packages: number;
	readonly public_api_changes: number;
	readonly test_count: number;
	readonly loc_changed: number;
	readonly complexity_proxy: number;
}

/**
 * Inputs the projector (F2) hands the ETA engine when a slice moves to
 * `in-progress`. The fields are deliberately permissive: the engine
 * only reads the six numeric fields it cares about, so anything else
 * the projector attaches for its own bookkeeping is ignored.
 */
export interface IFeatureVectorInputs {
	readonly slice_count?: number;
	readonly affected_packages?: number;
	readonly public_api_changes?: number;
	readonly test_count?: number;
	readonly loc_changed?: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const COMPLEXITY_WEIGHTS = {
	slice_count: 1.2,
	affected_packages: 2.1,
	public_api_changes: 3.2,
	test_count: 0.7,
	loc_changed: 0.0001,
} as const;

export const computeFeatureVector = (
	inputs: IFeatureVectorInputs,
): IWorkFeatureVector => {
	const slice_count = inputs.slice_count ?? 1;
	const affected_packages = inputs.affected_packages ?? 0;
	const public_api_changes = inputs.public_api_changes ?? 0;
	const test_count = inputs.test_count ?? 0;
	const loc_changed = inputs.loc_changed ?? 0;
	const complexity_proxy = round2(
		slice_count * COMPLEXITY_WEIGHTS.slice_count +
			affected_packages * COMPLEXITY_WEIGHTS.affected_packages +
			public_api_changes * COMPLEXITY_WEIGHTS.public_api_changes +
			test_count * COMPLEXITY_WEIGHTS.test_count +
			loc_changed * COMPLEXITY_WEIGHTS.loc_changed,
	);
	return {
		slice_count,
		affected_packages,
		public_api_changes,
		test_count,
		loc_changed,
		complexity_proxy,
	};
};

const VECTOR_KEYS: readonly (keyof IWorkFeatureVector)[] = [
	'slice_count',
	'affected_packages',
	'public_api_changes',
	'test_count',
	'loc_changed',
	'complexity_proxy',
];

const sha256Hex = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

const canonicalJson = (vector: IWorkFeatureVector): string => {
	const record: Record<string, number> = {};
	for (const key of VECTOR_KEYS) record[key] = vector[key];
	return JSON.stringify(record);
};

export const canonicalHash = (vector: IWorkFeatureVector): string =>
	sha256Hex(canonicalJson(vector));
