import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	canonicalModelId,
	modelStage,
	rememberSeenModel,
	seenModels,
} from '../../../../src/lib/work-identity/model-identity.helper';

const KNOWN = [
	'minimax/MiniMax-M3',
	'minimax/MiniMax-M3-Priority',
	'minimax/MiniMax-M3.1-Flash-Preview',
	'claude-opus-5-5',
	'claude-sonnet-5-5',
];

describe('canonicalModelId', () => {
	it.each([
		['minimax-3.1', 'minimax-m3.1-flash-preview'],
		['minimax-m31', 'minimax-m3.1-flash-preview'],
		['MiniMax-M3.1', 'minimax-m3.1-flash-preview'],
		['minimax/MiniMax-M3.1-Flash-Preview', 'minimax-m3.1-flash-preview'],
		['minimax-m3', 'minimax-m3'],
		['minimax-3', 'minimax-m3'],
		['claude-opus-5.5', 'claude-opus-5-5'],
	])('names %s as the one model it fits, %s', (raw, canonical) => {
		expect(canonicalModelId(raw, KNOWN)).toBe(canonical);
	});

	it('keeps a spelling that fits several models, or none, as written', () => {
		expect(canonicalModelId('claude-5-5', KNOWN)).toBe('claude-5-5');
		expect(canonicalModelId('gpt-6.1-sol', KNOWN)).toBe('gpt-6.1-sol');
		expect(canonicalModelId('minimax-3.1', [])).toBe('minimax-3.1');
	});

	it('takes a declared alias first', () => {
		expect(
			canonicalModelId('m31', KNOWN, {
				m31: 'minimax/MiniMax-M3.1-Flash-Preview',
			}),
		).toBe('minimax-m3.1-flash-preview');
	});

	it('says a preview is not the released model', () => {
		expect(modelStage('minimax-m3.1-flash-preview')).toBe('preview');
		expect(modelStage('minimax-m3')).toBe('stable');
	});
});

describe('the seen-model catalog', () => {
	it('remembers each model once, without its vendor', () => {
		const dir = mkdtempSync(join(tmpdir(), 'seen-models-'));
		try {
			const path = join(dir, 'nested', 'models.json');
			expect(seenModels(path)).toEqual([]);
			rememberSeenModel('minimax/MiniMax-M3.1-Flash-Preview', path);
			rememberSeenModel('MiniMax-M3.1-Flash-Preview', path);
			expect(seenModels(path)).toEqual(['minimax-m3.1-flash-preview']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
