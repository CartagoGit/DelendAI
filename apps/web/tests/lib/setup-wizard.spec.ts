import { describe, expect, it } from 'vitest';

import {
	SETUP_STEP_IDS,
	buildSetupWizard,
	exampleConfigJson,
	launchCommand,
	mcpJsonSnippet,
	type ISetupWizardStrings,
} from '../../src/lib/setup-wizard';

/** Distinct sentinel strings so we can assert each maps to the right step. */
const strings: ISetupWizardStrings = {
	detectRepoTitle: 'detect-title',
	detectRepoBody: 'detect-body',
	confirmRepoTitle: 'confirm-title',
	confirmRepoBody: 'confirm-body',
	pickAuthTierTitle: 'auth-title',
	pickAuthTierBody: 'auth-body',
	writeConfigTitle: 'write-title',
	writeConfigBody: 'write-body',
	verifyTierTitle: 'verify-title',
	verifyTierBody: 'verify-body',
	printInvocationTitle: 'print-title',
	printInvocationBody: 'print-body',
	markConfiguredTitle: 'mark-title',
	markConfiguredBody: 'mark-body',
};

describe('setup-wizard', () => {
	describe('buildSetupWizard', () => {
		it('emits exactly the 7 canonical steps in guide order', () => {
			const steps = buildSetupWizard(strings);
			expect(steps).toHaveLength(7);
			expect(steps.map((s) => s.id)).toEqual([...SETUP_STEP_IDS]);
		});

		it('numbers steps 1..7', () => {
			const steps = buildSetupWizard(strings);
			expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		});

		it('maps each i18n title/body onto its step', () => {
			const steps = buildSetupWizard(strings);
			const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
			expect(byId['detect-repo']?.title).toBe('detect-title');
			expect(byId['detect-repo']?.body).toBe('detect-body');
			expect(byId['mark-configured']?.title).toBe('mark-title');
		});

		it('marks only the final step optional', () => {
			const steps = buildSetupWizard(strings);
			const optional = steps.filter((s) => s.optional).map((s) => s.id);
			expect(optional).toEqual(['mark-configured']);
		});

		it('gives every step a non-empty copyable command + lang', () => {
			for (const step of buildSetupWizard(strings)) {
				expect(step.command.length).toBeGreaterThan(0);
				expect(['bash', 'json']).toContain(step.commandLang);
			}
		});
	});

	describe('emitted commands agree with the catalog / canonical guide', () => {
		it('launch command uses --preset=full (not a hand-typed plugin list)', () => {
			expect(launchCommand()).toBe('bunx @mcp-vertex/core --preset=full');
		});

		it('mcp.json snippet uses the same preset arg', () => {
			const snippet = mcpJsonSnippet();
			const parsed = JSON.parse(snippet);
			expect(parsed.servers['mcp-vertex'].args).toEqual([
				'@mcp-vertex/core',
				'--preset=full',
			]);
		});

		it('config block writes only plugins.issues.options.repo', () => {
			const parsed = JSON.parse(exampleConfigJson('acme/widgets'));
			expect(parsed).toEqual({
				plugins: { issues: { options: { repo: 'acme/widgets' } } },
			});
		});

		it('config block defaults the repo to a placeholder slug', () => {
			const parsed = JSON.parse(exampleConfigJson());
			expect(parsed.plugins.issues.options.repo).toBe('owner/name');
		});
	});
});
