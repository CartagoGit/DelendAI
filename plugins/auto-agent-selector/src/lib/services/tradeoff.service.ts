export const resolveTradeoff = (
	requestedTradeoff: number | undefined,
	defaultTradeoff: number,
): number => requestedTradeoff ?? defaultTradeoff;
