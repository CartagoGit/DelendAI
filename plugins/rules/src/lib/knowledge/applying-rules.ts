import type { IRulesMode } from '../frameworks/types';
import { RULES_MODE_GUIDANCE } from '../frameworks/types';

/** Build the agent-facing guidance for applying rules in `mode`. */
export const buildApplyingRulesKnowledge = (
	namespacePrefix: string,
	mode: IRulesMode,
	cacheRelDir: string,
): { id: string; title: string; body: string } => ({
	id: 'applying-rules',
	title: 'Applying lint/type rules',
	body: [
		'# Applying lint/type rules',
		'',
		'**Default behaviour (no need to be told): every piece of code you create or modify must already follow this project’s rules.** Apply them as you write, not as an afterthought.',
		'',
		`Enforcement mode: **${mode}** — ${RULES_MODE_GUIDANCE[mode]}`,
		'',
		'How rules are resolved:',
		`- A manifest at \`${cacheRelDir}/rules-map.json\` maps each project area to its framework and to the ESLint + typecheck configs in **priority order: the project's own config first, our default behind it**. The project always wins.`,
		'- Default presets are materialised under `' +
			cacheRelDir +
			'/` (one ESLint config + tsconfig per framework). They are starting points; never edit them by hand — override in your project config.',
		'- Different folders can use different frameworks (e.g. a Vue app next to a Laravel API); each area resolves independently.',
		'',
		'Linter & Dogma Family Mapping:',
		'- Rust family (clippy): borrow-checker memory, Result error model, Option null-safety, snake_case.',
		'- Python family (ruff): garbage-collected, exceptions error model, nullable null-safety, snake_case.',
		'- Go family (golangci-lint): garbage-collected, explicit errors, nil null-safety, mixedCaps.',
		'- JS/TS family (eslint): garbage-collected, exceptions, null-undefined safety, camelCase.',
		'- .NET family (dotnet-format): garbage-collected, exceptions, nullable reference safety, PascalCase.',
		'- JVM family (checkstyle/ktlint): garbage-collected, exceptions, nullable/null-safe type safety, camelCase.',
		'- BEAM family (credo): garbage-collected, pattern-matching errors, nil null-safety, snake_case.',
		'- Ruby family (rubocop): garbage-collected, exceptions, nullable, snake_case.',
		'- PHP family (pint): garbage-collected, exceptions, nullable, camelCase.',
		'- Mobile family (swiftlint/dart analyze): garbage-collected, exceptions/throws, optionals, camelCase.',
		'',
		'Loop for any agent/model:',
		`1. \`${namespacePrefix}_get_rules\` once to learn each area's framework, conventions and mode.`,
		'2. When you WRITE code, follow that area’s conventions from the start (cheaper than fixing later).',
		`3. \`${namespacePrefix}_check_rules\` to get the exact command; run it to find violations.`,
		`4. \`${namespacePrefix}_apply_rules\` to get the mode-specific plan, then execute it:`,
		'   - strict → fix everything; mixed → fix only files you touched; none → report only; proposal → create proposals.',
		'',
		'Keep it low-token: read a preset’s details only for the area you are working in.',
	].join('\n'),
});
