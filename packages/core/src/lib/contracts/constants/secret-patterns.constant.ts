/**
 * secret-patterns.constant.ts — core's name for the one secret rule set,
 * which lives in `@delendai/contracts` so the client and
 * the security plugin read the same list.
 */
export {
	HIGH_CONFIDENCE_SECRET_PATTERNS,
	REDACTED,
	SECRET_RULES,
} from '@delendai/contracts';
export type { ISecretRule } from '@delendai/contracts';
