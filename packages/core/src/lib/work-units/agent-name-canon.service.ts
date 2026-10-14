/**
 * agent-name-canon.service.ts — every agent writes its own name, from what
 * it knows of itself, in one shape.
 *
 * The roster of one review swarm signed as `qwen3-flash`, `qwen-3.8-max`,
 * `minimax-3.1-flash-preview`, `minimax-m3.1-flash-preview` and
 * `gemini-3.8-flash-high`: the same few models, spelled however each
 * instance felt like that day. Which model an agent is, only the agent can
 * say, and models change; how that name is written is the project's to
 * fix, once, so that one model always reads the same.
 *
 * The canon: lowercase, hyphen-separated; the maker or family first, in
 * letters only; the version as the maker publishes it, in a segment of its
 * own (`3.8`, `5.4`, `m3.1`, `5-5`); then the tier or line (`flash`,
 * `preview`). How hard the model was asked to think is not part of it.
 */
import {
	AGENT_NAME_EFFORT_WORDS,
	AGENT_NAME_VERSION_SEGMENT,
} from '../contracts/constants/agent-name-canon.constant';

/**
 * Why `agent` is not written in the canon, and how it would be; or
 * `undefined`. The product's own actors (`<namespace>-<role>`, such as the
 * queue) are not models and keep their names.
 */
export const describeAgentNameShape = (
	agent: string,
	namespacePrefix?: string,
): string | undefined => {
	if (
		namespacePrefix !== undefined &&
		new RegExp(`^${namespacePrefix}-[a-z]+(-[a-z]+)*$`, 'u').test(agent)
	) {
		return undefined;
	}
	const why = shapeProblem(agent);
	return why === undefined
		? undefined
		: `\`${agent}\` is not written the way agents name themselves here: ${why} The name is yours to know: maker first, then the version your maker publishes for you, then the tier, lowercase and hyphen-separated (\`glm-5.3-flash\`, \`qwen-3.8-flash\`, \`gpt-5.4\`, \`claude-opus-5-5\`).`;
};

const shapeProblem = (agent: string): string | undefined => {
	if (!/^[a-z0-9.-]+$/u.test(agent)) {
		return 'it may hold only lowercase letters, digits, dots and hyphens.';
	}
	const segments = agent.split('-');
	if (segments.some((segment) => segment.length === 0)) {
		return 'its parts are joined by single hyphens.';
	}
	const [maker = ''] = segments;
	if (!/^[a-z]+$/u.test(maker)) {
		const letters = maker.replaceAll(/[^a-z]/gu, '');
		const rest = maker.slice(letters.length);
		return `the maker comes first and in letters only, apart from the version (\`${letters}-${rest}…\`, not \`${maker}…\`).`;
	}
	if (!segments.slice(1).some((s) => AGENT_NAME_VERSION_SEGMENT.test(s))) {
		return 'it carries no version: write the one your maker publishes for you, in a part of its own.';
	}
	const last = segments.at(-1) ?? '';
	if (AGENT_NAME_EFFORT_WORDS.includes(last)) {
		return `\`${last}\` says how hard you were asked to think, not which model you are; leave it out.`;
	}
	return undefined;
};
