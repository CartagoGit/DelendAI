import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REHEARSAL_WORKFLOW_PATH } from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { renderRehearsalWorkflow } from '../../../../src/lib/services/rehearsal-ci-workflow.helper';

const render = () =>
	renderRehearsalWorkflow({
		namespace: 'delendai',
		codePaths: [
			'plugins/integration/**',
			'.github/workflows/rehearsal.yml',
		],
	});

describe('the rehearsal workflow', () => {
	it('[<50ms] is the committed file exactly', () => {
		const committed = readFileSync(
			resolve(__dirname, '../../../../../..', REHEARSAL_WORKFLOW_PATH),
			'utf8',
		);
		expect(committed).toBe(render());
	});

	it('[<50ms] never triggers on the integration or release branch', () => {
		const text = render();
		expect(text).not.toMatch(/branches:.*\b(develop|main)\b/u);
		expect(text).not.toContain('pull_request_target');
		expect(text).toContain("branches: ['delendai/pr/**']");
	});

	it('[<50ms] runs one at a time', () => {
		expect(render()).toContain('cancel-in-progress: false');
	});
});
