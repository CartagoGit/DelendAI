/** integration-pass.service.spec.ts — a pass refuses before it touches the forge. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import { runIntegrationPass } from '../../../../src/lib/services/integration-pass.service';

const run = async (
	development: Record<string, unknown>,
	env: Record<string, string>,
) => {
	const out: string[] = [];
	const code = await runIntegrationPass({
		root: '/repo',
		policy: resolveDevelopmentPolicy({ development }),
		env,
		runGh: () => Promise.reject(new Error('the forge was reached')),
		log: (line) => out.push(line),
		error: (line) => out.push(line),
	});
	return { code, out };
};

describe('runIntegrationPass', () => {
	it('[<20ms] does nothing while the engine is not `land`', async () => {
		const { code, out } = await run({}, { GITHUB_REPOSITORY: 'o/n' });
		expect(code).toBe(0);
		expect(out.join()).toContain('nothing to do');
	});

	it('[<20ms] refuses without a repository', async () => {
		const { code, out } = await run({}, {});
		expect(code).toBe(2);
		expect(out.join()).toContain('GITHUB_REPOSITORY');
	});

	it('[<20ms] refuses a repository that records a newer protocol', async () => {
		const { code } = await run(
			{ integration: { engine: 'land', protocol: 999 } },
			{ GITHUB_REPOSITORY: 'o/n' },
		);
		expect(code).toBe(2);
	});
});
