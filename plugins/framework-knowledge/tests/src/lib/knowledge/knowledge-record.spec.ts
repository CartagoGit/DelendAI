// knowledge-record.spec.ts: pin the FORCE ordering and the validation
// createKnowledgeRecord refuses. f00547 S2.

import { describe, expect, it } from 'vitest';

import {
	createKnowledgeRecord,
	FORCE_VALUES,
	forceRank,
	isKnowledgeForce,
} from '../../../../src/lib/knowledge/knowledge-record';
import type { IKnowledgeRecordInput } from '../../../../src/lib/contracts/interfaces/knowledge-record.interface';

const validInput: IKnowledgeRecordInput = {
	id: 'angular-inline-template',
	frameworkId: 'angular',
	appliesToVersion: '17.x',
	topic: 'component-styles',
	statement: 'Angular 17 supports inline templates via `template:`.',
	force: 'supported',
	evidence: {
		source: 'https://angular.dev/guide/components',
		retrievedAt: '2026-09-30T00:00:00.000Z',
	},
};

describe('FORCE_VALUES / forceRank', () => {
	it('orders strongest-permission to strongest-refusal', () => {
		expect(FORCE_VALUES).toEqual([
			'required',
			'recommended',
			'supported',
			'discouraged',
			'deprecated',
			'removed',
		]);
	});

	it('ranks required below removed', () => {
		expect(forceRank('required')).toBeLessThan(forceRank('removed'));
	});

	it('ranks each value at its own index', () => {
		FORCE_VALUES.forEach((force, index) => {
			expect(forceRank(force)).toBe(index);
		});
	});
});

describe('isKnowledgeForce', () => {
	it('accepts every declared force', () => {
		for (const force of FORCE_VALUES) {
			expect(isKnowledgeForce(force)).toBe(true);
		}
	});

	it('rejects an unknown string and a non-string', () => {
		expect(isKnowledgeForce('mandatory')).toBe(false);
		expect(isKnowledgeForce(3)).toBe(false);
		expect(isKnowledgeForce(undefined)).toBe(false);
	});
});

describe('createKnowledgeRecord', () => {
	it('accepts a well-formed record', () => {
		const result = createKnowledgeRecord(validInput);
		expect(result).toEqual({ ok: true, record: validInput });
	});

	it('refuses an id that is not lower-kebab', () => {
		const result = createKnowledgeRecord({ ...validInput, id: 'Bad_Id' });
		expect(result).toEqual({ ok: false, reason: 'invalid id: Bad_Id' });
	});

	it('refuses an invalid frameworkId', () => {
		const result = createKnowledgeRecord({
			...validInput,
			frameworkId: 'Angular JS',
		});
		expect(result.ok).toBe(false);
	});

	it('refuses an empty appliesToVersion', () => {
		const result = createKnowledgeRecord({
			...validInput,
			appliesToVersion: '   ',
		});
		expect(result).toEqual({
			ok: false,
			reason: 'appliesToVersion must not be empty',
		});
	});

	it('refuses an invalid topic', () => {
		const result = createKnowledgeRecord({ ...validInput, topic: '' });
		expect(result.ok).toBe(false);
	});

	it('refuses an empty statement', () => {
		const result = createKnowledgeRecord({ ...validInput, statement: '' });
		expect(result).toEqual({
			ok: false,
			reason: 'statement must not be empty',
		});
	});

	it('refuses a force outside FORCE_VALUES', () => {
		const result = createKnowledgeRecord({
			...validInput,
			force: 'mandatory',
		});
		expect(result).toEqual({
			ok: false,
			reason: 'invalid force: mandatory',
		});
	});

	it('refuses an empty evidence.source', () => {
		const result = createKnowledgeRecord({
			...validInput,
			evidence: { ...validInput.evidence, source: '' },
		});
		expect(result).toEqual({
			ok: false,
			reason: 'evidence.source must not be empty',
		});
	});

	it('refuses an unparsable evidence.retrievedAt', () => {
		const result = createKnowledgeRecord({
			...validInput,
			evidence: { ...validInput.evidence, retrievedAt: 'not-a-date' },
		});
		expect(result).toEqual({
			ok: false,
			reason: 'invalid evidence.retrievedAt: not-a-date',
		});
	});
});
