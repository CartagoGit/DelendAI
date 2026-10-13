/**
 * forge-cli-missing.helper.ts — whether the forge could not be read only
 * because its command-line tool is not installed.
 *
 * A project that never installed `gh` was told at every start that the
 * reconciliation was DEGRADED, with two ERROR blockers it could clear only
 * by installing a tool it may not use, while nothing was actually blocked.
 * A missing tool is a fact about this machine, not a fault in the
 * repository: it is noted, with what is not checked and how to check it.
 * A tool that is installed and fails is still a blocker.
 */

const MISSING_TOOL =
	/(?:not found in \$PATH|command not found|executable not found|\bENOENT\b|no such file or directory)/iu;

export const forgeCliMissing = (reason: string): boolean =>
	MISSING_TOOL.test(reason);

export { FORGE_CLI_MISSING_NOTE } from '../contracts/constants/forge-cli-missing.constant';
