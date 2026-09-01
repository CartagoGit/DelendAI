#!/usr/bin/env bun
import { resolve } from 'node:path';

import {
	discoverPluginPackages,
	loadPluginManifests,
} from '../generate/from-manifests.script.ts';

type LintMode = 'strict-all';

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
	readonly ok: boolean;
}

const formatFinding = (finding: IPluginManifestLintFinding): string =>
	`${finding.severity === 'error' ? 'ERROR' : 'INFO '} ${finding.relPath} [${finding.kind}] ${finding.detail}`;

export const lintPluginManifests = async (
	root = process.cwd(),
	mode: LintMode = 'strict-all',
): Promise<IPluginManifestLintReport> => {
	const findings: IPluginManifestLintFinding[] = [];
	const packages = await discoverPluginPackages(root);
	const loaded = await loadPluginManifests(root).catch((error) => {
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

	for (const pkg of packages) {
		const manifest = loadedById.get(pkg.id);
		if (manifest === undefined) {
			if (pkg.private) continue;
			findings.push({
				kind: 'public-package-missing-manifest',
				relPath: pkg.packagePath,
				detail: 'public plugin package is missing plugin.manifest.ts',
				severity: 'error',
			});
			continue;
		}
		if (
			manifest.manifest.id !== pkg.id ||
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

	const errors = findings.filter(
		(finding) => finding.severity === 'error',
	).length;
	return {
		mode,
		findings,
		errors,
		ok: errors === 0,
	};
};

export const formatPluginManifestLintReport = (
	report: IPluginManifestLintReport,
): string => {
	const lines = [
		`plugin-manifest lint (${report.mode}): ${report.errors} error(s).`,
	];
	for (const finding of report.findings) lines.push(formatFinding(finding));
	return `${lines.join('\n')}\n`;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const mode: LintMode = 'strict-all';
	const rootArg = argv.find((arg) => arg.startsWith('--root='));
	const root = resolve(rootArg?.slice('--root='.length) ?? process.cwd());
	const report = await lintPluginManifests(root, mode);
	console.error(formatPluginManifestLintReport(report));
	return report.ok ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
