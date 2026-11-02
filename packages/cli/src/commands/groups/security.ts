/**
 * security commands — the CLI surface for the security plugin's scanners.
 * 1:1 delegation to the `security_*` MCP tools so a human can run the
 * secret scan and the full posture audit straight from the terminal.
 *
 * Tools mapped:
 *   - `delendai_security_security_secrets` ({ scope?, includeTests? })
 *   - `delendai_security_security_audit`   (no args)
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, hasFlag, request, scalarArg } from './group-helpers';

const SECRETS = 'delendai_security_security_secrets';
const AUDIT = 'delendai_security_security_audit';

const securitySecretsCommand: ICliCommand = {
	name: 'security secrets',
	summary:
		'Scan source for leaked secrets (keys, tokens, private keys). Offline, redacted.',
	async run(args, ctx) {
		const scope = scalarArg(args, 'scope');
		const payload: Record<string, unknown> = {};
		if (scope === 'changed' || scope === 'tracked') payload.scope = scope;
		if (hasFlag(args, 'include-tests')) payload.includeTests = true;
		return data(await request(ctx, SECRETS, payload));
	},
};

const securityAuditCommand: ICliCommand = {
	name: 'security audit',
	summary:
		'Run every security scanner (secrets + dependency CVEs + licenses) → one ranked backlog.',
	async run(_args, ctx) {
		return data(await request(ctx, AUDIT, {}));
	},
};

export const securityCommands: readonly ICliCommand[] = [
	securitySecretsCommand,
	securityAuditCommand,
];
