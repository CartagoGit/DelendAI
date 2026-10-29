/**
 * account-sources.constant.ts — what the account sources look for. Data,
 * not vendors: a new vendor needs none of it to be found.
 */
import type {
	ILocalModelEndpoint,
	IPlanTool,
} from '../interfaces/account-finding.interface';

/** A variable named like a credential: read by name, never by value. */
export const CREDENTIAL_VARIABLE_PATTERN =
	/^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*?)_(?:API_KEY|API_TOKEN|ACCESS_TOKEN)$/u;

/**
 * Vendor tools that hold a plan login without being coding clients:
 * offered as accounts, never as workers.
 */
export const PLAN_TOOLS: readonly IPlanTool[] = [
	{
		command: 'mmx',
		vendor: 'minimax',
		label: 'MiniMax plan (mmx CLI)',
		loginStatusArgs: ['auth', 'status'],
		// `mmx auth status` answers JSON; an OAuth login is the plan's.
		loginKinds: [
			{
				pattern: '"method"\\s*:\\s*"oauth"',
				credentialMode: 'official-subscription-login',
				billingMode: 'subscription-included',
			},
		],
		quota: {
			args: ['quota', 'show', '--output', 'json', '--non-interactive'],
			format: 'mmx-model-remains',
		},
	},
];

/** Local servers that commonly answer `/v1/models` on these ports. */
export const LOCAL_MODEL_ENDPOINTS: readonly ILocalModelEndpoint[] = [
	{ name: 'ollama', port: 11_434 },
	{ name: 'lm-studio', port: 1234 },
];

/** How long a local endpoint may take to answer before it counts as absent. */
export const LOCAL_PROBE_TIMEOUT_MS = 1500;
