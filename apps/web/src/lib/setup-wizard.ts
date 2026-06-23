/**
 * setup-wizard.ts — pure render helper for the cross-project setup wizard
 * (f00030 S3).
 *
 * This mirrors the agnostic step engine in
 * `packages/core/src/lib/setup/setup-steps.ts` and the canonical 7-step
 * guide in `docs/CROSS-PROJECT-SETUP.md` (§"The 7 steps of `setup-github`").
 * The web wizard renders those same 7 steps statically; this module is the
 * single, testable source the `.astro` page maps over.
 *
 * Hard rule (f00030 §5.4): the commands emitted here must agree with the
 * canonical guide and `PRESET_CATALOG`. We therefore derive the launch
 * command from the catalog id (`--preset=full`) rather than hand-typing a
 * `--plugins=…` list that mirrors a preset's full membership (which the
 * `lint:setup` drift gate forbids). The minimal alternative
 * (`--plugins=proposals,issues`) is intentionally *not* a full preset, so it
 * stays drift-safe.
 *
 * Pure: ids + i18n strings in, an ordered step list out. No DOM, no I/O.
 */

/** Stable ids for the 7 canonical steps. Match the guide's table order. */
export const SETUP_STEP_IDS = [
	'detect-repo',
	'confirm-repo',
	'pick-auth-tier',
	'write-config',
	'verify-tier',
	'print-invocation',
	'mark-configured',
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** i18n strings the wizard needs, already resolved for one language. */
export interface ISetupWizardStrings {
	readonly detectRepoTitle: string;
	readonly detectRepoBody: string;
	readonly confirmRepoTitle: string;
	readonly confirmRepoBody: string;
	readonly pickAuthTierTitle: string;
	readonly pickAuthTierBody: string;
	readonly writeConfigTitle: string;
	readonly writeConfigBody: string;
	readonly verifyTierTitle: string;
	readonly verifyTierBody: string;
	readonly printInvocationTitle: string;
	readonly printInvocationBody: string;
	readonly markConfiguredTitle: string;
	readonly markConfiguredBody: string;
}

/** One rendered wizard step: a heading, an explanation, and a copyable command. */
export interface ISetupWizardStep {
	readonly id: SetupStepId;
	readonly index: number;
	readonly title: string;
	readonly body: string;
	/** Copy-pasteable shell or JSON snippet. Always present for the 7 steps. */
	readonly command: string;
	/** `bash` or `json` — drives the CodeBlock language chip. */
	readonly commandLang: 'bash' | 'json';
	/** Marked optional in the guide (step 7). */
	readonly optional: boolean;
}

/**
 * The per-repo config block step 4 writes. Kept tiny and identical to the
 * canonical guide / `setup-steps.ts` `configStep`.
 */
export const exampleConfigJson = (repo = 'owner/name'): string =>
	JSON.stringify({ plugins: { issues: { options: { repo } } } }, null, '\t');

/**
 * The launch command step 6 prints. Derived from the preferred preset id so
 * it stays in lockstep with the catalog (and the `lint:setup` drift gate).
 */
export const launchCommand = (presetId = 'full'): string =>
	`bunx @mcp-vertex/core --preset=${presetId}`;

/** The `mcp.json` server block step 6 prints (host-agnostic shape). */
export const mcpJsonSnippet = (presetId = 'full'): string =>
	JSON.stringify(
		{
			servers: {
				'mcp-vertex': {
					command: 'bunx',
					args: ['@mcp-vertex/core', `--preset=${presetId}`],
				},
			},
		},
		null,
		'\t',
	);

/**
 * Build the ordered 7-step wizard for one language. The shape mirrors the
 * canonical guide exactly: same ids, same order, same commands.
 */
export const buildSetupWizard = (
	s: ISetupWizardStrings,
): readonly ISetupWizardStep[] => {
	const steps: ReadonlyArray<
		Omit<ISetupWizardStep, 'index'> & { readonly index?: never }
	> = [
		{
			id: 'detect-repo',
			title: s.detectRepoTitle,
			body: s.detectRepoBody,
			command: 'git remote get-url origin',
			commandLang: 'bash',
			optional: false,
		},
		{
			id: 'confirm-repo',
			title: s.confirmRepoTitle,
			body: s.confirmRepoBody,
			command: 'mcp-vertex setup-github',
			commandLang: 'bash',
			optional: false,
		},
		{
			id: 'pick-auth-tier',
			title: s.pickAuthTierTitle,
			body: s.pickAuthTierBody,
			command: 'gh auth status   # or: export GITHUB_TOKEN=<your-token>',
			commandLang: 'bash',
			optional: false,
		},
		{
			id: 'write-config',
			title: s.writeConfigTitle,
			body: s.writeConfigBody,
			command: exampleConfigJson(),
			commandLang: 'json',
			optional: false,
		},
		{
			id: 'verify-tier',
			title: s.verifyTierTitle,
			body: s.verifyTierBody,
			command: launchCommand(),
			commandLang: 'bash',
			optional: false,
		},
		{
			id: 'print-invocation',
			title: s.printInvocationTitle,
			body: s.printInvocationBody,
			command: mcpJsonSnippet(),
			commandLang: 'json',
			optional: false,
		},
		{
			id: 'mark-configured',
			title: s.markConfiguredTitle,
			body: s.markConfiguredBody,
			command: 'mcp-vertex setup-github --mark-configured',
			commandLang: 'bash',
			optional: true,
		},
	];
	return steps.map((step, index) => ({ ...step, index: index + 1 }));
};
