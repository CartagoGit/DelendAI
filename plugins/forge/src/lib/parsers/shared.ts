const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

export const parseJsonInput = (input: string | unknown): unknown => {
	if (typeof input !== 'string') return input;
	return JSON.parse(input);
};

export const asRecord = (value: unknown): Record<string, unknown> =>
	toRecord(value) ?? {};

export const asArray = (value: unknown): readonly unknown[] =>
	Array.isArray(value) ? value : [];

export const stringValue = (...values: unknown[]): string => {
	for (const value of values) {
		if (typeof value === 'string' && value.trim() !== '') return value;
		if (typeof value === 'number' && Number.isFinite(value))
			return String(value);
	}
	return '';
};

export const numberValue = (...values: unknown[]): number => {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string') {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return 0;
};

export const booleanValue = (...values: unknown[]): boolean => {
	for (const value of values) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') {
			if (value === 'true') return true;
			if (value === 'false') return false;
		}
	}
	return false;
};

export const labelsFrom = (value: unknown): string[] =>
	asArray(value)
		.map((entry) => {
			if (typeof entry === 'string') return entry;
			const record = asRecord(entry);
			return stringValue(record.name, record.title);
		})
		.filter((label) => label.length > 0);

export const authorFrom = (value: unknown): string => {
	const record = asRecord(value);
	return (
		stringValue(record.login, record.username, record.name, value) ||
		'unknown'
	);
};

export const commentsCountFrom = (value: unknown): number => {
	if (typeof value === 'number') return value;
	const record = asRecord(value);
	const nodes = asArray(record.nodes);
	if (nodes.length > 0) return nodes.length;
	return numberValue(
		record.count,
		record.totalCount,
		record.user_notes_count,
	);
};
