import type { IFinding } from '@mcp-vertex/core/public';

type SastSource = 'semgrep' | 'ast-grep' | 'fallback';

interface IParseOptions {
	readonly source: SastSource;
}

interface IParsedResult {
	readonly check_id?: string;
	readonly id?: string;
	readonly ruleId?: string;
	readonly path?: string;
	readonly file?: string;
	readonly severity?: string;
	readonly message?: string;
	readonly start?: { readonly line?: number };
	readonly end?: { readonly line?: number };
	readonly location?: { readonly line?: number; readonly endLine?: number };
	readonly extra?: {
		readonly severity?: string;
		readonly message?: string;
	};
}

const normalizeSeverity = (value: string | undefined): IFinding['severity'] => {
	switch ((value ?? '').toLowerCase()) {
		case 'error':
		case 'critical':
			return 'critical';
		case 'warning':
		case 'high':
			return 'high';
		case 'medium':
			return 'medium';
		case 'low':
			return 'low';
		default:
			return 'info';
	}
};

const asObjects = (
	raw: unknown,
	source: SastSource,
): readonly IParsedResult[] => {
	if (source === 'semgrep') {
		const results = (raw as { results?: unknown } | undefined)?.results;
		return Array.isArray(results)
			? (results as readonly IParsedResult[])
			: [];
	}
	if (Array.isArray(raw)) return raw as readonly IParsedResult[];
	const results = (
		raw as { results?: unknown; matches?: unknown } | undefined
	)?.results;
	if (Array.isArray(results)) return results as readonly IParsedResult[];
	const matches = (raw as { matches?: unknown } | undefined)?.matches;
	return Array.isArray(matches) ? (matches as readonly IParsedResult[]) : [];
};

export const parseSastJson = (
	raw: unknown,
	options: IParseOptions,
): IFinding[] =>
	asObjects(raw, options.source).map((result) => ({
		ruleId: result.check_id ?? result.ruleId ?? result.id ?? 'sast-finding',
		severity: normalizeSeverity(result.extra?.severity ?? result.severity),
		message:
			result.extra?.message ??
			result.message ??
			'Potential security issue',
		location: {
			file: result.path ?? result.file ?? 'unknown',
			...(result.start?.line !== undefined
				? { line: result.start.line }
				: result.location?.line !== undefined
					? { line: result.location.line }
					: {}),
			...(result.end?.line !== undefined
				? { endLine: result.end.line }
				: result.location?.endLine !== undefined
					? { endLine: result.location.endLine }
					: {}),
		},
	}));
