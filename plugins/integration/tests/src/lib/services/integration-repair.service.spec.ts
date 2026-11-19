/** integration-repair.service.spec.ts — a repair pass refuses early and, with a green tip, touches nothing. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { ILandForge, ILandGit } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { runIntegrationRepair } from '../../../../src/lib/services/integration-repair.service';

const run = async (
	development: Record<string, unknown>,
	env: Record<string, string>,
	stdout = '[]',
) => {
	const out: string[] = [];
	const code = await runIntegrationRepair({
		root: '/repo',
		policy: resolveDevelopmentPolicy({ development }),
		env,
		runGh: () => Promise.resolve({ exitCode: 0, stdout, stderr: '' }),
		log: (line) => out.push(line),
		error: (line) => out.push(line),
		ports: {
			forge: fakePartial<ILandForge>({
				integrationTip: () => Promise.resolve('r'),
			}),
			git: fakePartial<ILandGit>({}),
		},
	});
	return { code, out: out.join('\n') };
};

describe('runIntegrationRepair', () => {
	it('[<20ms] does nothing while the engine is not `land`', async () => {
		const { code, out } = await run({}, { GITHUB_REPOSITORY: 'o/n' });
		expect(code).toBe(0);
		expect(out).toContain('not `land`');
	});

	it('[<20ms] refuses without a repository or with a newer protocol', async () => {
		expect((await run({}, {})).code).toBe(2);
		const newer = await run(
			{ integration: { engine: 'land', protocol: 999 } },
			{ GITHUB_REPOSITORY: 'o/n' },
		);
		expect(newer.code).toBe(2);
	});

	it('[<20ms] reads the CI history and does nothing when the latest run is green', async () => {
		const { code, out } = await run(
			{ integration: { engine: 'land' } },
			{ GITHUB_REPOSITORY: 'o/n' },
			'[{"headSha":"r","conclusion":"success"}]',
		);
		expect(code).toBe(0);
		expect(out).toContain('nothing to do');
	});
});
