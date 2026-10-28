import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPolicyAlignmentMigrator } from '../../../../src/lib/workspace-migration/migrators/policy-alignment.migrator';

const CONFIG = `{
	// the team's settings
	"development": { "profile": "shared-checkout-merge" },
	"plugins": {
		"commit-policy": {
			"options": {
				"push": { "enabled": true, "onCommit": true, "everyNMinutes": 15, "protectedBranches": ["master"] }
			}
		}
	}
}
`;

describe('policyAlignmentMigrator', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const workspace = (config: string): string => {
		const root = mkdtempSync(join(tmpdir(), 'policy-alignment-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
		writeFileSync(join(root, 'delendai.config.json'), config);
		return root;
	};

	it('removes the automatic pushes the profile refuses, keeping the rest and the comments', async () => {
		const root = workspace(CONFIG);
		const migrator = createPolicyAlignmentMigrator();
		expect(
			await migrator.detect({ workspaceRoot: root, dryRun: false })
		).toBe(true);
		expect(
			(await migrator.plan({ workspaceRoot: root, dryRun: true }))[0]
				?.detail
		).toContain('onCommit');
		await migrator.apply({ workspaceRoot: root, dryRun: false });
		const text = readFileSync(join(root, 'delendai.config.json'), 'utf8');
		expect(text).toContain("// the team's settings");
		expect(text).not.toContain('onCommit');
		expect(text).not.toContain('everyNMinutes');
		expect(text).toContain('"protectedBranches"');
		expect(
			await migrator.detect({ workspaceRoot: root, dryRun: false })
		).toBe(false);
	});

	it('leaves a configuration the profile does not contradict alone', async () => {
		const root = workspace(
			CONFIG.replace('shared-checkout-merge', 'shared-direct')
		);
		expect(
			await createPolicyAlignmentMigrator().detect({
				workspaceRoot: root,
				dryRun: false,
			})
		).toBe(false);
	});
});

describe('policyAlignmentMigrator — the push target that stops the start', () => {
	// A `push.branch` naming the integration branch under a profile that
	// reaches it through the forge is not a warning the owner reads: it
	// is a refusal that stops the server. The owner learns it as a dead
	// editor integration. The migration that removes the settings the
	// profile contradicts removes this one too.
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const workspace = (config: string): string => {
		const root = mkdtempSync(join(tmpdir(), 'policy-alignment-target-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
		writeFileSync(join(root, 'delendai.config.json'), config);
		return root;
	};

	const WITH_TARGET = `{
	// the team's settings
	"development": { "profile": "shared-checkout-pr", "branches": { "integration": "develop" } },
	"plugins": {
		"commit-policy": {
			"options": {
				"push": { "enabled": true, "remote": "origin", "branch": "develop" }
			}
		}
	}
}
`;

	it('removes the push target the profile refuses, keeping the rest and the comments', async () => {
		const root = workspace(WITH_TARGET);
		const migrator = createPolicyAlignmentMigrator();
		expect(
			await migrator.detect({ workspaceRoot: root, dryRun: false })
		).toBe(true);
		const steps = await migrator.plan({
			workspaceRoot: root,
			dryRun: true,
		});
		expect(steps[0]?.detail).toContain('push.branch');
		await migrator.apply({ workspaceRoot: root, dryRun: false });
		const text = readFileSync(join(root, 'delendai.config.json'), 'utf8');
		expect(text).toContain("// the team's settings");
		expect(text).not.toContain('"branch"');
		// The rest of the push settings are the owner's.
		expect(text).toContain('"remote": "origin"');
		expect(text).toContain('"enabled": true');
		expect(
			await migrator.detect({ workspaceRoot: root, dryRun: false })
		).toBe(false);
	});

	it('leaves a push target that is not the integration branch alone', async () => {
		// A feature branch is a legitimate push target: the rule names
		// the branch the profile integrates through the forge, and only
		// that one.
		const root = workspace(
			WITH_TARGET.replace('"branch": "develop"', '"branch": "feature/x"')
		);
		expect(
			await createPolicyAlignmentMigrator().detect({
				workspaceRoot: root,
				dryRun: false,
			})
		).toBe(false);
	});
});
