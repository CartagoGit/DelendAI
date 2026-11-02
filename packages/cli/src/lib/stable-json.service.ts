const sortValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, sortValue(entry)]),
	);
};

export const formatJson = (value: unknown): string =>
	`${JSON.stringify(sortValue(value), null, 2)}\n`;
