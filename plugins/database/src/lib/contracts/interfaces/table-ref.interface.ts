/**
 * table-ref.interface.ts — a table named with the schema that holds it.
 */

/** A table by name and the schema (or attached database) that holds it. */
export interface ITableRef {
	readonly name: string;
	/** `null` for a driver with a single unnamed namespace. */
	readonly schema: string | null;
}
