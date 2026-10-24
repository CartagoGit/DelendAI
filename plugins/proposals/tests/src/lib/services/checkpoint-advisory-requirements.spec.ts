import { describe, expect, it } from 'vitest';

import { assessRequirementsDrift } from '@delendai/proposals/lib/services/checkpoint-advisory-requirements.service';

describe('assessRequirementsDrift', () => {
	it('emits nothing when the checkpoint is newer than chat context', () => {
		expect(
			assessRequirementsDrift({
				proposalId: 'f00156',
				checkpointUpdatedAt: '2026-08-23T12:00:00.000Z',
				chatContextLastUpdated: '2026-08-23T11:00:00.000Z',
				materialHashes: { acceptance: 'a' },
				checkpointHashes: { acceptance: 'a' },
			}),
		).toBeNull();
	});

	it('emits REQUIREMENTS_NOT_CONSOLIDATED after a material change', () => {
		const advisory = assessRequirementsDrift({
			proposalId: 'f00156',
			checkpointUpdatedAt: '2026-08-23T10:00:00.000Z',
			chatContextLastUpdated: '2026-08-23T12:00:00.000Z',
			materialHashes: { acceptance: 'b' },
			checkpointHashes: { acceptance: 'a' },
		});
		expect(advisory?.code).toBe('REQUIREMENTS_NOT_CONSOLIDATED');
		expect(advisory?.nextAction).toBe('consolidate-requirements');
		expect(advisory?.severity).toBe('strong');
		expect(advisory?.message.startsWith('At this point, I recommend')).toBe(
			true,
		);
	});

	it('resets when a new semantic checkpoint post-dates the change', () => {
		const after = assessRequirementsDrift({
			proposalId: 'f00156',
			checkpointUpdatedAt: '2026-08-23T13:00:00.000Z',
			chatContextLastUpdated: '2026-08-23T12:00:00.000Z',
			materialHashes: { acceptance: 'b' },
			checkpointHashes: { acceptance: 'b' },
		});
		expect(after).toBeNull();
	});
});
