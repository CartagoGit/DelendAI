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

const isPublicScopedPackage = (name: string): boolean =>
	name.startsWith('@mcp-vertex/');

export const lintManifestVsPackage = async (
	root = repoRoot(),
): Promise<readonly IViolation[]> => {
	const manifests = await loadAllPluginManifests(root);
	const violations: IViolation[] = [];
	for (const rawManifest of manifests) {
		const manifest = validatePluginManifest(rawManifest);
		const packagePath = join(root, 'plugins', manifest.id, 'package.json');
		const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
			name?: string;
			version?: string;
			private?: boolean;
			publishConfig?: { access?: string };
		};
		if (manifest.package !== packageJson.name) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-PKG-001',
				message: `manifest.package ${JSON.stringify(manifest.package)} does not match package.json#name ${JSON.stringify(packageJson.name ?? '')}.`,
			});
		}
		if (manifest.version !== packageJson.version) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-VER-001',
				message: `manifest.version ${JSON.stringify(manifest.version)} does not match package.json#version ${JSON.stringify(packageJson.version ?? '')}.`,
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
