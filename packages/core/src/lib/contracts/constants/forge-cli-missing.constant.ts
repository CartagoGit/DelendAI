/**
 * forge-cli-missing.constant.ts — what a start says when the forge's CLI is not installed.
 */

/** What a start says when the forge tool is not installed. */
export const FORGE_CLI_MISSING_NOTE =
	'the forge CLI is not installed here, so pull requests, CI state and forge governance are not read at start. Install it (GitHub: `gh`, then `gh auth login`) to have them checked, or set `development.governance.strategy` to `none` if this project does not govern its forge.';
