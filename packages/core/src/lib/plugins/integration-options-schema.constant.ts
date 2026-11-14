/**
 * integration-options-schema.constant.ts — the options of the integration
 * plugin inside `development.integration`. Names only: a secret's value is
 * never written in configuration.
 */
import { z } from 'zod';

import {
	INTEGRATION_BATCHING_MODES,
	INTEGRATION_IDENTITY_KINDS,
} from '../contracts/interfaces/integration-engine.interface';
import { documentedEnum } from './config-schema-docs';

const names = (description: string) =>
	z.array(z.string().min(1).describe(description));

export const IntegrationOptionsShape = {
	identity: z
		.object({
			kind: documentedEnum(INTEGRATION_IDENTITY_KINDS, {
				app: 'a GitHub App: the integrator mints an installation token for each job',
				pat: 'a personal access token kept in a secret, for a project that cannot install an App',
			})
				.describe(
					'Who the integrator acts as. Never the workflow token, which starts no workflow for what it pushes or merges.',
				)
				.optional(),
			appIdVariable: z
				.string()
				.min(1)
				.describe('For `app`: the variable that holds the App id.')
				.optional(),
			keySecret: z
				.string()
				.min(1)
				.describe(
					'For `app`: the name of the secret that holds the App private key.',
				)
				.optional(),
			tokenSecret: z
				.string()
				.min(1)
				.describe(
					'For `pat`: the name of the secret that holds the token.',
				)
				.optional(),
		})
		.strict()
		.describe('The identity the integrator’s token is minted from.')
		.optional(),
	batching: documentedEnum(INTEGRATION_BATCHING_MODES, {
		overlap:
			'overlapping ready pull requests are built once, as one batch pull request',
		off: 'every pull request is built and merged on its own',
	})
		.describe('Whether overlapping pull requests are batched.')
		.optional(),
	labels: z
		.object({
			prefix: z
				.string()
				.min(1)
				.describe('The prefix of the labels the integrator owns.')
				.optional(),
		})
		.strict()
		.describe('The labels the integrator applies.')
		.optional(),
	derived: z
		.object({
			paths: names(
				'A path or glob of a generated file the integrator may regenerate.',
			)
				.describe(
					'The only paths a derived-file resolution may change.',
				)
				.optional(),
			command: z
				.string()
				.describe(
					'The command that regenerates the derived files after a merge.',
				)
				.optional(),
		})
		.strict()
		.describe('How a conflict in generated files is resolved.')
		.optional(),
	commands: z
		.object({
			jobs: z
				.string()
				.describe(
					'A command that prints the zones a change from <base> to <head> can affect, one per line, or `*` for all; both revisions are appended as arguments.',
				)
				.optional(),
			normalizeBatch: z
				.string()
				.describe(
					'A command run in a batch tree after its members merged and before the derived files are regenerated.',
				)
				.optional(),
		})
		.strict()
		.describe('Commands the project owns that the integrator runs.')
		.optional(),
	zones: names('A glob that declares one zone of the project.')
		.describe(
			'The zones (sections) the project is split into, used to group pull requests and to dispatch CI.',
		)
		.optional(),
	signalWorkflows: names('The name of a workflow.')
		.describe(
			'The workflows whose completion signals the integrator to run a pass.',
		)
		.optional(),
	scanWorkflows: names('The name of a workflow.')
		.describe(
			'The workflows that scan the integration branch after a merge.',
		)
		.optional(),
	watchdog: z
		.object({
			enabled: z
				.boolean()
				.describe('Whether the hourly safety net runs.')
				.optional(),
			cron: z
				.string()
				.min(1)
				.describe('The schedule of the safety net.')
				.optional(),
		})
		.strict()
		.describe(
			'An alarm, not a poll loop: any action it takes counts as a missed event.',
		)
		.optional(),
	rehearsal: z
		.object({
			secrets: names('The name of a secret the rehearsal reads.')
				.describe('The secret names the rehearsal needs.')
				.optional(),
			scenarios: names('A scenario id, or `all`.')
				.describe('The scenarios a rehearsal runs by default.')
				.optional(),
		})
		.strict()
		.describe('What the rehearsal of the pull request flow reads and runs.')
		.optional(),
};
