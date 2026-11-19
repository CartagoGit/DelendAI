#!/usr/bin/env bun
/**
 * envelopes.contract.spec.ts — r00033 (Track M / q00006 §46).
 *
 * Exercises the discriminated unions, narrowing helpers, and the
 * frozen-envelope construction paths. Pure-type tests: no Node,
 * no I/O.
 */

import { describe, expect, it } from 'vitest';

import {
	failure,
	isOperationFailure,
	isOperationSuccess,
	success,
	type EntityRef,
	type MutationResult,
	type OperationResult,
	type PagedResult,
	type Refusal,
	type ResourceResult,
} from '../../../../src/lib/contracts/envelopes.contract';

describe('envelopes.contract (r00033)', () => {
	describe('EntityRef', () => {
		it('requires kind and id; href and displayName are optional', () => {
			const ref: EntityRef<'proposal'> = {
				kind: 'proposal',
				id: 'r00033',
			};
			expect(ref.kind).toBe('proposal');
			expect(ref.id).toBe('r00033');
			expect(ref.href).toBeUndefined();
			expect(ref.displayName).toBeUndefined();
		});

		it('round-trips optional fields', () => {
			const ref: EntityRef<'plugin', 'git'> = {
				kind: 'plugin',
				id: 'git',
				href: 'delendai://plugin/git',
				displayName: 'Git plugin',
			};
			expect(ref.href).toBe('delendai://plugin/git');
			expect(ref.displayName).toBe('Git plugin');
		});
	});

	describe('OperationResult narrowing', () => {
		const ok: OperationResult<{ n: number }, Refusal> = {
			ok: true,
			value: { n: 42 },
		};
		const err: OperationResult<{ n: number }, Refusal> = {
			ok: false,
			error: { code: 'NOT_FOUND', message: 'gone' },
		};

		it('isOperationSuccess narrows the success branch', () => {
			if (isOperationSuccess(ok)) {
				expect(ok.value.n).toBe(42);
			} else {
				throw new Error('expected success branch');
			}
		});

		it('isOperationFailure narrows the failure branch', () => {
			if (isOperationFailure(err)) {
				expect(err.error.code).toBe('NOT_FOUND');
			} else {
				throw new Error('expected failure branch');
			}
		});

		it('rejects mismatched branches', () => {
			expect(isOperationSuccess(err)).toBe(false);
			expect(isOperationFailure(ok)).toBe(false);
		});
	});

	describe('success() / failure() helpers', () => {
		it('success() freezes the envelope and stamps value', () => {
			const r = success({ x: 1 });
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toEqual({ x: 1 });
			expect(Object.isFrozen(r)).toBe(true);
		});

		it('success() attaches envelope meta when provided', () => {
			const r = success(7, {
				source: 'core',
				schemaVersion: '0.1.0',
			});
			expect(r.ok).toBe(true);
			expect(r.envelope?.source).toBe('core');
			expect(r.envelope?.schemaVersion).toBe('0.1.0');
			expect(Object.isFrozen(r)).toBe(true);
		});

		it('failure() freezes the envelope and stamps error', () => {
			const r = failure({ code: 'X', message: 'y' });
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.code).toBe('X');
			expect(Object.isFrozen(r)).toBe(true);
		});

		it('failure() round-trips optional envelope meta', () => {
			const r = failure(
				{ code: 'X', message: 'y' },
				{ source: 'git', schemaVersion: '0.1.0' },
			);
			expect(r.envelope?.source).toBe('git');
		});
	});

	describe('PagedResult', () => {
		it('items is readonly; total and pageSize are required', () => {
			const p: PagedResult<EntityRef<'plugin'>> = {
				items: [
					{ kind: 'plugin', id: 'git' },
					{ kind: 'plugin', id: 'core' },
				],
				total: 50,
				pageSize: 2,
				cursor: 'opaque',
			};
			expect(p.items).toHaveLength(2);
			expect(p.total).toBe(50);
			expect(p.cursor).toBe('opaque');
		});
	});

	describe('MutationResult', () => {
		it('before/after are optional; changed is required', () => {
			const m: MutationResult<{ title: string }> = {
				changed: { kind: 'proposal', id: 'r00033' },
				after: { title: 'new' },
				dryRun: true,
			};
			expect(m.changed.id).toBe('r00033');
			expect(m.before).toBeUndefined();
			expect(m.after?.title).toBe('new');
			expect(m.dryRun).toBe(true);
		});
	});

	describe('ResourceResult', () => {
		it('accepts string and Uint8Array content', () => {
			const text: ResourceResult = {
				uri: 'delendai://docs/readme',
				mime: 'text/plain',
				content: 'hello',
			};
			const bytes: ResourceResult = {
				uri: 'delendai://docs/icon',
				mime: 'image/png',
				content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			};
			expect(text.content).toBe('hello');
			expect((bytes.content as Uint8Array).length).toBe(4);
		});
	});
});
