/**
 * doctor/checks/permissions.check.ts — f00191 / q00006 Track I.
 *
 * Spot-checks the permissions declared in each plugin manifest
 * against the canonical permission set in
 * `packages/core/src/lib/manifest/permissions.schema.ts`. A manifest
 * that declares a permission outside that set will load (the loader
 * just preserves the raw string) but every host will treat it as
 * "unknown" and refuse to grant it — a silent capability loss.
 *
 * This is a *static* check: we read the `plugin.manifest.ts` text,
 * pull out the array literal of `permissions`, and compare each
 * entry to the known-good set. We do not transpile the file; if the
 * permissions array is computed (e.g. spread a const), the check
 * reports "could not statically parse" and stays warn-only.
 */
import type { DoctorCheck } from '../types';

export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set([
	'filesystem-read',
	'filesystem-write',
	'network',
	'browser',
	'process',
	'database',
	'git-read',
	'git-write',
	'container',
	'forge-read',
	'forge-write',
	'github',
	'proposal-write',
]);

const PERMISSIONS_ARRAY_REGEX = /permissions\s*:\s*\[([^\]]*)\]/u;

const STRING_LITERAL_REGEX = /['"`]([^'"`]+)['"`]/gu;

export interface IExtractedPermission {
	readonly slug: string;
	readonly permissions: readonly string[];
	/** True when we could not statically parse the array. */
	readonly unparsed: boolean;
}

export const extractPermissions = (
	body: string,
): IExtractedPermission | undefined => {
	const idMatch = body.match(/^\s*id\s*:\s*['"`]([^'"`]+)['"`]/mu);
	if (idMatch === null || idMatch[1] === undefined) return undefined;
	const slug = idMatch[1];
	const arrayMatch = body.match(PERMISSIONS_ARRAY_REGEX);
	if (arrayMatch === null || arrayMatch[1] === undefined) {
		return { slug, permissions: [], unparsed: true };
	}
	const inner = arrayMatch[1];
	const literals = [...inner.matchAll(STRING_LITERAL_REGEX)]
		.map((match) => match[1])
		.filter((lit): lit is string => typeof lit === 'string');
	if (literals.length === 0) {
		// Possibly an empty array OR spread/computed — we cannot tell.
		return {
			slug,
			permissions: inner.trim().length === 0 ? [] : [],
			unparsed: inner.trim().length > 0,
		};
	}
	return { slug, permissions: literals, unparsed: false };
};

export const checkPermissions: DoctorCheck = async ({ fs }) => {
	const pluginDirs = await fs.listDirs('plugins');
	if (pluginDirs.length === 0) {
		return {
			name: 'permissions',
			status: 'ok',
			findings: ['no plugins to check'],
		};
	}
	const unknownByPlugin: string[] = [];
	const unparsedByPlugin: string[] = [];
	for (const dir of pluginDirs) {
		const rel = `plugins/${dir}/plugin.manifest.ts`;
		const body = await fs.readFile(rel);
		if (body === undefined) continue;
		const extracted = extractPermissions(body);
		if (extracted === undefined) continue;
		if (extracted.unparsed) {
			unparsedByPlugin.push(extracted.slug);
			continue;
		}
		const unknown = extracted.permissions.filter(
			(permission) => !KNOWN_PERMISSIONS.has(permission),
		);
		if (unknown.length > 0) {
			unknownByPlugin.push(`${extracted.slug} (${unknown.join(', ')})`);
		}
	}
	const findings: string[] = [];
	if (unknownByPlugin.length > 0) {
		findings.push(`unknown permission(s): ${unknownByPlugin.join('; ')}`);
	}
	if (unparsedByPlugin.length > 0) {
		findings.push(
			`could not statically parse: ${unparsedByPlugin.join(', ')}`,
		);
	}
	if (findings.length === 0) {
		return {
			name: 'permissions',
			status: 'ok',
			findings: [
				`${pluginDirs.length} plugin manifest(s) use only known permissions`,
			],
		};
	}
	return {
		name: 'permissions',
		status: 'warn',
		findings,
	};
};
