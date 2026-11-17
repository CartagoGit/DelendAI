import type { IncidentClassification } from '../contracts/constants/incident-taxonomy.constant';
import type {
	IAutoFixDecision,
	IAutoFixPolicyInput,
	IncidentSeverity,
} from '../contracts/interfaces/auto-fix-policy.interface';

const NEEDS_HUMAN_CLASSIFICATIONS = new Set<IncidentClassification>([
	'SECURITY',
	'PRIVACY',
	'DESIGN_DECISION',
	'PRODUCT_DECISION',
	'NEEDS_REPRODUCTION',
	'UNKNOWN',
]);

const AUTO_FIXABLE_CLASSIFICATIONS = new Set<IncidentClassification>([
	'BUG',
	'REGRESSION',
	'PERFORMANCE',
	'TOKEN_REGRESSION',
	'DOC_DRIFT',
	'CONFIG_DRIFT',
	'DUPLICATE',
]);

const isPublicIndexPath = (path: string): boolean =>
	/(^|\/)src\/public\//.test(path);

const isPresetCatalogPath = (path: string): boolean =>
	path.endsWith('/packages/core/src/lib/plugins/preset-catalog.ts');

const isPluginManifestPath = (path: string): boolean =>
	path.endsWith('/plugin.manifest.ts');

const isPublishedToolOutputPath = (path: string): boolean =>
	path.endsWith('/generated/tool-outputs.ts');

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

const DEFAULT_SEVERITY_BY_CLASSIFICATION: Record<
	IncidentClassification,
	IncidentSeverity
> = {
	BUG: 'medium',
	REGRESSION: 'medium',
	SECURITY: 'critical',
	PRIVACY: 'critical',
	PERFORMANCE: 'medium',
	TOKEN_REGRESSION: 'medium',
	DOC_DRIFT: 'low',
	CONFIG_DRIFT: 'low',
	DUPLICATE: 'low',
	NOT_A_BUG: 'low',
	DESIGN_DECISION: 'high',
	PRODUCT_DECISION: 'high',
	NEEDS_REPRODUCTION: 'medium',
	UNKNOWN: 'high',
};

export const defaultSeverityForClassification = (
	classification: IncidentClassification,
): IncidentSeverity => DEFAULT_SEVERITY_BY_CLASSIFICATION[classification];

export const touchesPublicContracts = (
	input: Pick<
		IAutoFixPolicyInput,
		'affectedPaths' | 'affectsPublishedOutputSchema'
	>,
): { readonly touches: boolean; readonly reason?: string } => {
	if (input.affectsPublishedOutputSchema === true) {
		return {
			touches: true,
			reason: 'published outputSchema contract would change',
		};
	}
	for (const rawPath of input.affectedPaths ?? []) {
		const path = normalizePath(rawPath);
		if (isPublicIndexPath(path)) {
			return {
				touches: true,
				reason: `public index path affected: ${path}`,
			};
		}
		if (isPresetCatalogPath(path)) {
			return {
				touches: true,
				reason: `preset catalog affected: ${path}`,
			};
		}
		if (isPluginManifestPath(path)) {
			return {
				touches: true,
				reason: `plugin manifest affected: ${path}`,
			};
		}
		if (isPublishedToolOutputPath(path)) {
			return {
				touches: true,
				reason: `published tool output affected: ${path}`,
			};
		}
	}
	return { touches: false };
};

/**
 * Auto-fix policy for dogfooding proposals.
 *
 * needs-human when:
 * - severity is high/critical
 * - classification is SECURITY/PRIVACY/DESIGN_DECISION/PRODUCT_DECISION/NEEDS_REPRODUCTION/UNKNOWN
 * - a public contract is touched (public index, preset catalog, plugin manifest, published output schema)
 * - reproduction evidence is missing
 *
 * auto-fixable only when:
 * - severity is low/medium
 * - classification is BUG/REGRESSION/PERFORMANCE/TOKEN_REGRESSION/DOC_DRIFT/CONFIG_DRIFT/DUPLICATE
 * - reproduction exists (test or sample error)
 * - no public contract is touched
 */
export const autoFixPolicy = (input: IAutoFixPolicyInput): IAutoFixDecision => {
	const severity =
		input.severity ??
		defaultSeverityForClassification(input.classification);
	if (severity === 'critical' || severity === 'high') {
		return {
			decision: 'needs-human',
			reason: `severity ${severity} requires human review`,
		};
	}
	if (NEEDS_HUMAN_CLASSIFICATIONS.has(input.classification)) {
		return {
			decision: 'needs-human',
			reason: `classification ${input.classification} requires human review`,
		};
	}
	const publicContract = touchesPublicContracts(input);
	if (publicContract.touches) {
		return {
			decision: 'needs-human',
			reason: publicContract.reason ?? 'public contract would change',
		};
	}
	if (input.reproducible !== true) {
		return {
			decision: 'needs-human',
			reason: 'reproducible evidence is required for auto-fix',
		};
	}
	if (!AUTO_FIXABLE_CLASSIFICATIONS.has(input.classification)) {
		return {
			decision: 'needs-human',
			reason: `classification ${input.classification} is not auto-fixable`,
		};
	}
	return {
		decision: 'auto-fixable',
		reason: `classification ${input.classification} with severity ${severity} is reproducible and avoids public contracts`,
	};
};
