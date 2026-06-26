/**
 * Skill prompts — the `/` (trigger-character) surface for skills.
 *
 * Slice E of f00065. The `mcp-vertex_skill` tool (slice B) lets an agent
 * *discover* skills, but MCP-capable hosts (Claude, Codex, Copilot, OpenCode,
 * …) only surface **prompts** under their `/` trigger. So a skill that is only
 * a tool result never appears when a user types `/`. This module registers one
 * prompt per advertised skill — `<prefix>_skill_<id>` — whose body is the
 * skill's full SKILL.md, loaded lazily on invocation. Result: typing `/` lists
 * every skill of the active preset/plugins, and selecting one injects that
 * skill's guidance, with zero body cost until it is actually used.
 */
import type { IPromptRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { ISkillCatalog } from '../skills/skill-catalog';

/** Reduce a skill id to a valid prompt-name segment (alnum + `_`). */
export const skillPromptSlug = (id: string): string =>
	id
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();

/**
 * One `IPromptRegistration` per skill in the catalog. The catalog is read
 * through `getCatalog()` so the body loader stays lazy (same pattern as the
 * `skill` tool): the prompt list is built from `entries` up front, but each
 * SKILL.md body is only read when its prompt is invoked.
 */
export const buildSkillPromptRegistrations = (
	namespacePrefix: string,
	getCatalog: () => ISkillCatalog,
): readonly IPromptRegistration[] =>
	getCatalog().entries.map((entry) => {
		const slug = skillPromptSlug(entry.id);
		return {
			id: `skill_${slug}`,
			register: async (server) => {
				server.registerPrompt(
					`${namespacePrefix}_skill_${slug}`,
					{
						description: entry.description,
					},
					async () => {
						const body = await getCatalog().loadBody(entry.id);
						return {
							messages: [
								{
									role: 'user' as const,
									content: {
										type: 'text' as const,
										text:
											body ??
											`Skill "${entry.id}" is advertised but its SKILL.md body could not be loaded.`,
									},
								},
							],
						};
					},
				);
			},
		};
	});
