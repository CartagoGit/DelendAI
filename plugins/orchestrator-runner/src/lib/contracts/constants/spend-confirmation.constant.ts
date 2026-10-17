/**
 * spend-confirmation.constant.ts — the question put to the user before a
 * hop spends.
 */
export const spendQuestion = (
	providerId: string,
	estimatedCostTier: number,
): string =>
	`May DelendAI run this one task on ${providerId} (cost tier ${String(estimatedCostTier)} of 5)? It may spend on that provider's account. Saying no spends nothing.`;
