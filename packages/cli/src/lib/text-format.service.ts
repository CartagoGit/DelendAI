export const formatRows = (
	rows: readonly Record<string, unknown>[],
	columns: readonly string[],
): string => {
	if (rows.length === 0) return 'No rows.\n';
	const widths = columns.map((column) =>
		Math.max(
			column.length,
			...rows.map((row) => String(row[column] ?? '').length),
		),
	);
	const line = (values: readonly string[]): string =>
		values
			.map((value, index) => value.padEnd(widths[index] ?? 0))
			.join('  ');
	return `${line(columns)}\n${line(columns.map((column) => '-'.repeat(column.length)))}\n${rows
		.map((row) => line(columns.map((column) => String(row[column] ?? ''))))
		.join('\n')}\n`;
};

export const asScalarText = (value: unknown): string => {
	if (value === undefined) return '';
	if (typeof value === 'string') return `${value}\n`;
	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value === null
	) {
		return `${String(value)}\n`;
	}
	return `${JSON.stringify(value, null, 2)}\n`;
};
