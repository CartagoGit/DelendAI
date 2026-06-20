import { z } from 'zod';

import type {
	IToolRegistration,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import {
	auditRetiredReferences,
	DEFAULT_RETIRED_PATTERNS,
} from './rename-audit-engine';

export interface IRenameAuditToolOptions {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
}

/** Escape a literal string for use inside a `RegExp`. */
const escapeRegExp = (raw: string): string =>
	raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `<prefix>_rename_audit` — a host-only tool, not a generic plugin (this repo's own dogfooding host-config). */
export const buildRenameAuditToolRegistration = (
	options: IRenameAuditToolOptions,
): IToolRegistration => ({
	id: 'rename_audit',
	summary:
		'Scan tracked source files for identifiers left over from a past rename.',
	tags: ['repo', 'maintenance'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_rename_audit`,
			{
				description:
					'Scan tracked source files (.ts/.tsx/.astro/.json/.scss — markdown excluded, audits/CHANGELOG legitimately keep historical names) for retired identifiers from past mcp-vertex renames (default: @mcp-server, mcp-core, mcpcore_, mcpvertex_ without a hyphen). Pass `extraPatterns` (literal strings) to also check ad-hoc names during a new rename. Read-only, offline.',
				inputSchema: z.object({
					extraPatterns: z.array(z.string()).optional(),
				}),
				outputSchema: z.object({
					findings: z.array(
						z.object({
							pattern: z.string(),
							file: z.string(),
							line: z.number(),
							snippet: z.string(),
						}),
					),
					clean: z.boolean(),
				}),
			},
			async (args: { extraPatterns?: string[] | undefined }) => {
				const extra = (args.extraPatterns ?? []).map((raw) => ({
					name: raw,
					pattern: new RegExp(escapeRegExp(raw), 'g'),
				}));
				const findings = await auditRetiredReferences({
					workspaceRootAbs: options.workspace.root,
					patterns: [...DEFAULT_RETIRED_PATTERNS, ...extra],
				});
				return toolJson({ findings, clean: findings.length === 0 });
			},
		);
	},
});
