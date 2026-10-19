import { pathToFileURL } from 'node:url';
const root = pathToFileURL(`${process.cwd()}/`);
const { callLlmFanOut } = await import(
	new URL('plugins/audit/src/lib/services/llm-client.service.ts', root).href
);
const targets = Array.from({ length: 5 }, (_, i) => ({
	provider: 'openai' as const,
	model: `model-${i + 1}`,
	apiKey: 'fixture-key',
}));
const calls: string[] = [];
const transport = {
	async fetchJson(_url: string, init: { body: string }) {
		calls.push(JSON.parse(init.body).model);
		return {
			status: 200,
			json: { choices: [{ message: { content: '# audit\n' } }] },
		};
	},
};
const outcomes = await callLlmFanOut(targets, 'fixture brief', { transport });
console.log(
	JSON.stringify({
		requested: targets.map((t) => t.model),
		called: calls,
		outcomes: outcomes.map((o) => o.target.model),
	}),
);
