import type { IFinding } from '@mcp-vertex/core/public';
import { isHostAllowed } from '@mcp-vertex/web-fetch/public';

export interface IOsvPackage {
	readonly name: string;
	readonly ecosystem: string;
	readonly version: string;
}

export interface IOsvFetchResult {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}

export type IOsvFetch = (
	url: string,
	init: {
		readonly method: 'POST';
		readonly headers: Record<string, string>;
		readonly body: string;
		readonly signal: AbortSignal;
	},
) => Promise<IOsvFetchResult>;

export interface IQueryOsvInput {
	readonly package: IOsvPackage;
	readonly fetchImpl?: IOsvFetch;
	readonly timeoutMs?: number;
}

interface IOsvVulnerability {
	readonly id?: string;
	readonly summary?: string;
	readonly details?: string;
	readonly database_specific?: {
		readonly severity?: string;
	};
	readonly aliases?: readonly string[];
	readonly references?: readonly { readonly url?: string }[];
}

const OSV_URL = 'https://api.osv.dev/v1/query';
const OSV_ALLOW_LIST = ['api.osv.dev'];

const mapSeverity = (raw: string | undefined): IFinding['severity'] => {
	switch ((raw ?? '').toLowerCase()) {
		case 'critical':
			return 'critical';
		case 'high':
			return 'high';
		case 'medium':
		case 'moderate':
			return 'medium';
		case 'low':
			return 'low';
		default:
			return 'info';
	}
};

const firstLine = (text: string | undefined): string | undefined => {
	if (text === undefined) return undefined;
	const line = text
		.split('\n')
		.map((part) => part.trim())
		.find(Boolean);
	return line;
};

const normalizeOsvVulns = (
	vulns: readonly IOsvVulnerability[],
	pkg: IOsvPackage,
): IFinding[] =>
	vulns.map((vuln) => {
		const fallbackRuleId = vuln.aliases?.[0] ?? `OSV-${pkg.name}`;
		const ref = vuln.references?.find(
			(entry) => typeof entry.url === 'string',
		)?.url;
		return {
			ruleId: vuln.id ?? fallbackRuleId,
			severity: mapSeverity(vuln.database_specific?.severity),
			message: `${pkg.name}: ${firstLine(vuln.summary) ?? firstLine(vuln.details) ?? 'known vulnerability'}`,
			location: { file: 'package.json' },
			fix:
				ref !== undefined
					? `Review ${ref} and upgrade ${pkg.name} from ${pkg.version}.`
					: `Upgrade ${pkg.name} from ${pkg.version} to a non-vulnerable version.`,
		};
	});

export const queryOsv = async (input: IQueryOsvInput): Promise<IFinding[]> => {
	const url = new URL(OSV_URL);
	if (!isHostAllowed(url.hostname, OSV_ALLOW_LIST)) return [];
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
	try {
		const fetchImpl = input.fetchImpl ?? (fetch as unknown as IOsvFetch);
		const response = await fetchImpl(OSV_URL, {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				package: {
					name: input.package.name,
					ecosystem: input.package.ecosystem,
				},
				version: input.package.version,
			}),
			signal: controller.signal,
		});
		if (!response.ok) return [];
		const json = (await response.json()) as { vulns?: unknown };
		return Array.isArray(json.vulns)
			? normalizeOsvVulns(
					json.vulns as readonly IOsvVulnerability[],
					input.package,
				)
			: [];
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
};
