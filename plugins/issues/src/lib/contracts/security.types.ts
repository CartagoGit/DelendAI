/**
 * Read-only projections of GitHub security REST endpoints used by the
 * `issues` plugin. These shapes intentionally expose only the stable
 * summary fields the plugin surfaces, while preserving the API's
 * resource-level semantics for Dependabot, code scanning, secret
 * scanning and repository advisories.
 */

export interface IDependabotAlertSummary {
	readonly number: number;
	readonly state: 'open' | 'dismissed' | 'fixed';
	readonly severity: 'critical' | 'high' | 'medium' | 'low';
	readonly package: {
		readonly ecosystem: string;
		readonly name: string;
	};
	readonly vuln: {
		readonly id: string;
		readonly severity: string;
		readonly summary: string | null;
	};
	readonly htmlUrl: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ICodeScanningAlertSummary {
	readonly number: number;
	readonly state: 'open' | 'fixed' | 'dismissed';
	readonly severity:
		| 'critical'
		| 'high'
		| 'medium'
		| 'low'
		| 'warning'
		| 'error'
		| 'note'
		| 'none';
	readonly rule: {
		readonly id: string;
		readonly severity: string;
		readonly description: string;
		readonly name: string;
	};
	readonly tool: {
		readonly name: string;
		readonly version: string | null;
	};
	readonly mostRecentInstance: {
		readonly path: string;
		readonly startLine: number;
	} | null;
	readonly htmlUrl: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ISecretScanningAlertSummary {
	readonly number: number;
	readonly state: 'open' | 'resolved' | 'unknown';
	readonly secretType: string;
	readonly pushProtection: boolean;
	readonly validity: string | null;
	readonly locationsCount: number;
	readonly htmlUrl: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ISecurityAdvisorySummary {
	readonly ghsaId: string;
	readonly cveId: string | null;
	readonly summary: string;
	readonly severity: string;
	readonly state: string;
	readonly htmlUrl: string;
	readonly publishedAt: string | null;
	readonly updatedAt: string | null;
}
