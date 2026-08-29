/**
 * Read-only projections of GitHub security REST endpoints used by the
 * `issues` plugin. These shapes intentionally expose only the stable
 * summary fields the plugin surfaces, while preserving the API's
 * resource-level semantics for Dependabot, code scanning, secret
 * scanning and repository advisories.
 */

export type IDependabotAlertState = 'open' | 'dismissed' | 'fixed';

export type IDependabotAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IDependabotAlertSummary {
	readonly number: number;
	readonly state: IDependabotAlertState;
	readonly severity: IDependabotAlertSeverity;
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

export type ICodeScanningAlertState = 'open' | 'fixed' | 'dismissed';

export type ICodeScanningAlertSeverity =
	| 'critical'
	| 'high'
	| 'medium'
	| 'low'
	| 'warning'
	| 'error'
	| 'note'
	| 'none';

export interface ICodeScanningAlertSummary {
	readonly number: number;
	readonly state: ICodeScanningAlertState;
	readonly severity: ICodeScanningAlertSeverity;
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

export type ISecretScanningAlertState = 'open' | 'resolved' | 'unknown';

export interface ISecretScanningAlertSummary {
	readonly number: number;
	readonly state: ISecretScanningAlertState;
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
