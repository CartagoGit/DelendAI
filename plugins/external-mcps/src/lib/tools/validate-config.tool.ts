/**
 * validate-config.tool.ts — `<prefix>_validate_config` (f00068 S1).
 *
 * Dry-runs a proposed `plugins.external-mcps.servers` patch against the
 * Zod contract WITHOUT applying anything — writing config stays with the
 * human/host (the suggest/ack flow lands in S3). Enforced here:
 *
 * - mandatory exact version pin (`missing-version-pin` for `latest`);
 * - kebab-case server ids (`invalid-server-id`);
 * - env entries are variable NAMES only (`env-value-not-allowed` for
 *   `NAME=VALUE`, `cleartext-secret-suspected` for token-looking blobs).
 *
 * Pure and read-only: no filesystem, no network, no state.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import { ServersSchema } from '../options-schema';

export interface IValidateConfigToolOptions {
	readonly namespacePrefix: string;
}

const InputSchema = z.object({
	/** The proposed `servers` record (kebab-case id → server entry). */
	servers: z.record(z.string(), z.unknown()),
});

export const ValidateConfigOutputSchema = z.object({
	/** True when the patch is safe to apply as-is. */
	ok: z.boolean(),
	/** Human/LLM-actionable issues (empty when ok). */
	issues: z.array(z.string()),
});

export interface IValidationResult {
	readonly ok: boolean;
	readonly issues: readonly string[];
}

const formatPath = (path: ReadonlyArray<PropertyKey>): string =>
	['servers', ...path.map(String)].join('.');

/**
 * Pure dry-run of a proposed `servers` patch. Returns every issue at
 * once (no fail-fast) so the LLM can fix the whole patch in one turn.
 */
export const validateServersPatch = (servers: unknown): IValidationResult => {
	const parsed = ServersSchema.safeParse(servers);
	if (parsed.success) return { ok: true, issues: [] };
	const issues = [
		...new Set(
			parsed.error.issues.map(
				(issue) => `${formatPath(issue.path)}: ${issue.message}`,
			),
		),
	];
	return { ok: false, issues };
};

export const buildValidateConfigToolRegistration = (
	options: IValidateConfigToolOptions,
): IToolRegistration => ({
	id: 'validate_config',
	tags: ['external-mcps', 'lazy', 'config'],
	summary:
		'Dry-run a proposed external-servers config patch against the schema — never writes.',
	descriptionKey: 'delendai_external-mcps_validate_config',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_validate_config`,
			{
				description:
					'Dry-run a proposed `plugins.external-mcps.servers` patch against the config schema and return {ok, issues[]}. Enforces the mandatory exact version pin (rejects "latest" — supply-chain rule), kebab-case server ids, and env entries by variable NAME only (rejects NAME=VALUE assignments and cleartext-looking tokens). Validation only: this tool NEVER writes the config — apply the patch yourself after it passes.',
				inputSchema: InputSchema,
				outputSchema: ValidateConfigOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const result = validateServersPatch(args.servers);
				return toolJson({
					ok: result.ok,
					issues: [...result.issues],
				});
			},
		);
	},
});
