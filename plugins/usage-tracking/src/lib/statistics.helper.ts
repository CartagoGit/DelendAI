export const percentile = (
	values: readonly number[],
	ratio: number,
): number | null => {
	if (values.length === 0) return null;
	const ordered = [...values].sort((left, right) => left - right);
	const rank = Math.max(0, Math.ceil(ratio * ordered.length) - 1);
	return ordered[Math.min(rank, ordered.length - 1)] ?? null;
};
