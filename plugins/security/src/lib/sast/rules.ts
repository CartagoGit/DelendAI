import { SAST_RULES } from '../contracts/constants/sast-rules.constant';
import type {
	ISastRule,
	SastLanguage,
} from '../contracts/interfaces/sast.interface';

export { SAST_RULES };
export type { ISastRule, SastLanguage };

export const compileRulePattern = (rule: ISastRule): RegExp =>
	new RegExp(rule.pattern, 'g');

export const matchesLanguage = (
	rule: ISastRule,
	languages: readonly SastLanguage[],
): boolean => rule.language === 'generic' || languages.includes(rule.language);
