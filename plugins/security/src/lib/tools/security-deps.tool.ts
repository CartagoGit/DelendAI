import { access } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
	type IFinding,
} from '@mcp-vertex/core/public';
import { resolveWorkspaceContainedEffective } from '@mcp-vertex/core/lib/security/effective-containment';
import { listDeps, type IDepsInventory } from '@mcp-vertex/deps/public';

import {
	parseAuditJson,
	queryOsv,
	runAuditCommand,
	type AuditPackageManager,
	type IAuditExec,
	type IOsvFetch,
} from '../deps/exports';

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
});

const SUMMARY = z.object({
	critical: z.number(),
	high: z.number(),
	medium: z.number(),
	low: z.number(),
	info: z.number(),
});

const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	tool: z.string().optional(),
	scanned: z.number().optional(),
	findings: z.array(FINDING).optional(),
	summary: SUMMARY.optional(),
	worst: z.string().optional(),
	error: z.string().optional(),
	hint: z.string().optional(),
});

export interface ISecurityDepsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly auditExec?: IAuditExec;
	readonly osvFetch?: IOsvFetch;
	readonly listDeps?: (rootAbs: string) => Promise<IDepsInventory>;
}

const severityRank = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
} as const;

const detectPackageManager = async (
	rootAbs: string,
): Promise<AuditPackageManager> => {
	const probes: ReadonlyArray<{ file: string; kind: AuditPackageManager }> = [
		{ file: 'bun.lock', kind: 'bun' },
		{ file: 'bun.lockb', kind: 'bun' },
		{ file: 'package-lock.json', kind: 'npm' },
		{ file: 'yarn.lock', kind: 'yarn' },
	];
	for (const probe of probes) {
		try {
			await access(join(rootAbs, probe.file));
			return probe.kind;
		} catch {
			// keep probing
		}
	}
	return 'bun';
};

const baselineVersionFromRange = (range: string): string | undefined =>
	/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/u.exec(range)?.[1];

const filterSeverity = (
	findings: readonly IFinding[],
	severity: 'critical' | 'high' | 'medium' | 'low' | undefined,
): IFinding[] => {
	if (severity === undefined) return [...findings];
	return findings.filter((finding) => finding.severity === severity);
};

const sortFindings = (findings: readonly IFinding[]): IFinding[] =>
	[...findings].sort((left, right) => {
		const severityDiff =
			severityRank[right.severity] - severityRank[left.severity];
		if (severityDiff !== 0) return severityDiff;
		return left.ruleId.localeCompare(right.ruleId);
	});

export const buildSecurityDepsRegistration = (
	options: ISecurityDepsToolOptions,
): IToolRegistration => ({
	id: 'security_deps',
	summary:
		'Scan dependencies for known CVEs via bun/npm/yarn audit, with optional OSV enrichment.',
	tags: ['security', 'deps', 'network'],
	effects: ['network'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_security_deps`,
			{
				description:
					"Scan the project's dependencies for known vulnerabilities via bun/npm/yarn audit, normalize each result into the shared finding shape, and optionally enrich with OSV lookups. `json` selects the package manager (`auto` prefers the detected lockfile, else bun). `includeOsv` is opt-in and the only network call.",
				inputSchema: z
					.object({
						cwd: z.string().optional(),
						json: z.enum(['bun', 'npm', 'yarn', 'auto']).optional(),
						includeOsv: z.boolean().optional(),
						severity: z
							.enum(['critical', 'high', 'medium', 'low'])
							.optional(),
					})
					.strict(),
				outputSchema: OUTPUT_SCHEMA,
			},
			async (args: {
				cwd?: string | undefined;
				json?: 'bun' | 'npm' | 'yarn' | 'auto' | undefined;
				includeOsv?: boolean | undefined;
				severity?: 'critical' | 'high' | 'medium' | 'low' | undefined;
			}) => {
				let cwd = options.workspaceRootAbs;
				if (args.cwd !== undefined) {
					const contained = await resolveWorkspaceContainedEffective(
						options.workspaceRootAbs,
						args.cwd,
					);
					if (!contained.ok) {
						return toolError(
							`cwd "${args.cwd}" is not allowed`,
							contained.reason ??
								'cwd must stay inside the workspace after symlink resolution.',
						);
					}
					cwd = contained.abs;
				}
				const inventory = await (options.listDeps ?? listDeps)(cwd);
				const packageManager =
					args.json !== undefined && args.json !== 'auto'
						? args.json
						: await detectPackageManager(cwd);
				const audit = await runAuditCommand({
					cwd,
					packageManager,
					...(options.auditExec !== undefined
						? { exec: options.auditExec }
						: {}),
				});
				if (!audit.ok) {
					return toolJson({
						ok: false,
						error: audit.error,
						hint: audit.hint,
					});
				}
				let findings = parseAuditJson(audit.raw, {
					ecosystem: packageManager,
				});
				if (args.includeOsv === true) {
					const osvFindings = await Promise.all(
						inventory.deps
							.map((entry) => ({
								name: entry.name,
								version: baselineVersionFromRange(entry.range),
							}))
							.filter(
								(
									entry,
								): entry is { name: string; version: string } =>
									entry.version !== undefined,
							)
							.map((entry) =>
								queryOsv({
									package: {
										name: entry.name,
										ecosystem: 'npm',
										version: entry.version,
									},
									...(options.osvFetch !== undefined
										? { fetchImpl: options.osvFetch }
										: {}),
								}),
							),
					);
					findings = findings.concat(osvFindings.flat());
				}
				const filtered = sortFindings(
					filterSeverity(findings, args.severity),
				);
				return toolJson({
					ok: true,
					tool: 'deps',
					scanned: inventory.deps.length,
					findings: filtered,
					summary: summarizeFindings(filtered),
					worst: worstSeverity(filtered) ?? 'none',
				});
			},
		);
	},
});
