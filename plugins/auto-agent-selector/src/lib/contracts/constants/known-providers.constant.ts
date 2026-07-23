/**
 * known-providers.constant.ts — the catalogue of providers auto-agent-selector
 * knows how to detect.
 *
 * This is DATA, not a routing decision (see f00119 non-goals): the cost tiers
 * are first-pass defaults a later slice refreshes from config / live pricing,
 * and the API-key candidates cover more than one env-var name because vendors
 * disagree (Google accepts `GEMINI_API_KEY` OR `GOOGLE_API_KEY`). Adding a new
 * provider is one row here — nothing else changes.
 */

/** A known CLI agent, detected by `command -v <command>` on PATH. */
export interface IKnownCli {
	readonly id: string;
	readonly label: string;
	readonly vendor: string;
	readonly command: string;
	readonly costTier: 1 | 2 | 3 | 4 | 5;
	/** One command that installs it (shown when it is missing). */
	readonly installHint: string;
}

/** A known API provider, detected by the presence of any of `envVars` in env. */
export interface IKnownApi {
	readonly id: string;
	readonly label: string;
	readonly vendor: string;
	/** Candidate env vars, in priority order; the first present one wins. */
	readonly envVars: readonly string[];
	readonly costTier: 1 | 2 | 3 | 4 | 5;
}

/**
 * CLI agents. `costTier` reflects the typical subscription/usage weight of the
 * default model each fronts — a starting point the user/calibration overrides.
 */
export const KNOWN_CLIS: readonly IKnownCli[] = [
	{
		id: 'claude-cli',
		label: 'Claude Code (CLI)',
		vendor: 'anthropic',
		command: 'claude',
		costTier: 4,
		installHint: 'npm install -g @anthropic-ai/claude-code',
	},
	{
		id: 'codex-cli',
		label: 'Codex (CLI)',
		vendor: 'openai',
		command: 'codex',
		costTier: 4,
		installHint: 'npm install -g @openai/codex',
	},
	{
		id: 'copilot-cli',
		label: 'GitHub Copilot (CLI)',
		vendor: 'github',
		command: 'copilot',
		costTier: 3,
		installHint: 'npm install -g @github/copilot',
	},
	{
		id: 'gemini-cli',
		label: 'Gemini (CLI)',
		vendor: 'google',
		command: 'gemini',
		costTier: 2,
		installHint: 'npm install -g @google/gemini-cli',
	},
	{
		id: 'aider-cli',
		label: 'Aider (CLI)',
		vendor: 'multi',
		command: 'aider',
		costTier: 2,
		installHint: 'python -m pip install aider-install && aider-install',
	},
];

/**
 * API providers, detected by an env key. `costTier` is a coarse default for
 * the vendor's flagship tier; cheaper models under the same key are added by a
 * later slice (per-model entries) once the user picks them.
 */
export const KNOWN_APIS: readonly IKnownApi[] = [
	{
		id: 'anthropic-api',
		label: 'Anthropic (API)',
		vendor: 'anthropic',
		envVars: ['ANTHROPIC_API_KEY'],
		costTier: 4,
	},
	{
		id: 'openai-api',
		label: 'OpenAI (API)',
		vendor: 'openai',
		envVars: ['OPENAI_API_KEY'],
		costTier: 4,
	},
	{
		id: 'google-api',
		label: 'Google Gemini (API)',
		vendor: 'google',
		envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
		costTier: 2,
	},
	{
		id: 'openrouter-api',
		label: 'OpenRouter (API)',
		vendor: 'openrouter',
		envVars: ['OPENROUTER_API_KEY'],
		costTier: 2,
	},
	{
		id: 'groq-api',
		label: 'Groq (API)',
		vendor: 'groq',
		envVars: ['GROQ_API_KEY'],
		costTier: 1,
	},
	{
		id: 'deepseek-api',
		label: 'DeepSeek (API)',
		vendor: 'deepseek',
		envVars: ['DEEPSEEK_API_KEY'],
		costTier: 1,
	},
	{
		id: 'mistral-api',
		label: 'Mistral (API)',
		vendor: 'mistral',
		envVars: ['MISTRAL_API_KEY'],
		costTier: 2,
	},
	{
		id: 'xai-api',
		label: 'xAI Grok (API)',
		vendor: 'xai',
		envVars: ['XAI_API_KEY'],
		costTier: 3,
	},
];
