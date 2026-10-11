/**
 * adoption-parity.spec.ts — one undeclared project, one answer.
 *
 * The adoption migrator, `resolveEffectivePolicy`, the policy `work` and
 * the guard read, and the served instructions used to describe the same
 * repository differently depending on which ran first: the migrator chose
 * a profile from the forge and wrote it into the file, while `work`
 * resolved another. Each case here is an undeclared repository, and every
 * surface must agree on it before and after the migrator has written.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { agentPolicyInstructions } from '@delendai/core/lib/prompts/agent-policy-instructions.helper';
import { proposeAdoption } from '@delendai/core/lib/development-policy/adopt';
import { resolveEffectivePolicy } from '@delendai/core/lib/development-policy/effective-policy';
import { policyOriginNote } from '@delendai/core/lib/development-policy/served-work-model';
import { adoptionReportLines } from '@delendai/core/lib/workspace-migration/migration-report.service';
import { runPendingMigrations } from '@delendai/core/lib/workspace-migration/legacy-migration.service';
import { createFileSystemJournal } from '@delendai/core/lib/workspace-migration/migration-registry';
import { createDevelopmentPolicyMigrator } from '@delendai/core/lib/workspace-migration/migrators/development-policy.migrator';
import {
	legacyFieldsOf,
	readWorkspacePolicy,
} from '@delendai/core/lib/work-units/development-policy.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

interface IRepository {
	readonly config: string;
	readonly remote?: string;
}

const repository = ({ config, remote }: IRepository): string => {
	const root = mkdtempSync(join(tmpdir(), 'adoption-parity-'));
	roots.push(root);
	const git = (...args: readonly string[]): void => {
		execFileSync('git', [...args], { cwd: root, stdio: 'ignore' });
	};
	git('init', '--quiet', '--initial-branch', 'main');
	git('config', 'user.name', 'Test');
	git('config', 'user.email', 'test@example.com');
	if (remote !== undefined) git('remote', 'add', 'origin', remote);
	writeFileSync(join(root, 'delendai.config.json'), config);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'base');
	return root;
};

const configPath = (root: string): string => join(root, 'delendai.config.json');

const migrate = (root: string) =>
	runPendingMigrations({
		migrations: [createDevelopmentPolicyMigrator()],
		journal: createFileSystemJournal(),
		ctx: { workspaceRoot: root, dryRun: false },
	});

/** The policy as the assembled server resolves it, from the parsed config. */
const assembledPolicy = (root: string) => {
	const config = JSON.parse(readFileSync(configPath(root), 'utf8')) as {
		development?: Record<string, unknown>;
	};
	return resolveEffectivePolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
		legacy: legacyFieldsOf(config),
		workspaceRoot: root,
	});
};

const GITHUB = 'https://github.com/acme/widgets.git';

describe.each([
	['no remote', { config: '{ "version": 1 }' }],
	['a GitHub-looking remote', { config: '{ "version": 1 }', remote: GITHUB }],
	[
		'a self-hosted remote',
		{ config: '{ "version": 1 }', remote: 'git@git.example.com:a/b.git' },
	],
] satisfies readonly (readonly [string, IRepository])[])(
	'an undeclared repository with %s',
	(_name, input) => {
		it('is served the default model by every reader, forge or not', async () => {
			const root = repository(input);

			const viaWork = await readWorkspacePolicy(root);
			const viaAssemble = assembledPolicy(root);

			expect(viaWork.profile).toBe('shared-checkout-merge');
			expect(viaWork.source).toBe('default');
			expect(viaAssemble).toEqual(viaWork);
			expect(agentPolicyInstructions(undefined, viaAssemble)).toBe(
				agentPolicyInstructions(undefined, viaWork),
			);
		});

		it('gets written exactly what was being enforced', async () => {
			const root = repository(input);
			const before = await readWorkspacePolicy(root);

			const result = await migrate(root);

			expect(result.outcomes.map((outcome) => outcome.status)).toEqual([
				'migrated',
			]);
			const written = JSON.parse(
				readFileSync(configPath(root), 'utf8'),
			) as {
				development: { profile: string; branches: object };
			};
			expect(written.development).toEqual(proposeAdoption(before).block);
			const { adoption, ...after } = await readWorkspacePolicy(root);
			expect(adoption).toEqual({ writtenTo: 'delendai.config.json' });
			expect({ ...after, source: before.source }).toEqual(before);
			expect(assembledPolicy(root)).toEqual(
				await readWorkspacePolicy(root),
			);
		});

		it('says so, everywhere, once it has written', async () => {
			const root = repository(input);
			const result = await migrate(root);

			const policy = await readWorkspacePolicy(root);

			expect(policyOriginNote(policy)).toContain('adopted and written');
			expect(agentPolicyInstructions(undefined, policy)).toContain(
				'adopted and written',
			);
			expect(await adoptionReportLines(result, root)).toEqual([
				expect.stringContaining('adopted and written'),
			]);
		});

		it('writes nothing on the second start', async () => {
			const root = repository(input);
			await migrate(root);
			const once = readFileSync(configPath(root), 'utf8');

			const second = await migrate(root);

			expect(second.outcomes).toEqual([{ status: 'not-needed' }]);
			expect(readFileSync(configPath(root), 'utf8')).toBe(once);
		});
	},
);

describe('an undeclared repository that uses the legacy fields', () => {
	it.each([
		['agentWorktree false', '{ "agentWorktree": false }'],
		['agentWorktree true', '{ "agentWorktree": true }'],
		[
			'a commit-policy branch',
			'{ "plugins": { "commit-policy": { "options": { "push": { "branch": "trunk" } } } } }',
		],
	])('keeps %s as written and as resolved', async (_name, config) => {
		const root = repository({ config, remote: GITHUB });
		const before = await readWorkspacePolicy(root);

		const result = await migrate(root);

		expect(before.source).toBe('legacy-compat');
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(readFileSync(configPath(root), 'utf8')).toBe(config);
		expect(await readWorkspacePolicy(root)).toEqual(before);
		expect(existsSync(join(root, '.delendai'))).toBe(false);
	});
});

describe('a repository that declared a policy', () => {
	it.each([
		['a profile', '{ "development": { "profile": "worktree-pr" } }'],
		['an empty block', '{ "development": {} }'],
	])('is never rewritten when it declared %s', async (_name, config) => {
		const root = repository({ config, remote: GITHUB });
		const before = await readWorkspacePolicy(root);

		await migrate(root);

		expect(readFileSync(configPath(root), 'utf8')).toBe(config);
		expect(await readWorkspacePolicy(root)).toEqual(before);
		expect(before.adoption).toBeUndefined();
	});
});
