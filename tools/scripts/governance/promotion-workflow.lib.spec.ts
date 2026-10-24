/**
 * promotion-workflow.lib.spec.ts — the promotion workflow follows the
 * project's configuration: its branches, its cadence, or nothing at all.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	PROMOTION_COMMAND,
	promotionWorkflowDocument,
} from './promotion-workflow.lib';

const policyFor = (branches: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development: { branches } });

const twoBranches = policyFor({ integration: 'trunk', release: 'release/2.x' });

describe('promotionWorkflowDocument', () => {
	it('runs on the declared cron, between the project branches', () => {
		const workflow = promotionWorkflowDocument(twoBranches, '0 6 * * 1');
		expect(workflow?.on).toEqual({
			schedule: [{ cron: '0 6 * * 1' }],
			workflow_dispatch: {},
		});
		const text = JSON.stringify(workflow);
		expect(text).toContain('trunk');
		expect(text).toContain('release/2.x');
		expect(text).toContain(PROMOTION_COMMAND);
		expect(text).not.toContain('develop');
	});

	it('runs on every move of the integration branch when the cadence is on-ready', () => {
		const workflow = promotionWorkflowDocument(twoBranches, 'on-ready');
		expect(workflow?.on).toEqual({
			push: { branches: ['trunk'] },
			workflow_dispatch: {},
		});
	});

	it('may open a pull request and holds no permission to push', () => {
		const workflow = promotionWorkflowDocument(twoBranches, 'on-ready');
		expect(workflow?.permissions).toEqual({
			contents: 'read',
			actions: 'read',
			checks: 'read',
			'security-events': 'read',
			'pull-requests': 'write',
		});
	});

	it('is nothing for a project that declares no cadence', () => {
		expect(
			promotionWorkflowDocument(twoBranches, undefined),
		).toBeUndefined();
		expect(promotionWorkflowDocument(twoBranches, '  ')).toBeUndefined();
	});

	it('is nothing for a project with one branch, whatever cadence it declares', () => {
		expect(
			promotionWorkflowDocument(
				policyFor({ integration: 'main' }),
				'on-ready',
			),
		).toBeUndefined();
		expect(
			promotionWorkflowDocument(
				policyFor({ integration: 'main', release: 'main' }),
				'0 6 * * 1',
			),
		).toBeUndefined();
	});
});
