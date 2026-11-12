/**
 * trusted-agent-packages.constant.ts — the setting that allows an agent
 * package to be fetched from the network and run.
 */

/**
 * The key in `delendai.config.json` listing the exact packages
 * (`name@version`) npx or uvx may fetch to start an agent that is not
 * installed. Nothing else is fetched: an agent the project did not allow
 * is refused, and the refusal names this key.
 */
export const TRUSTED_AGENT_PACKAGES_SETTING = 'trustedAgentPackages';
