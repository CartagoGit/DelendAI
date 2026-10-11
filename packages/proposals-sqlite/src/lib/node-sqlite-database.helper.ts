/**
 * node-sqlite-database.helper.ts — the proposals database on Node.
 *
 * The proposals database used `bun:sqlite` only, so a host that runs the
 * server under Node could not open it at all, and the proposal index
 * could never be served from SQLite there. Node ships SQLite as
 * `node:sqlite` (`DatabaseSync`). This adapter gives it the part of
 * `bun:sqlite`'s `Database` the proposals stack uses — `exec`, `run`,
 * `query` and `prepare` with `get`/`all`/`run`/`values`, `transaction` and its
 * modes, `close` — so the same repositories, reconciler and migrations
 * run on either runtime.
 *
 * Differences it absorbs: `get` answers `null`, not `undefined`, for no
 * row; `create: false` refuses a missing file the way SQLite's
 * `SQLITE_CANTOPEN` does under Bun; a transaction started inside
 * another becomes a savepoint, as Bun's does.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

type TParams = readonly unknown[];

interface INodeStatement {
	run(...params: unknown[]): {
		changes: number | bigint;
		lastInsertRowid: number | bigint;
	};
	get(...params: unknown[]): unknown;
	all(...params: unknown[]): unknown[];
	setReturnArrays(enabled: boolean): void;
}

interface INodeDatabase {
	exec(sql: string): void;
	prepare(sql: string): INodeStatement;
	close(): void;
	readonly isTransaction: boolean;
}

type TNodeDatabaseClass = new (
	path: string,
	options?: { readonly readOnly?: boolean },
) => INodeDatabase;

/** A prepared statement, shaped like `bun:sqlite`'s. */
class NodeStatement {
	private arrays: INodeStatement | undefined;

	constructor(
		private readonly database: INodeDatabase,
		private readonly sql: string,
		private readonly statement: INodeStatement,
	) {}

	run(...params: TParams): { changes: number; lastInsertRowid: number } {
		const result = this.statement.run(...params);
		return {
			changes: Number(result.changes),
			lastInsertRowid: Number(result.lastInsertRowid),
		};
	}

	get(...params: TParams): unknown {
		return this.statement.get(...params) ?? null;
	}

	all(...params: TParams): unknown[] {
		return this.statement.all(...params);
	}

	values(...params: TParams): unknown[][] {
		if (this.arrays === undefined) {
			this.arrays = this.database.prepare(this.sql);
			this.arrays.setReturnArrays(true);
		}
		return this.arrays.all(...params) as unknown[][];
	}
}

type TTransactionMode = 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';

/** `bun:sqlite`'s `Database`, for the subset the proposals stack uses. */
export class NodeSqliteDatabase {
	private readonly database: INodeDatabase;
	private readonly cache = new Map<string, NodeStatement>();
	private savepoints = 0;

	constructor(
		path: string,
		options: {
			readonly readonly?: boolean;
			readonly create?: boolean;
			readonly strict?: boolean;
		} = {},
	) {
		if (
			options.create === false &&
			path !== ':memory:' &&
			!existsSync(path)
		) {
			throw Object.assign(new Error('unable to open database file'), {
				code: 'SQLITE_CANTOPEN',
			});
		}
		const DatabaseSync = (
			createRequire(import.meta.url)('node:sqlite') as {
				readonly DatabaseSync: TNodeDatabaseClass;
			}
		).DatabaseSync;
		this.database = new DatabaseSync(path, {
			readOnly: options.readonly === true,
		});
	}

	exec(sql: string): void {
		this.database.exec(sql);
	}

	/** One statement, run once. */
	run(
		sql: string,
		...params: TParams
	): { changes: number; lastInsertRowid: number } {
		return this.prepare(sql).run(...params);
	}

	prepare(sql: string): NodeStatement {
		return new NodeStatement(
			this.database,
			sql,
			this.database.prepare(sql),
		);
	}

	/** A statement cached per SQL text, as `bun:sqlite`'s `query` is. */
	query(sql: string): NodeStatement {
		const cached = this.cache.get(sql);
		if (cached !== undefined) return cached;
		const statement = this.prepare(sql);
		this.cache.set(sql, statement);
		return statement;
	}

	/**
	 * `fn` wrapped in a transaction: calling the result runs it deferred,
	 * and `.immediate()` / `.exclusive()` / `.deferred()` pick the mode.
	 * Inside an open transaction it becomes a savepoint.
	 */
	transaction<TArgs extends unknown[], TResult>(
		fn: (...args: TArgs) => TResult,
	): ((...args: TArgs) => TResult) & {
		immediate: (...args: TArgs) => TResult;
		exclusive: (...args: TArgs) => TResult;
		deferred: (...args: TArgs) => TResult;
	} {
		const run =
			(mode: TTransactionMode) =>
			(...args: TArgs): TResult =>
				this.database.isTransaction
					? this.inSavepoint(() => fn(...args))
					: this.inTransaction(mode, () => fn(...args));
		return Object.assign(run('DEFERRED'), {
			immediate: run('IMMEDIATE'),
			exclusive: run('EXCLUSIVE'),
			deferred: run('DEFERRED'),
		});
	}

	close(): void {
		this.cache.clear();
		this.database.close();
	}

	private inTransaction<TResult>(
		mode: TTransactionMode,
		body: () => TResult,
	): TResult {
		this.database.exec(`BEGIN ${mode}`);
		try {
			const result = body();
			this.database.exec('COMMIT');
			return result;
		} catch (error) {
			if (this.database.isTransaction) this.database.exec('ROLLBACK');
			throw error;
		}
	}

	private inSavepoint<TResult>(body: () => TResult): TResult {
		this.savepoints += 1;
		const name = `delendai_sp_${String(this.savepoints)}`;
		this.database.exec(`SAVEPOINT ${name}`);
		try {
			const result = body();
			this.database.exec(`RELEASE ${name}`);
			return result;
		} catch (error) {
			this.database.exec(`ROLLBACK TO ${name}`);
			this.database.exec(`RELEASE ${name}`);
			throw error;
		}
	}
}
