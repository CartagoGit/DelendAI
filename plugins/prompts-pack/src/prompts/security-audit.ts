import z from 'zod';

import {
	buildTemplatedPrompt,
	type ITemplatedPromptRegistration,
} from './shared';

const SecurityAuditArgsSchema = z
	.object({
		file: z.string().min(1),
	})
	.strict();

export type ISecurityAuditThisFileArgs = z.infer<
	typeof SecurityAuditArgsSchema
>;

export const buildSecurityAuditThisFilePrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<ISecurityAuditThisFileArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'security-audit-this-file',
		description:
			'Run a focused security review for one file using shipped security and env tools as grounding.',
		argsSchema: SecurityAuditArgsSchema,
		arguments: [
			{
				name: 'file',
				description: 'Workspace-relative file path to audit.',
				required: true,
			},
		],
		template: ({ file }) =>
			[
				`Perform a security review focused on ${file}.`,
				'',
				'Use `delendai_env_env_check` first when runtime configuration or required executables could affect the analysis.',
				'Use `delendai_security_security_secrets` for credential or token leakage signals.',
				'Use `delendai_security_security_sast` for code-level findings in the file and nearby flows.',
				'Use `delendai_security_security_audit` to place file-level findings in project-level posture context.',
				'',
				'Report findings in this order:',
				'- exploitability and impact',
				'- exact file or line anchor',
				'- concrete remediation',
				'- follow-up checks still required',
				'',
				'Prefer grounded findings over broad checklists; if the file looks safe, say what was checked and what remains out of scope.',
			].join('\n'),
	});
