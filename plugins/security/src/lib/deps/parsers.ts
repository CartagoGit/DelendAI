import type { FindingSeverity, IFinding } from '@delendai/core/public';

import type { AuditPackageManager } from './audit';

interface IBunAdvisory {
	readonly id?: number;
	readonly url?: string;
	readonly title?: string;
	readonly severity?: string;
	readonly vulnerable_versions?: string;
}

interface INpmViaObject {
	readonly source?: number;
	readonly name?: string;
	readonly title?: string;
	readonly url?: string;
	readonly severity?: string;
	readonly range?: string;
}

interface INpmVulnerability {
	readonly name?: string;
	readonly severity?: string;
	readonly via?: readonly (string | INpmViaObject)[];
	readonly range?: string;
	readonly fixAvailable?:
		| boolean
		| {
				readonly name?: string;
				readonly version?: string;
		  };
}

interface IYarnAdvisory {
	readonly id?: number;
	readonly module_name?: string;
	readonly severity?: string;
	readonly title?: string;
	readonly url?: string;
	readonly vulnerable_versions?: string;
}

const GHSA_RE = /GHSA-[0-9a-z-]+/iu;

const mapSeverity = (raw: string | undefined): FindingSeverity => {
	switch ((raw ?? '').toLowerCase()) {
		case 'critical':
			return 'critical';
		case 'high':
			return 'high';
		case 'moderate':
		case 'medium':
			return 'medium';
		case 'low':
			return 'low';
		default:
			return 'info';
	}
};

const location = () => ({ file: 'package.json' });

const ruleIdFromUrl = (url: string | undefined, fallback: string): string =>
	url !== undefined ? (GHSA_RE.exec(url)?.[0] ?? fallback) : fallback;

const fixHintFor = (
	pkg: string,
	url: string | undefined,
	version: string | undefined,
): string => {
	if (version !== undefined && version.length > 0) {
		return `Upgrade ${pkg} to ${version} or newer.`;
	}
	if (url !== undefined) return `Review ${url} and upgrade ${pkg}.`;
	return `Upgrade ${pkg} to a non-vulnerable version.`;
};

const parseBunAudit = (raw: Record<string, unknown>): IFinding[] => {
	const findings: IFinding[] = [];
	for (const [pkg, value] of Object.entries(raw)) {
		if (!Array.isArray(value)) continue;
		for (const advisory of value as readonly IBunAdvisory[]) {
			findings.push({
				ruleId: ruleIdFromUrl(
					advisory.url,
					advisory.id !== undefined
						? `advisory-${advisory.id}`
						: `vuln-${pkg}`,
				),
				severity: mapSeverity(advisory.severity),
				message: `${pkg}: ${advisory.title ?? 'known vulnerability'}${
					advisory.vulnerable_versions !== undefined
						? ` (vulnerable ${advisory.vulnerable_versions})`
						: ''
				}`,
				location: location(),
				fix: fixHintFor(pkg, advisory.url, undefined),
			});
		}
	}
	return findings;
};

const parseNpmAudit = (raw: Record<string, unknown>): IFinding[] => {
	const vulnerabilities = raw.vulnerabilities;
	if (
		vulnerabilities === null ||
		typeof vulnerabilities !== 'object' ||
		Array.isArray(vulnerabilities)
	) {
		return [];
	}
	const findings: IFinding[] = [];
	for (const [pkg, value] of Object.entries(vulnerabilities)) {
		if (
			value === null ||
			typeof value !== 'object' ||
			Array.isArray(value)
		) {
			continue;
		}
		const vuln = value as INpmVulnerability;
		const via = Array.isArray(vuln.via) ? vuln.via : [];
		if (via.length === 0) {
			findings.push({
				ruleId: `npm-${pkg}`,
				severity: mapSeverity(vuln.severity),
				message: `${pkg}: known vulnerability${
					vuln.range !== undefined ? ` (${vuln.range})` : ''
				}`,
				location: location(),
				fix:
					typeof vuln.fixAvailable === 'object' &&
					typeof vuln.fixAvailable.version === 'string'
						? fixHintFor(pkg, undefined, vuln.fixAvailable.version)
						: fixHintFor(pkg, undefined, undefined),
			});
			continue;
		}
		for (const entry of via) {
			if (typeof entry === 'string') {
				findings.push({
					ruleId: `npm-${pkg}-${entry.toLowerCase().replace(/[^a-z0-9]+/giu, '-')}`,
					severity: mapSeverity(vuln.severity),
					message: `${pkg}: ${entry}`,
					location: location(),
					fix:
						typeof vuln.fixAvailable === 'object' &&
						typeof vuln.fixAvailable.version === 'string'
							? fixHintFor(
									pkg,
									undefined,
									vuln.fixAvailable.version,
								)
							: fixHintFor(pkg, undefined, undefined),
				});
				continue;
			}
			const ruleId =
				ruleIdFromUrl(
					entry.url,
					typeof entry.source === 'number'
						? `npm-${entry.source}`
						: `npm-${pkg}`,
				) ?? `npm-${pkg}`;
			findings.push({
				ruleId,
				severity: mapSeverity(entry.severity ?? vuln.severity),
				message: `${pkg}: ${entry.title ?? entry.name ?? 'known vulnerability'}${
					entry.range !== undefined ? ` (${entry.range})` : ''
				}`,
				location: location(),
				fix:
					typeof vuln.fixAvailable === 'object' &&
					typeof vuln.fixAvailable.version === 'string'
						? fixHintFor(pkg, entry.url, vuln.fixAvailable.version)
						: fixHintFor(pkg, entry.url, undefined),
			});
		}
	}
	return findings;
};

const parseYarnAudit = (raw: Record<string, unknown>): IFinding[] => {
	const advisories = raw.advisories;
	if (
		advisories === null ||
		typeof advisories !== 'object' ||
		Array.isArray(advisories)
	) {
		return [];
	}
	const findings: IFinding[] = [];
	for (const advisory of Object.values(
		advisories,
	) as readonly IYarnAdvisory[]) {
		const pkg = advisory.module_name ?? 'package';
		findings.push({
			ruleId: ruleIdFromUrl(
				advisory.url,
				advisory.id !== undefined
					? `advisory-${advisory.id}`
					: `yarn-${pkg}`,
			),
			severity: mapSeverity(advisory.severity),
			message: `${pkg}: ${advisory.title ?? 'known vulnerability'}${
				advisory.vulnerable_versions !== undefined
					? ` (vulnerable ${advisory.vulnerable_versions})`
					: ''
			}`,
			location: location(),
			fix: fixHintFor(pkg, advisory.url, undefined),
		});
	}
	return findings;
};

export const parseAuditJson = (
	raw: Record<string, unknown>,
	_options: { readonly ecosystem: AuditPackageManager },
): IFinding[] => {
	if (Object.keys(raw).length === 0) return [];
	if ('advisories' in raw) return parseYarnAudit(raw);
	if ('vulnerabilities' in raw) return parseNpmAudit(raw);
	return parseBunAudit(raw);
};
