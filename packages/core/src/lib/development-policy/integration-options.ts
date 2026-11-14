/**
 * integration-options.ts — merges a project's `development.integration`
 * options onto a profile's defaults, one nested block at a time.
 */
import type { IPolicyIntegrationOptions } from '../contracts/interfaces/integration-engine.interface';
import type { IDevelopmentConfigInput } from './resolve.interface';

type IIntegrationInput = NonNullable<IDevelopmentConfigInput['integration']>;

export const resolveIntegrationOptions = (
	input: IIntegrationInput | undefined,
	base: IPolicyIntegrationOptions,
): IPolicyIntegrationOptions => ({
	identity: {
		kind: (input?.identity?.kind ??
			base.identity
				.kind) as IPolicyIntegrationOptions['identity']['kind'],
		appIdVariable:
			input?.identity?.appIdVariable ?? base.identity.appIdVariable,
		keySecret: input?.identity?.keySecret ?? base.identity.keySecret,
		tokenSecret: input?.identity?.tokenSecret ?? base.identity.tokenSecret,
	},
	batching: (input?.batching ??
		base.batching) as IPolicyIntegrationOptions['batching'],
	labels: { prefix: input?.labels?.prefix ?? base.labels.prefix },
	derived: {
		paths: [...(input?.derived?.paths ?? base.derived.paths)],
		command: input?.derived?.command ?? base.derived.command,
	},
	commands: {
		jobs: input?.commands?.jobs ?? base.commands.jobs,
		normalizeBatch:
			input?.commands?.normalizeBatch ?? base.commands.normalizeBatch,
	},
	zones: [...(input?.zones ?? base.zones)],
	signalWorkflows: [...(input?.signalWorkflows ?? base.signalWorkflows)],
	scanWorkflows: [...(input?.scanWorkflows ?? base.scanWorkflows)],
	watchdog: {
		enabled: input?.watchdog?.enabled ?? base.watchdog.enabled,
		cron: input?.watchdog?.cron ?? base.watchdog.cron,
	},
	rehearsal: {
		secrets: [...(input?.rehearsal?.secrets ?? base.rehearsal.secrets)],
		scenarios: [
			...(input?.rehearsal?.scenarios ?? base.rehearsal.scenarios),
		],
	},
});
