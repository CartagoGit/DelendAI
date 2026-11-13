import type {
	IDatabaseSchema,
	IForeignKeyInfo,
	ITableInfo,
} from '../introspect/introspect-engine';

export type IRelationshipKind = 'one-to-one' | 'one-to-many' | 'many-to-many';

const sortByName = <T extends { readonly name: string }>(
	items: readonly T[],
): T[] => [...items].sort((left, right) => left.name.localeCompare(right.name));

const hasSameColumns = (
	left: readonly string[],
	right: readonly string[],
): boolean => {
	if (left.length !== right.length) {
		return false;
	}
	const rightSet = new Set(right);
	for (const column of left) {
		if (!rightSet.has(column)) {
			return false;
		}
	}
	return true;
};

const primaryKeyColumns = (table: ITableInfo): string[] =>
	table.columns
		.filter((column) => column.primaryKey)
		.map((column) => column.name);

const foreignKeyColumnSet = (table: ITableInfo): Set<string> =>
	new Set(
		table.foreignKeys.flatMap((foreignKey) => [...foreignKey.fromColumns]),
	);

export const isForeignKeyUnique = (
	table: ITableInfo,
	foreignKey: IForeignKeyInfo,
): boolean => {
	const pkColumns = primaryKeyColumns(table);
	if (
		pkColumns.length > 0 &&
		hasSameColumns(pkColumns, foreignKey.fromColumns)
	) {
		return true;
	}
	return table.indexes.some(
		(index) =>
			index.unique &&
			hasSameColumns(index.columns, foreignKey.fromColumns),
	);
};

const isForeignKeyOptional = (
	table: ITableInfo,
	foreignKey: IForeignKeyInfo,
): boolean => {
	const referencedColumns = new Set(foreignKey.fromColumns);
	for (const columnName of referencedColumns) {
		const column = table.columns.find(
			(candidate) => candidate.name === columnName,
		);
		if (column?.nullable !== true) {
			return false;
		}
	}
	return true;
};

const isJoinTable = (table: ITableInfo): boolean => {
	if (table.foreignKeys.length !== 2) {
		return false;
	}
	const referencedTables = new Set(
		table.foreignKeys.map((foreignKey) => foreignKey.toTable),
	);
	if (referencedTables.size !== 2) {
		return false;
	}
	const foreignKeyColumns = foreignKeyColumnSet(table);
	if (foreignKeyColumns.size !== table.columns.length) {
		return false;
	}
	const keyColumns = primaryKeyColumns(table);
	return (
		keyColumns.length === 0 ||
		hasSameColumns(keyColumns, [...foreignKeyColumns])
	);
};

export const classifyForeignKeyRelationship = (
	table: ITableInfo,
	foreignKey: IForeignKeyInfo,
): IRelationshipKind => {
	if (isJoinTable(table)) {
		return 'many-to-many';
	}
	return isForeignKeyUnique(table, foreignKey) ? 'one-to-one' : 'one-to-many';
};

export const filterSchemaTables = (
	schema: IDatabaseSchema,
	tables?: readonly string[],
): IDatabaseSchema => {
	if (tables === undefined || tables.length === 0) {
		return {
			...schema,
			tables: sortByName(schema.tables).map((table) => ({
				...table,
				columns: [...table.columns],
				indexes: sortByName(table.indexes).map((index) => ({
					...index,
					columns: [...index.columns],
				})),
				foreignKeys: sortByName(table.foreignKeys).map(
					(foreignKey) => ({
						...foreignKey,
						fromColumns: [...foreignKey.fromColumns],
						toColumns: [...foreignKey.toColumns],
					}),
				),
			})),
		};
	}
	const requested = new Set(tables);
	const filteredTables = sortByName(schema.tables)
		.filter((table) => requested.has(table.name))
		.map((table) => ({
			...table,
			columns: [...table.columns],
			indexes: sortByName(table.indexes).map((index) => ({
				...index,
				columns: [...index.columns],
			})),
			foreignKeys: sortByName(table.foreignKeys)
				.filter((foreignKey) => requested.has(foreignKey.toTable))
				.map((foreignKey) => ({
					...foreignKey,
					fromColumns: [...foreignKey.fromColumns],
					toColumns: [...foreignKey.toColumns],
				})),
		}));
	return { ...schema, tables: filteredTables };
};

const columnFlags = (table: ITableInfo, columnName: string): string[] => {
	const flags: string[] = [];
	const column = table.columns.find(
		(candidate) => candidate.name === columnName,
	);
	if (column?.primaryKey === true) {
		flags.push('PK');
	}
	if (
		table.foreignKeys.some((foreignKey) =>
			foreignKey.fromColumns.includes(columnName),
		)
	) {
		flags.push('FK');
	}
	if (
		table.indexes.some(
			(index) =>
				index.unique &&
				index.columns.length === 1 &&
				index.columns[0] === columnName,
		)
	) {
		flags.push('UK');
	}
	return flags;
};

const relationshipMarkers = (
	table: ITableInfo,
	foreignKey: IForeignKeyInfo,
): { readonly parent: string; readonly child: string } => {
	const child = isForeignKeyUnique(table, foreignKey)
		? isForeignKeyOptional(table, foreignKey)
			? 'o|'
			: '||'
		: isForeignKeyOptional(table, foreignKey)
			? 'o{'
			: '|{';
	return { parent: '||', child };
};

export const countRelationships = (schema: IDatabaseSchema): number =>
	schema.tables.reduce((total, table) => total + table.foreignKeys.length, 0);

export const buildMermaidEr = (schema: IDatabaseSchema): string => {
	const orderedSchema = filterSchemaTables(schema);
	const lines: string[] = ['erDiagram'];

	for (const table of orderedSchema.tables) {
		lines.push(`    ${table.name} {`);
		for (const column of table.columns) {
			const flags = columnFlags(table, column.name);
			lines.push(
				`        ${column.type} ${column.name}${flags.length > 0 ? ` ${flags.join(' ')}` : ''}`,
			);
		}
		lines.push('    }');
	}

	const relationships = orderedSchema.tables.flatMap((table) =>
		table.foreignKeys.map((foreignKey) => {
			const markers = relationshipMarkers(table, foreignKey);
			return `    ${foreignKey.toTable} ${markers.parent}--${markers.child} ${foreignKey.fromTable} : "${foreignKey.name}"`;
		}),
	);

	if (relationships.length > 0) {
		lines.push('');
		lines.push(...relationships);
	}

	return `${lines.join('\n')}\n`;
};
