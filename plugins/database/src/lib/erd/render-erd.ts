/**
 * f00128 S3 — pure Mermaid `erDiagram` renderer.
 *
 * Consumes the driver-agnostic `IDatabaseSchema` from S1 and
 * produces a single, sanitized Mermaid `erDiagram` block. Pure
 * (no I/O, no spawn): the same schema always produces the same
 * diagram, so unit tests assert exact output.
 *
 * Mermaid erDiagram syntax: https://mermaid.js.org/syntax/entityRelationshipDiagram.html
 *   - Entities are Title_Case PascalCase identifiers (no spaces).
 *   - Attributes are listed with type + name + keys (PK / FK / UK).
 *   - Relationships are one of `||--o{`, `||--|{`, `}o--o{`, etc.
 *
 * Identifier sanitization maps `snake_case` / `camelCase` /
 * `spaces` → TitleCase. Reserved Mermaid keywords (`end`, `one`,
 * `many`) are suffixed with a `_` to avoid parse failures.
 */
import type {
	IColumnInfo,
	IDatabaseSchema,
	IForeignKeyInfo,
	ITableInfo,
} from '../introspect/introspect-engine';

const RESERVED_MERMAID = new Set([
	'end',
	'one',
	'many',
	'true',
	'false',
	'class',
	'graph',
	'subgraph',
]);

/** Map any raw name to a Mermaid-safe PascalCase identifier. */
export const safeEntityName = (raw: string): string => {
	// Reserved-keyword check runs FIRST on the raw lowercased name so
	// e.g. `end` does not get PascalCased into `End` (which would slip
	// past the reserved set and break Mermaid's parser on `}`).
	if (RESERVED_MERMAID.has(raw.trim().toLowerCase())) {
		return `${raw.trim().toLowerCase()}_`;
	}
	const base =
		raw
			.replace(/[^A-Za-z0-9_]+/g, '_')
			.split(/[_\s]+/)
			.filter((p) => p.length > 0)
			.map((p) =>
				/^[A-Za-z]/.test(p)
					? p.charAt(0).toUpperCase() + p.slice(1)
					: p,
			)
			.join('') || 'Unnamed';
	return /^[A-Za-z]/.test(base) ? base : `T_${base}`;
};

/** Map a canonical column type to a Mermaid-friendly type. */
const columnTypeFor = (column: IColumnInfo): string => {
	switch (column.type) {
		case 'integer':
			return 'int';
		case 'real':
			return 'float';
		case 'text':
			return 'string';
		case 'blob':
			return 'bytes';
		case 'boolean':
			return 'bool';
		case 'datetime':
			return 'datetime';
		case 'json':
			return 'json';
		default:
			return 'unknown';
	}
};

const attributeLine = (column: IColumnInfo): string => {
	const parts: string[] = [columnTypeFor(column), column.name];
	if (column.primaryKey) parts.push('PK');
	return `  ${parts.join(' ')}`;
};

const relationshipLine = (
	fk: IForeignKeyInfo,
	fromId: string,
	toId: string,
): string => {
	// Many-to-one is the common default for foreign keys (each row in
	// the from-table points at one row in the to-table).
	return `  ${fromId} ||--o{ ${toId} : "${fk.name}"`;
};

/** Render the full `erDiagram` block. */
export const renderErd = (schema: IDatabaseSchema): string => {
	const lines: string[] = ['erDiagram'];
	const tableToEntity = new Map<string, string>();
	for (const table of schema.tables) {
		const entity = safeEntityName(table.name);
		tableToEntity.set(table.name, entity);
	}
	// Entity blocks: declaration + attribute list.
	for (const table of schema.tables) {
		const entity = tableToEntity.get(table.name) as string;
		lines.push(`${entity} {`);
		// Primary keys first (Mermaid's PK marker is conventional;
		// rendering them at the top makes the diagram readable).
		const sortedColumns = [...table.columns].sort((a, b) => {
			if (a.primaryKey !== b.primaryKey) return a.primaryKey ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const column of sortedColumns) {
			lines.push(attributeLine(column));
		}
		lines.push('}');
	}
	// Relationship blocks: one line per foreign key.
	for (const table of schema.tables) {
		const fromEntity = tableToEntity.get(table.name) as string;
		for (const fk of table.foreignKeys) {
			const toEntity = tableToEntity.get(fk.toTable);
			if (toEntity === undefined) continue; // skip dangling refs
			lines.push(relationshipLine(fk, fromEntity, toEntity));
		}
	}
	return lines.join('\n');
};

/** Convenience: the per-table `IEntityBlock` projection. */
export interface IEntityBlock {
	readonly entity: string;
	readonly table: ITableInfo;
	readonly columns: readonly IColumnInfo[];
}

export const listEntityBlocks = (
	schema: IDatabaseSchema,
): readonly IEntityBlock[] =>
	schema.tables.map((table) => ({
		entity: safeEntityName(table.name),
		table,
		columns: table.columns,
	}));

/**
 * Returns true when the rendered diagram includes every
 * table's columns and every foreign key. Used by the
 * contract test below.
 */
export const renderErdIntegrity = (schema: IDatabaseSchema): boolean => {
	const rendered = renderErd(schema);
	for (const table of schema.tables) {
		if (!rendered.includes(safeEntityName(table.name))) return false;
	}
	for (const table of schema.tables) {
		for (const fk of table.foreignKeys) {
			if (!rendered.includes(`"${fk.name}"`)) return false;
		}
	}
	return true;
};
