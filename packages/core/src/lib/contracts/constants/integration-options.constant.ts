import type { IPolicyIntegrationOptions } from '../interfaces/integration-engine.interface';

/**
 * The integration options every profile starts from. Only names appear:
 * the values of an identity live in the forge's secrets, never in policy.
 */
export const DEFAULT_INTEGRATION_OPTIONS: IPolicyIntegrationOptions = {
	identity: {
		kind: 'app',
		appIdVariable: 'DELENDAI_APP_ID',
		keySecret: 'DELENDAI_APP_PRIVATE_KEY',
		tokenSecret: 'DELENDAI_INTEGRATOR_TOKEN',
	},
	batching: 'overlap',
	labels: { prefix: 'delendai' },
	derived: { paths: [], command: '' },
	commands: { jobs: '', normalizeBatch: '' },
	zones: [],
	signalWorkflows: [],
	scanWorkflows: [],
	watchdog: { enabled: true, cron: '17 * * * *' },
	rehearsal: { secrets: [], scenarios: ['all'] },
};
