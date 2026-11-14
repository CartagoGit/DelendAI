#!/usr/bin/env bun
/**
 * land-workflow.script.ts — renders this repository's instance of the land
 * workflow template. `--check` fails when the committed file differs.
 *
 * The policy is the one switch: the file exists only while
 * `development.integration.engine` is `land`, and the protocol the policy
 * records is the one this code speaks.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

import {
	DEFAULT_INTEGRATION_OPTIONS,
	INTEGRATION_PROTOCOL_VERSION,
	landWorkflowInputOf,
	renderLandSignalWorkflow,
	renderLandWorkflow,
	type ILandWorkflowInput,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { readDevelopmentConfig } from './land-policy';

export const LAND_WORKFLOW_PATH = '.github/workflows/land.yml';
export const LAND_SIGNAL_WORKFLOW_PATH = '.github/workflows/land-signal.yml';

const SETUP_STEPS = [
	'- name: Checkout (required to resolve the local composite action)',
	'  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
	'  with:',
	'      # The integrator pushes as its identity, never with this token.',
	'      persist-credentials: false',
	'',
	'- name: Setup repo (checkout + bun + install)',
	'  uses: ./.github/actions/setup-bun-repo',
	'  with:',
	'      # Full history: a batch merges members onto the tip, and the',
	'      # promotion and the forward sync ask ancestry questions.',
	"      fetch-depth: '0'",
	"      persist-credentials: 'false'",
];

/** This repository's values for the template, apart from what the policy sets. */
const REPO_VALUES: Parameters<typeof landWorkflowInputOf>[0] = {
	integrationBranch: 'develop',
	releaseBranch: 'main',
	passCommand: 'bun packages/cli/src/index.ts integration pass',
	promotionCommand:
		'bun tools/scripts/forge/open-promotion.script.ts --apply',
	forwardSyncCommand: 'bun run forge:forward-sync -- --apply',
	setupSteps: SETUP_STEPS,
	upkeep: [
		{
			name: 'Reap the refs whose pull requests are finished',
			run: 'bun run lint:ref-lifecycle -- --reap',
			env: { REF_LIFECYCLE_SCOPE: 'repository' },
		},
		{
			name: 'Close the pull requests not opened from a publication',
			run: 'bun tools/scripts/forge/close-unpublished-prs.script.ts --apply',
		},
		{
			name: 'Fail while something hangs on the forge',
			run: 'bun run work:doctor -- --forge',
		},
		{
			name: 'Fail while a code scanning alert is open on the integration branch',
			run: 'bun run forge:promotion-alerts -- --branch=develop',
		},
	],
};

/** This repository's values for the template. */
export const REPO_LAND_WORKFLOW: ILandWorkflowInput = landWorkflowInputOf(
	REPO_VALUES,
	{
		identity: DEFAULT_INTEGRATION_OPTIONS.identity,
		cron: DEFAULT_INTEGRATION_OPTIONS.watchdog.cron,
	},
);

/** What the committed file must be: the render, or absent when the engine is not `land`. */
export const expectedLandWorkflow = (
	development: ReturnType<typeof readDevelopmentConfig>,
): string | undefined => {
	const { integration } = resolveDevelopmentPolicy(development);
	return integration.engine === 'land'
		? renderLandWorkflow(
				landWorkflowInputOf(REPO_VALUES, {
					identity: integration.identity,
					cron: integration.watchdog.cron,
				}),
			)
		: undefined;
};

/** The signal that wakes the integrator: written beside the land workflow, absent with it. */
export const expectedLandSignalWorkflow = (
	development: ReturnType<typeof readDevelopmentConfig>,
): string | undefined =>
	resolveDevelopmentPolicy(development).integration.engine === 'land'
		? renderLandSignalWorkflow({
				integrationBranch: REPO_LAND_WORKFLOW.integrationBranch,
			})
		: undefined;

/** The committed file, or `undefined` when there is none: one read, no check before it. */
const readCommitted = (path: string): string | undefined => {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return undefined;
		throw error;
	}
};

if (import.meta.main) {
	const development = readDevelopmentConfig();
	const recorded = resolveDevelopmentPolicy(development).integration.protocol;
	if (recorded !== INTEGRATION_PROTOCOL_VERSION) {
		console.error(
			`delendai.config.json records integration protocol ${String(recorded)}; this code speaks ${String(INTEGRATION_PROTOCOL_VERSION)}. Record development.integration.protocol: ${String(INTEGRATION_PROTOCOL_VERSION)} in the same change.`,
		);
		process.exit(1);
	}
	const files = [
		{
			path: LAND_WORKFLOW_PATH,
			expected: expectedLandWorkflow(development),
		},
		{
			path: LAND_SIGNAL_WORKFLOW_PATH,
			expected: expectedLandSignalWorkflow(development),
		},
	];
	if (process.argv.includes('--check')) {
		const stale = files.filter(
			({ path, expected }) => readCommitted(path) !== expected,
		);
		for (const { path } of stale)
			console.error(
				`${path} differs from its template and the policy's engine; run land-workflow.script.ts`,
			);
		process.exit(stale.length === 0 ? 0 : 1);
	}
	for (const { path, expected } of files)
		if (expected === undefined) rmSync(path, { force: true });
		else writeFileSync(path, expected);
}
