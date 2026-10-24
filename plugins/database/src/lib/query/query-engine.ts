import { redactDsn, type IDriverKind } from '../introspect/introspect-engine';

export type IQueryClassification = 'read' | 'write' | 'ddl' | 'unknown';

export interface IQueryInput {
	readonly sql: string;
	readonly params?: readonly unknown[];
	readonly namedParams?: Readonly<Record<string, unknown>>;
	readonly allowWrite?: boolean;
	readonly confirm?: boolean;
	readonly dryRun?: boolean;
	readonly explainDriver?: IDriverKind;
}

export interface IPreparedQuery {
	readonly sql: string;
	readonly params: readonly unknown[];
}

export interface IQueryDriver {
	readonly kind: IDriverKind;
	execute(
		prepared: IPreparedQuery,
	): Promise<readonly Record<string, unknown>[]>;
	explain?(
		prepared: IPreparedQuery,
		driver?: IDriverKind,
	): Promise<readonly string[]>;
}

export interface IQuerySuccess {
	readonly ok: true;
	readonly classification: IQueryClassification;
	readonly dryRun: boolean;
	readonly rows?: readonly Record<string, unknown>[];
	readonly rowCount?: number;
	readonly plan?: readonly string[];
}

export interface IQueryFailure {
	readonly ok: false;
	readonly error: 'write-refused' | 'ddl-refused' | 'explain-unsupported';
	readonly reason: string;
	readonly classification: Exclude<IQueryClassification, 'read'>;
	readonly dryRun?: boolean;
}

export type IGuardedQueryResult = IQuerySuccess | IQueryFailure;

const READ_KEYWORDS = new Set([
	'explain',
	'pragma',
	'select',
	'show',
	'values',
	'with',
]);
const WRITE_KEYWORDS = new Set([
	'delete',
	'insert',
	'merge',
	'replace',
	'update',
]);
const DDL_KEYWORDS = new Set([
	'alter',
	'analyze',
	'attach',
	'create',
	'detach',
	'drop',
	'reindex',
	'truncate',
	'vacuum',
]);

const isIdentChar = (char: string | undefined): boolean =>
	char !== undefined && /[A-Za-z0-9_]/.test(char);

const normaliseWhitespace = (value: string): string =>
	value.replace(/\s+/g, ' ').trim();

const firstKeyword = (sql: string): string | null => {
	let index = 0;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inLineComment = false;
	let inBlockComment = false;

	while (index < sql.length) {
		const char = sql[index];
		const next = sql[index + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			index += 1;
			continue;
		}
		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}
		if (inSingleQuote) {
			if (char === "'" && sql[index - 1] !== '\\') {
				inSingleQuote = false;
			}
			index += 1;
			continue;
		}
		if (inDoubleQuote) {
			if (char === '"' && sql[index - 1] !== '\\') {
				inDoubleQuote = false;
			}
			index += 1;
			continue;
		}
		if (char === '-' && next === '-') {
			inLineComment = true;
			index += 2;
			continue;
		}
		if (char === '/' && next === '*') {
			inBlockComment = true;
			index += 2;
			continue;
		}
		if (char === "'") {
			inSingleQuote = true;
			index += 1;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = true;
			index += 1;
			continue;
		}
		if (/\s|[;(]/.test(char ?? '')) {
			index += 1;
			continue;
		}
		if (/[A-Za-z]/.test(char ?? '')) {
			const start = index;
			index += 1;
			while (isIdentChar(sql[index])) {
				index += 1;
			}
			return sql.slice(start, index).toLowerCase();
		}
		index += 1;
	}
	return null;
};

export const classifySql = (sql: string): IQueryClassification => {
	const keyword = firstKeyword(sql);
	if (keyword === null) return 'unknown';
	if (READ_KEYWORDS.has(keyword)) return 'read';
	if (WRITE_KEYWORDS.has(keyword)) return 'write';
	if (DDL_KEYWORDS.has(keyword)) return 'ddl';
	return 'unknown';
};

export const flattenNamedParams = (
	sql: string,
	namedParams: Readonly<Record<string, unknown>>,
): IPreparedQuery => {
	let rewritten = '';
	const params: unknown[] = [];
	let index = 0;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inLineComment = false;
	let inBlockComment = false;

	while (index < sql.length) {
		const char = sql[index];
		const next = sql[index + 1];

		if (inLineComment) {
			rewritten += char;
			if (char === '\n') {
				inLineComment = false;
			}
			index += 1;
			continue;
		}
		if (inBlockComment) {
			rewritten += char;
			if (char === '*' && next === '/') {
				rewritten += next;
				inBlockComment = false;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}
		if (inSingleQuote) {
			rewritten += char;
			if (char === "'" && sql[index - 1] !== '\\') {
				inSingleQuote = false;
			}
			index += 1;
			continue;
		}
		if (inDoubleQuote) {
			rewritten += char;
			if (char === '"' && sql[index - 1] !== '\\') {
				inDoubleQuote = false;
			}
			index += 1;
			continue;
		}
		if (char === '-' && next === '-') {
			inLineComment = true;
			rewritten += char + next;
			index += 2;
			continue;
		}
		if (char === '/' && next === '*') {
			inBlockComment = true;
			rewritten += char + next;
			index += 2;
			continue;
		}
		if (char === "'") {
			inSingleQuote = true;
			rewritten += char;
			index += 1;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = true;
			rewritten += char;
			index += 1;
			continue;
		}
		if (
			(char === ':' || char === '@' || char === '$') &&
			/[A-Za-z_]/.test(next ?? '')
		) {
			let end = index + 2;
			while (isIdentChar(sql[end])) {
				end += 1;
			}
			const key = sql.slice(index + 1, end);
			if (!(key in namedParams)) {
				throw new Error(`Missing named SQL parameter: ${key}`);
			}
			params.push(namedParams[key]);
			rewritten += '?';
			index = end;
			continue;
		}
		rewritten += char;
		index += 1;
	}

	return {
		sql: normaliseWhitespace(rewritten),
		params,
	};
};

export const prepareQuery = (input: IQueryInput): IPreparedQuery => {
	if (input.params !== undefined && input.namedParams !== undefined) {
		throw new Error('Use either params or namedParams, not both.');
	}
	if (input.namedParams !== undefined) {
		return flattenNamedParams(input.sql, input.namedParams);
	}
	return {
		sql: normaliseWhitespace(input.sql),
		params: input.params ?? [],
	};
};

const refusal = (
	classification: Exclude<IQueryClassification, 'read'>,
	dryRun: boolean,
): IQueryFailure => ({
	ok: false,
	error: classification === 'ddl' ? 'ddl-refused' : 'write-refused',
	reason:
		classification === 'ddl'
			? 'DDL statements are blocked by default. This tool does not execute schema changes.'
			: 'Mutating statements require both allowWrite:true and confirm:true.',
	classification,
	...(dryRun ? { dryRun } : {}),
});

export const buildExplainSql = (driver: IDriverKind, sql: string): string => {
	if (driver === 'sqlite') {
		return `EXPLAIN QUERY PLAN ${sql}`;
	}
	return `EXPLAIN ${sql}`;
};

export const explainQuery = async (
	driver: IQueryDriver,
	input: IQueryInput,
): Promise<IQuerySuccess | IQueryFailure> => {
	const classification = classifySql(input.sql);
	if (classification !== 'read') {
		return refusal(
			classification === 'unknown' ? 'write' : classification,
			true,
		);
	}
	if (driver.explain === undefined) {
		return {
			ok: false,
			error: 'explain-unsupported',
			reason: `Driver ${driver.kind} does not support EXPLAIN.`,
			classification: 'unknown',
		};
	}
	try {
		const prepared = prepareQuery(input);
		const plan = await driver.explain(
			prepared,
			input.explainDriver ?? driver.kind,
		);
		return { ok: true, classification, dryRun: true, plan };
	} catch (err) {
		throw new Error(redactDsn((err as Error).message));
	}
};

export const executeGuardedQuery = async (
	driver: IQueryDriver,
	input: IQueryInput,
): Promise<IGuardedQueryResult> => {
	const classification = classifySql(input.sql);
	const dryRun = input.dryRun ?? true;
	if (classification === 'ddl') {
		return refusal('ddl', dryRun);
	}
	if (
		classification === 'write' &&
		!(input.allowWrite === true && input.confirm === true)
	) {
		return refusal('write', dryRun);
	}
	if (classification === 'unknown') {
		return refusal('unknown', dryRun);
	}
	try {
		const prepared = prepareQuery(input);
		if (dryRun) {
			const plan =
				classification === 'read' && driver.explain !== undefined
					? await driver.explain(
							prepared,
							input.explainDriver ?? driver.kind,
						)
					: undefined;
			return {
				ok: true,
				classification,
				dryRun,
				...(plan !== undefined ? { plan } : {}),
			};
		}
		const rows = await driver.execute(prepared);
		return {
			ok: true,
			classification,
			dryRun,
			rows,
			rowCount: rows.length,
			...(classification === 'read' && driver.explain !== undefined
				? {
						plan: await driver.explain(
							prepared,
							input.explainDriver ?? driver.kind,
						),
					}
				: {}),
		};
	} catch (err) {
		throw new Error(redactDsn((err as Error).message));
	}
};
