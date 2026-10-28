/**
 * sqlite-binding.interface.ts — the part of the native SQLite binding the
 * driver uses, so a test can stand in for it.
 */

export interface IBetterSqlite {
	prepare: (sql: string) => {
		all: (...params: unknown[]) => unknown[];
		iterate: (...params: unknown[]) => Iterable<unknown>;
	};
	close: () => void;
}

export interface IBetterSqliteCtor {
	new (path: string): IBetterSqlite;
}
