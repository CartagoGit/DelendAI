#!/usr/bin/env bun
import { resolve } from 'node:path';

import {
	MIGRATED_PLUGIN_IDS,
	discoverPluginPackages,
	loadMigratedPluginManifests,
} from '../generate/from-manifests.script.ts';

type LintMode = 'migrated-only' | 'strict-all';

export interface IPluginManifestLintFinding {
	readonly kind:
		| 'manifest-without-package'
		| 'metadata-mismatch'
		| 'public-package-missing-manifest'
		| 'pending-migration';
	readonly relPath: string;
	readonly detail: string;
	readonly severity: 'error' | 'info';
}

export interface IPluginManifestLintReport {
	readonly mode: LintMode;
	readonly findings: readonly IPluginManifestLintFinding[];
	readonly errors: number;
	readonly pending: number;
	readonly ok: boolean;
}

const formatFinding = (finding: IPluginManifestLintFinding): string =>
	`${finding.severity === 'error' ? 'ERROR' : 'INFO '} ${finding.relPath} [${finding.kind}] ${finding.detail}`;

export const lintPluginManifests = async (
	root = process.cwd(),
	mode: LintMode = 'migrated-only',
): Promise<IPluginManifestLintReport> => {
	const findings: IPluginManifestLintFinding[] = [];
	const packages = await discoverPluginPackages(root);
	const packageById = new Map(packages.map((pkg) => [pkg.id, pkg] as const));
	const loaded = await loadMigratedPluginManifests(root).catch((error) => {
		findings.push({
			kind: 'manifest-without-package',
			relPath: 'plugins',
			detail: error instanceof Error ? error.message : String(error),
			severity: 'error',
		});
		return [];
	});
	const loadedById = new Map(
		loaded.map((entry) => [entry.id, entry] as const),
	);

	for (const pluginId of MIGRATED_PLUGIN_IDS) {
		const pkg = packageById.get(pluginId);
		const manifest = loadedById.get(pluginId);
		if (pkg === undefined) {
			findings.push({
				kind: 'manifest-without-package',
				relPath: `plugins/${pluginId}/plugin.manifest.ts`,
				detail: 'migrated manifest points at a plugin directory without package.json',
				severity: 'error',
			});
			continue;
		}
		if (manifest === undefined) {
			findings.push({
				kind: 'public-package-missing-manifest',
				relPath: pkg.packagePath,
				detail: 'migrated public plugin is missing plugin.manifest.ts',
				severity: 'error',
			});
			continue;
		}
		if (
			manifest.manifest.package !== pkg.packageName ||
			manifest.manifest.version !== pkg.version ||
			(manifest.manifest.visibility === 'public') === pkg.private
		) {
			findings.push({
				kind: 'metadata-mismatch',
				relPath: manifest.manifestPath,
				detail: 'manifest package/version/visibility must match the plugin package.json metadata',
				severity: 'error',
			});
		}
	}

	for (const pkg of packages) {
		if (loadedById.has(pkg.id)) continue;
		if (pkg.private) continue;
		if (mode === 'strict-all') {
			findings.push({
				kind: 'public-package-missing-manifest',
				relPath: pkg.packagePath,
				detail: 'public plugin package has no manifest; strict-all treats every public plugin as migrated',
				severity: 'error',
			});
			continue;
		}
		findings.push({
			kind: 'pending-migration',
			relPath: pkg.packagePath,
			detail: 'public plugin package is still on the manual catalog; migrated-only mode reports it but does not fail',
			severity: 'info',
		});
	}

	const errors = findings.filter(
		(finding) => finding.severity === 'error',
	).length;
	const pending = findings.filter(
		(finding) => finding.kind === 'pending-migration',
	).length;
	return {
		mode,
		findings,
		errors,
		pending,
		ok: errors === 0,
	};
};

export const formatPluginManifestLintReport = (
	report: IPluginManifestLintReport,
): string => {
	const lines = [
		`plugin-manifest lint (${report.mode}): ${report.errors} error(s), ${report.pending} pending migration(s).`,
	];
	for (const finding of report.findings) lines.push(formatFinding(finding));
	return `${lines.join('\n')}\n`;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const mode: LintMode = argv.includes('--strict-all')
		? 'strict-all'
		: 'migrated-only';
	const rootArg = argv.find((arg) => arg.startsWith('--root='));
	const root = resolve(rootArg?.slice('--root='.length) ?? process.cwd());
	const report = await lintPluginManifests(root, mode);
	console.error(formatPluginManifestLintReport(report));
	return report.ok ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
