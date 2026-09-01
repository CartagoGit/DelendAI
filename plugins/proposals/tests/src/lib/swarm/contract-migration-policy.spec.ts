import { describe, expect, it } from 'vitest';

import { evaluateContractMigrationPolicy } from '@mcp-vertex/proposals/lib/swarm/contract-migration-policy';

describe('evaluateContractMigrationPolicy', async () => {
	it('allows the expand phase with no predecessors', async () => {
		const result = evaluateContractMigrationPolicy({
			targetPhase: 'expand',
		});
		expect(result).toEqual({
			ok: true,
			blockers: [],
			nextPhase: 'expand',
			requiredPrerequisites: [],
			dualReadRequired: false,
			verificationRequiredBeforeContract: false,
		});
	});

	it('blocks producers until expand has landed', async () => {
		const result = evaluateContractMigrationPolicy({
			targetPhase: 'producers',
			completedPhases: [],
		});
		expect(result.ok).toBe(false);
		expect(result.nextPhase).toBe('expand');
		expect(result.requiredPrerequisites).toEqual(['expand']);
		expect(result.dualReadRequired).toBe(true);
		expect(result.blockers[0]).toContain('requires prior expand');
	});

	it('permits regenerate only after expand and producers', async () => {
		const result = evaluateContractMigrationPolicy({
			targetPhase: 'regenerate',
			completedPhases: ['expand', 'producers'],
		});
		expect(result.ok).toBe(true);
		expect(result.nextPhase).toBe('regenerate');
		expect(result.dualReadRequired).toBe(true);
		expect(result.requiredPrerequisites).toEqual(['expand', 'producers']);
	});

	it('keeps contract blocked until verify is complete and successful', async () => {
		const result = evaluateContractMigrationPolicy({
			targetPhase: 'contract',
			completedPhases: ['expand', 'producers', 'regenerate', 'consumers'],
			verificationPassed: false,
		});
		expect(result.ok).toBe(false);
		expect(result.nextPhase).toBe('verify');
		expect(result.verificationRequiredBeforeContract).toBe(true);
		expect(result.blockers.join(' ')).toContain('verify');
		expect(result.blockers.join(' ')).toContain(
			'successful verify evidence',
		);
	});

	it('allows contract only after the full protocol and passing verification', async () => {
		const result = evaluateContractMigrationPolicy({
			targetPhase: 'contract',
			completedPhases: [
				'expand',
				'producers',
				'regenerate',
				'consumers',
				'verify',
			],
			verificationPassed: true,
		});
		expect(result.ok).toBe(true);
		expect(result.nextPhase).toBe('contract');
		expect(result.requiredPrerequisites).toEqual([
			'expand',
			'producers',
			'regenerate',
			'consumers',
			'verify',
		]);
	});
});
