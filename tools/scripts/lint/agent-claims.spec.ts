import { describe, expect, it } from 'vitest';
import { checkAgentClaims } from './agent-claims.script';

describe('checkAgentClaims (x00080 S2)', () => {
	it('returns [] when there are no modified files', () => {
		expect(checkAgentClaims([], null)).toEqual([]);
	});

	it('returns all modified files when lockFileContent is null', () => {
		expect(checkAgentClaims(['file1.ts', 'file2.ts'], null)).toEqual([
			'file1.ts',
			'file2.ts',
		]);
	});

	it('returns all modified files when lockFileContent is corrupt JSON', () => {
		expect(checkAgentClaims(['file1.ts'], '{invalid')).toEqual(['file1.ts']);
	});

	it('returns [] when every modified file is claimed under an active lock', () => {
		const lockContent = JSON.stringify({
			in_flight: [
				{
					task_id: 'x00079',
					agent: 'antigravity',
					ownership: ['file1.ts', 'file2.ts'],
				},
				{
					task_id: 'f00065',
					agent: 'copilot',
					ownership: ['file3.ts'],
				},
			],
		});
		expect(
			checkAgentClaims(['file1.ts', 'file3.ts'], lockContent),
		).toEqual([]);
	});

	it('returns only the unclaimed files if some modified files lack a lock', () => {
		const lockContent = JSON.stringify({
			in_flight: [
				{
					task_id: 'x00079',
					agent: 'antigravity',
					ownership: ['file1.ts'],
				},
			],
		});
		expect(
			checkAgentClaims(['file1.ts', 'file2.ts', 'file3.ts'], lockContent),
		).toEqual(['file2.ts', 'file3.ts']);
	});
});
