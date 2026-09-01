#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
	loadAllPluginManifests,
	validatePluginManifest,
} from '@mcp-vertex/core/public';

import { repoRoot } from '../lib/monorepo-paths';

interface IViolation {
	readonly plugin: string;
	readonly rule: string;
	readonly message: string;
}

const REGISTERED_TOOL_IDS: Readonly<Record<string, readonly string[]>> = {
	'commit-policy': [
		'commit_policy_status',
		'commit_policy_refresh_branch_protection',
		'commit_policy_commit',
		'commit_policy_push',
		'commit_policy_run',
	],
};

const EXPECTED_TOOL_PERMISSIONS: Readonly<
	Record<string, Readonly<Record<string, readonly string[]>>>
> = {
	'commit-policy': {
		commit_policy_status: ['git-read'],
		commit_policy_commit: ['git-write'],
		commit_policy_push: ['git-write'],
		commit_policy_run: ['git-write'],
		commit_policy_refresh_branch_protection: ['network', 'process'],
	},
};

const isPublicScopedPackage = (name: string): boolean =>
	name.startsWith('@mcp-vertex/');

const RUNTIME_VERSION_PATTERN = /version:\s*['"]([^'"]+)['"]/;
// x00293 S2 spike: version derived from an imported package.json
// (e.g. `import apiPackageJson from '../package.json'` + `version:
// apiPackageJson.version`). Resolves the real file instead of a literal.
const PKG_JSON_IMPORT_PATTERN =
	/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]*package\.json)['"]/;
const RUNTIME_VERSION_FROM_IMPORT_PATTERN =
	/version:\s*([A-Za-z_$][\w$]*)\.version/;

const readRuntimeVersion = async (
	root: string,
	pluginId: string,
): Promise<string | undefined> => {
	const runtimePath = join(root, 'plugins', pluginId, 'src', 'index.ts');
	const source = await readFile(runtimePath, 'utf8');
	const literal = RUNTIME_VERSION_PATTERN.exec(source)?.[1];
	if (literal !== undefined) return literal;
	// x00293 S2: resolve an imported package.json version (spike pattern).
	const pkgImport = PKG_JSON_IMPORT_PATTERN.exec(source);
	const versionRef = RUNTIME_VERSION_FROM_IMPORT_PATTERN.exec(source);
	if (pkgImport === null || versionRef === null) return undefined;
	if (
		pkgImport[1] === undefined ||
		versionRef[1] === undefined ||
		pkgImport[2] === undefined
	)
		return undefined;
	if (pkgImport[1] !== versionRef[1]) return undefined;
	// The import path is relative to `src/index.ts`, so resolve it from there.
	const packagePath = join(root, 'plugins', pluginId, 'src', pkgImport[2]);
	try {
		const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
			version?: string;
		};
		return packageJson.version;
	} catch {
		return undefined;
	}
};

export const lintManifestVsPackage = async (
	root = repoRoot(),
): Promise<readonly IViolation[]> => {
	const manifests = await loadAllPluginManifests(root);
	const violations: IViolation[] = [];
	for (const rawManifest of manifests) {
		const manifest = validatePluginManifest(rawManifest);
		const packagePath = join(root, 'plugins', manifest.id, 'package.json');
		const runtimePath = join(
			root,
			'plugins',
			manifest.id,
			'src',
			'index.ts',
		);
		const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
			name?: string;
			version?: string;
			private?: boolean;
			publishConfig?: { access?: string };
		};
		const runtimeVersion = await readRuntimeVersion(root, manifest.id);
		if (manifest.package !== packageJson.name) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-PKG-001',
				message: `manifest.package ${JSON.stringify(manifest.package)} does not match package.json#name ${JSON.stringify(packageJson.name ?? '')}.`,
			});
		}
		if (
			manifest.version !== packageJson.version ||
			runtimeVersion === undefined ||
			runtimeVersion !== packageJson.version
		) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-VER-001',
				message: `versions diverge across package.json#version ${JSON.stringify(packageJson.version ?? '')}, plugin.manifest.ts#version ${JSON.stringify(manifest.version)}, and src/index.ts#version ${JSON.stringify(runtimeVersion ?? '')} (${runtimePath}).`,
			});
		}
		const expectedVisibility =
			packageJson.private === true ||
			packageJson.publishConfig?.access === 'restricted'
				? 'private'
				: 'public';
		if (manifest.visibility !== expectedVisibility) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-VIS-001',
				message: `manifest.visibility ${JSON.stringify(manifest.visibility)} does not match package publish policy ${JSON.stringify(expectedVisibility)}.`,
			});
		}
		if (manifest.id !== manifest.package.replace('@mcp-vertex/', '')) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-ID-001',
				message: `manifest.id ${JSON.stringify(manifest.id)} does not match package scope name ${JSON.stringify(manifest.package)}.`,
			});
		}
		if (
			manifest.visibility === 'private' &&
			isPublicScopedPackage(manifest.package) &&
			packageJson.publishConfig?.access !== 'restricted' &&
			packageJson.private !== true
		) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-VIS-002',
				message: `manifest.visibility is private but ${manifest.package} is configured as a public package.`,
			});
		}
		const registeredToolIds = REGISTERED_TOOL_IDS[manifest.id];
		if (registeredToolIds !== undefined) {
			const registered = new Set(registeredToolIds);
			const configured = manifest.toolPermissions ?? {};
			for (const toolId of Object.keys(configured)) {
				if (registered.has(toolId)) continue;
				violations.push({
					plugin: manifest.id,
					rule: 'MANIFEST-TOOL-001',
					message: `toolPermissions contains ${JSON.stringify(toolId)}, but no such tool is registered by ${manifest.id}.`,
				});
			}
			for (const toolId of registeredToolIds) {
				if (configured[toolId] !== undefined) continue;
				violations.push({
					plugin: manifest.id,
					rule: 'MANIFEST-TOOL-002',
					message: `toolPermissions is missing the registered tool ${JSON.stringify(toolId)}.`,
				});
			}
			const expectedPermissions = EXPECTED_TOOL_PERMISSIONS[manifest.id];
			if (expectedPermissions !== undefined) {
				for (const [toolId, expected] of Object.entries(
					expectedPermissions,
				)) {
					const actual = configured[toolId];
					if (
						actual !== undefined &&
						JSON.stringify([...actual].sort()) !==
							JSON.stringify([...expected].sort())
					)
						violations.push({
							plugin: manifest.id,
							rule: 'MANIFEST-TOOL-003',
							message: `toolPermissions for ${JSON.stringify(toolId)} does not match the declared effect permissions.`,
						});
				}
			}
		}
	}
	return violations;
};

const main = async (root = resolve(process.cwd())): Promise<number> => {
	const violations = await lintManifestVsPackage(root);
	if (violations.length === 0) {
		console.log('[manifest-vs-package] OK.');
		return 0;
	}
	console.error('[manifest-vs-package] Violations found:');
	for (const violation of violations) {
		console.error(
			`  ${violation.plugin}: [${violation.rule}] ${violation.message}`,
		);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
