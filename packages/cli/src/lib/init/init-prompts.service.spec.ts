/**
 * init-prompts.service.spec.ts — the interactive init, driven through a
 * terminal whose answers the spec gives: every default, and every branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Answers by the start of each question; a question with none gets ''. */
const answers = new Map<string, string[]>();
const asked: string[] = [];

vi.mock('node:readline', () => ({
	createInterface: () => ({
		question: (query: string, answer: (text: string) => void) => {
			asked.push(query);
			const key = [...answers.keys()].find((start) =>
				query.startsWith(start),
			);
			const queue = key === undefined ? undefined : answers.get(key);
			answer(queue?.shift() ?? '');
		},
		close: () => undefined,
	}),
}));

// A worker that ran another spec first holds this service bound to the real
// readline; the mock only binds to a module loaded after this reset.
vi.resetModules();

const { askConfirm, collectInitAnswers } = await import(
	'./init-prompts.service'
);

let tty: PropertyDescriptor | undefined;
beforeEach(() => {
	tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
	Object.defineProperty(process.stdin, 'isTTY', {
		value: true,
		configurable: true,
	});
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	answers.clear();
	asked.length = 0;
});
afterEach(() => {
	if (tty === undefined) Reflect.deleteProperty(process.stdin, 'isTTY');
	else Object.defineProperty(process.stdin, 'isTTY', tty);
	vi.restoreAllMocks();
});

describe('collectInitAnswers in a terminal', () => {
	it('takes every default when the person presses enter', async () => {
		const result = await collectInitAnswers('/ws');
		expect(result).toMatchObject({
			preset: 'dogfood',
			extraPlugins: [],
			excludedPlugins: [],
			hostInstructions: 'append',
			copyCoreSkills: true,
			generateAgentMd: true,
			workspaceRoot: '/ws',
		});
	});

	it('walks every question: a plugin added and excluded, a bad id, a typo, the issues repo, the allow-list', async () => {
		answers.set('Which preset?', ['5']);
		answers.set('Add plugin?', ['not-a-plugin', 'audit']);
		answers.set('Add another plugin?', ['', '']);
		answers.set('Exclude any', ['audit']);
		answers.set('How to centralize', ['1']);
		answers.set('Copy core skills', ['ye', 'y']);
		answers.set('Generate .github', ['n']);
		answers.set('GitHub issues repo', ['owner/name']);
		answers.set('Add web-fetch hostname', ['example.com']);
		answers.set('Add another hostname', ['n']);
		const result = await collectInitAnswers('/ws');
		expect(result).toMatchObject({
			preset: 'full',
			extraPlugins: ['audit'],
			excludedPlugins: ['audit'],
			copyCoreSkills: true,
			generateAgentMd: false,
			issuesRepo: 'owner/name',
			webFetchAllowList: ['example.com'],
		});
		expect(
			asked.filter((query) => query.startsWith('Add plugin?')),
		).toHaveLength(2);
	});
});

describe('askConfirm', () => {
	it('takes the default on enter and after too many invalid answers', async () => {
		const prompt = (replies: string[]) => ({
			question: (_query: string, answer: (text: string) => void) => {
				answer(replies.shift() ?? 'maybe');
			},
		});
		expect(await askConfirm(prompt(['']), 'q', true)).toBe(true);
		expect(await askConfirm(prompt(['no']), 'q', true)).toBe(false);
		expect(await askConfirm(prompt(['yes']), 'q', false)).toBe(true);
		expect(await askConfirm(prompt([]), 'q', false)).toBe(false);
	});
});
