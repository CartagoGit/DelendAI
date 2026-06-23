// body-content/index: thin dispatcher + barrel.
//
// SOLID — Single Responsibility. This module owns ONE thing: routing
// an `IBlueprintArtifact` to the right body builder. It does not know
// how to build any body itself; it only knows the artifact → function
// mapping.
//
// SOLID — Open/Closed. New artefact types are added by importing a
// new builder and adding a case to the switch. Existing builders are
// not edited.

import type { IProjectAnalysis } from '../analyze-project';
import type { IBlueprintArtifact } from '../build-blueprint';
import {
	continueProposalPromptBody,
	fixQualityPromptBody,
	startPromptBody,
} from './prompt-bodies';
import {
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	projectStandardsSkillBody,
} from './skill-bodies';

export {
	continueProposalPromptBody,
	fixQualityPromptBody,
	startPromptBody,
} from './prompt-bodies';
export {
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	projectStandardsSkillBody,
} from './skill-bodies';
export { formatList, formatScripts } from './format-helpers';
export { frameworkHintsFor } from './framework-hints';
export { languageHintsFor } from './language-hints';

/**
 * Resolve the body of a blueprint artefact from its `name`. The
 * switch is the single place to add a new artefact kind; the
 * builders themselves live in `prompt-bodies.ts` / `skill-bodies.ts`
 * and are unit-testable in isolation.
 */
export const blueprintArtifactBody = (
	artifact: IBlueprintArtifact,
	analysis: IProjectAnalysis,
	namespacePrefix: string,
): string => {
	switch (artifact.name) {
		case 'start':
			return startPromptBody(analysis, namespacePrefix);
		case 'fix quality':
			return fixQualityPromptBody(analysis, namespacePrefix);
		case 'continue proposal':
			return continueProposalPromptBody(namespacePrefix);
		default:
			return '';
	}
};
