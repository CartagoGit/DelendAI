/**
 * licenses.ts — offline dependency-license compliance scan. Classifies each
 * declared dependency's license and flags the ones worth reviewing (copyleft,
 * proprietary, unknown, or missing). Permissive licenses (MIT/BSD/Apache/…)
 * produce no finding. The classifier is pure; the scan is pure over injected
 * readers; the real adapter reads the manifest + node_modules.
 */
import { SafeWorkspaceReader } from '@delendai/core/public';

import type { IFinding } from '@delendai/core/public';

import type {
	ILicenseClass,
	ILicenseScanDeps,
} from '../contracts/interfaces/licenses.interface';

/**
 * Classify a license id. Returns a finding class for anything worth review,
 * or `undefined` for clearly-permissive licenses (no finding). Pure.
 */
export const classifyLicense = (
	license: string | undefined,
): ILicenseClass | undefined => {
	if (license === undefined || license.trim() === '') {
		return { severity: 'medium', label: 'missing license' };
	}
	const upper = license.toUpperCase();
	if (upper === 'UNLICENSED') {
		return { severity: 'high', label: 'UNLICENSED (proprietary)' };
	}
	if (/\bA?GPL/.test(upper)) {
		return { severity: 'high', label: `strong copyleft (${license})` };
	}
	if (/\b(LGPL|MPL|EPL|CDDL|CPL|OSL)/.test(upper)) {
		return { severity: 'medium', label: `weak copyleft (${license})` };
	}
	if (
		/\b(MIT|BSD|APACHE|ISC|UNLICENSE|0BSD|CC0|CC-BY|WTFPL|BLUEOAK|ZLIB|PYTHON|BOOST)/.test(
			upper,
		)
	) {
		return undefined; // permissive — no finding
	}
	return { severity: 'low', label: `review license (${license})` };
};

/**
 * Scan every declared dependency's license → findings for the ones worth
 * review. Pure over the injected reader seam; never throws.
 */
export const scanLicenses = async (
	deps: ILicenseScanDeps,
): Promise<IFinding[]> => {
	const names = await deps.listDependencyNames();
	const findings: IFinding[] = [];
	for (const name of names) {
		const license = await deps.readLicense(name);
		const cls = classifyLicense(license);
		if (cls !== undefined) {
			findings.push({
				ruleId: `license:${name}`,
				severity: cls.severity,
				message: `${name}: ${cls.label}`,
				location: { file: 'package.json' },
				fix: 'Review the license against your distribution terms; replace or vendor if incompatible.',
			});
		}
	}
	return findings;
};

/** Normalize the many shapes a package.json `license`/`licenses` field takes. */
const readLicenseField = (pkg: Record<string, unknown>): string | undefined => {
	const license = pkg.license;
	if (typeof license === 'string') return license;
	if (
		license !== null &&
		typeof license === 'object' &&
		typeof (license as { type?: unknown }).type === 'string'
	) {
		return (license as { type: string }).type;
	}
	const legacy = pkg.licenses;
	if (Array.isArray(legacy) && legacy.length > 0) {
		const first = legacy[0] as { type?: unknown };
		if (typeof first?.type === 'string') return first.type;
	}
	return undefined;
};

/** Production license-scan deps: manifest deps + node_modules license fields. */
export const realLicenseDeps = (
	workspaceRootAbs: string,
	manifestRel: string,
): ILicenseScanDeps => ({
	listDependencyNames: async () => {
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		try {
			const raw = (await reader.readText(manifestRel)).content;
			const pkg = JSON.parse(raw) as Record<string, unknown>;
			const sections = [
				'dependencies',
				'devDependencies',
				'peerDependencies',
				'optionalDependencies',
			];
			const names = new Set<string>();
			for (const section of sections) {
				const block = pkg[section];
				if (block !== null && typeof block === 'object') {
					for (const name of Object.keys(block)) names.add(name);
				}
			}
			return [...names];
		} catch {
			return [];
		}
	},
	readLicense: async (pkgName) => {
		const packageReader = new SafeWorkspaceReader(
			`${workspaceRootAbs}/node_modules/${pkgName}`,
		);
		try {
			const raw = (await packageReader.readText('package.json')).content;
			return readLicenseField(JSON.parse(raw) as Record<string, unknown>);
		} catch {
			return undefined;
		}
	},
});
