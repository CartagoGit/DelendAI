import { hasFlag, scalarArg } from '../lib/helpers/cli-command.helper';

export const KPI_VIEWS = [
	'summary',
	'history',
	'usage',
	'costs',
	'models',
	'agents',
	'plugins',
	'errors',
	'efficiency',
	'audit',
] as const;

export type TKpiCliView = (typeof KPI_VIEWS)[number];

export interface IKpiThreshold {
	readonly metric: string;
	readonly operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
	readonly expected: number;
	readonly raw: string;
}

export interface IKpiCliOptions {
	readonly view: TKpiCliView;
	readonly emitJson: boolean;
	readonly watch: boolean;
	readonly watchIntervalMs: number;
	readonly windowDays?: number;
	readonly maxBytes?: number;
	readonly from?: string;
	readonly to?: string;
	readonly limit: number;
	readonly thresholds: readonly IKpiThreshold[];
	readonly cacheDir: string;
}

export type IKpiCliOptionParseResult =
	| { readonly ok: true; readonly value: IKpiCliOptions }
	| { readonly ok: false; readonly error: string };

export const KPI_CLI_USAGE =
	'kpis [summary|history|usage|costs|models|agents|plugins|errors|efficiency|audit] [--view=<name>] [--window-days=N] [--from=<iso>] [--to=<iso>] [--limit=N] [--max-bytes=N] [--json] [--watch] [--watch-interval-ms=N] [--threshold=<metric><op><value>] [--cache-dir=<dir>]';

const DEFAULT_WATCH_INTERVAL_MS = 5_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_CACHE_DIR = '.cache/mcp-vertex';

const isView = (value: string): value is TKpiCliView =>
	KPI_VIEWS.includes(value as TKpiCliView);

const parsePositiveInteger = (
	raw: string | undefined,
	flag: string,
): number | string | undefined => {
	if (raw === undefined) return undefined;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return `usage: ${flag} must be a positive integer`;
	}
	return parsed;
};

const parseThreshold = (raw: string): IKpiThreshold | string => {
	const match = raw.match(
		/^([a-zA-Z0-9_.-]+)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/,
	);
	if (match === null) {
		return `usage: invalid --threshold expression: ${raw}`;
	}
	const metric = match[1];
	const operator = match[2];
	const expected = match[3];
	if (
		metric === undefined ||
		operator === undefined ||
		expected === undefined
	) {
		return `usage: invalid --threshold expression: ${raw}`;
	}
	return {
		metric,
		operator: operator as IKpiThreshold['operator'],
		expected: Number(expected),
		raw,
	};
};

const repeatedScalarArgs = (
	args: readonly string[],
	name: string,
): readonly string[] => {
	const values: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const current = args[index];
		if (current === `--${name}`) {
			const next = args[index + 1];
			if (next !== undefined) values.push(next);
			continue;
		}
		if (current?.startsWith(`--${name}=`) === true) {
			values.push(current.slice(name.length + 3));
		}
	}
	return values;
};

export const parseKpiCliOptions = (
	args: readonly string[],
	globals: {
		readonly json: boolean;
		readonly format: 'json' | 'text';
		readonly cacheDir?: string | undefined;
	},
): IKpiCliOptionParseResult => {
	const positionalView = args.find((arg) => !arg.startsWith('-'));
	const viewArg = scalarArg(args, 'view') ?? positionalView ?? 'summary';
	if (!isView(viewArg)) {
		return {
			ok: false,
			error: `usage: unknown KPI view "${viewArg}"`,
		};
	}

	const limit = parsePositiveInteger(scalarArg(args, 'limit'), '--limit');
	if (typeof limit === 'string') return { ok: false, error: limit };

	const watchIntervalMs = parsePositiveInteger(
		scalarArg(args, 'watch-interval-ms'),
		'--watch-interval-ms',
	);
	if (typeof watchIntervalMs === 'string') {
		return { ok: false, error: watchIntervalMs };
	}

	const windowDays = parsePositiveInteger(
		scalarArg(args, 'window-days'),
		'--window-days',
	);
	if (typeof windowDays === 'string') {
		return { ok: false, error: windowDays };
	}

	const maxBytes = parsePositiveInteger(
		scalarArg(args, 'max-bytes'),
		'--max-bytes',
	);
	if (typeof maxBytes === 'string') {
		return { ok: false, error: maxBytes };
	}

	const thresholds: IKpiThreshold[] = [];
	for (const entry of repeatedScalarArgs(args, 'threshold')) {
		const parsed = parseThreshold(entry);
		if (typeof parsed === 'string') return { ok: false, error: parsed };
		thresholds.push(parsed);
	}

	const from = scalarArg(args, 'from');
	const to = scalarArg(args, 'to');

	return {
		ok: true,
		value: {
			view: viewArg,
			emitJson:
				globals.json ||
				globals.format === 'json' ||
				hasFlag(args, 'json'),
			watch: hasFlag(args, 'watch'),
			watchIntervalMs: watchIntervalMs ?? DEFAULT_WATCH_INTERVAL_MS,
			...(windowDays !== undefined ? { windowDays } : {}),
			...(maxBytes !== undefined ? { maxBytes } : {}),
			...(from !== undefined ? { from } : {}),
			...(to !== undefined ? { to } : {}),
			limit: limit ?? DEFAULT_LIMIT,
			thresholds,
			cacheDir:
				scalarArg(args, 'cache-dir') ??
				globals.cacheDir ??
				DEFAULT_CACHE_DIR,
		},
	};
};
