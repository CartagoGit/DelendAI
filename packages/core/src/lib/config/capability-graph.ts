import type {
	ICapabilityGraph,
	ICapabilitySignal,
	IProjectRoleFinding,
} from '@mcp-vertex/contracts';

import type {
	IFileReader,
	IPackageJson,
	IProjectLanguage,
	IProjectType,
} from '../bootstrap/analyze-project';
import { matchLanguageSignals } from '../bootstrap/language-rules';
import { buildProjectShape } from '../bootstrap/project-shape';

const parsePackageJson = (
	raw: string | undefined,
): IPackageJson | undefined => {
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as IPackageJson;
	} catch {
		return undefined;
	}
};

const confidenceFor = (evidence: string): ICapabilitySignal['confidence'] => {
	if (evidence === 'Cargo.toml' || evidence === 'go.mod') return 'certain';
	if (evidence === 'package.json') return 'weak';
	return 'strong';
};

/**
 * Build the canonical project-capability graph from the injectable bootstrap
 * reader. Detectors retain their own rule tables; this aggregator is the one
 * place that combines their evidence into the public graph.
 */
export const buildCapabilityGraph = async (
	reader: IFileReader,
	parsedPackageJson?: IPackageJson | undefined,
): Promise<ICapabilityGraph> => {
	// Callers that already parsed `package.json` pass it in: the graph is
	// built inside `analyzeProject`, which read the file a statement
	// earlier, and reading it again is invisible until something counts.
	const packageJson =
		parsedPackageJson ??
		parsePackageJson(await reader.readFile('package.json'));
	const languages = await matchLanguageSignals(reader, packageJson);
	return {
		contract: 'mcp-vertex.capability-graph',
		version: 1,
		languages: languages.map((language) => ({
			id: language.id,
			signals: language.evidence.map((evidence) => ({
				source: 'language-rules',
				value: language.id,
				evidence,
				confidence: confidenceFor(evidence),
			})),
		})),
		primaryLanguage: languages[0]?.id,
		shape: await buildProjectShape(reader, packageJson),
		signals: [],
	};
};

const hasRole = (
	roles: readonly IProjectRoleFinding[],
	role: IProjectRoleFinding['role'],
): boolean => roles.some((finding) => finding.role === role);

/**
 * Compatibility projection for the legacy scalar analysis. The projection
 * contains no detection logic: both language and project type derive from the
 * canonical graph, so the two APIs cannot disagree about the same reader.
 */
export const projectLegacyProjectType = (
	graph: ICapabilityGraph,
): IProjectType => {
	if (graph.shape.workspace === 'monorepo') return 'monorepo';
	if (hasRole(graph.shape.roles, 'game')) return 'game';
	if (
		hasRole(graph.shape.roles, 'web-client') ||
		hasRole(graph.shape.roles, 'backend-api')
	) {
		return 'webapp';
	}
	if (hasRole(graph.shape.roles, 'cli')) return 'cli';
	if (hasRole(graph.shape.roles, 'library')) return 'library';
	return 'generic';
};

/** Canonical type guard for the legacy language vocabulary. */
export const isLegacyProjectLanguage = (
	value: string | undefined,
): value is IProjectLanguage =>
	value === 'typescript' ||
	value === 'javascript' ||
	value === 'python' ||
	value === 'go' ||
	value === 'rust' ||
	value === 'unknown';

/**
 * Project the graph's primary language onto the legacy scalar vocabulary.
 *
 * A language the old enum never knew about — the graph is meant to grow
 * new detectors — becomes `unknown` rather than being forced into the
 * nearest neighbour. Widening the enum is a deliberate change; silently
 * reporting Java as JavaScript is a lie the caller cannot see through.
 */
export const projectLegacyLanguage = (
	graph: ICapabilityGraph,
): IProjectLanguage =>
	isLegacyProjectLanguage(graph.primaryLanguage)
		? graph.primaryLanguage
		: 'unknown';
