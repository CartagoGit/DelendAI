/**
 * Reaching a tool the managed surface keeps hidden.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IMcpToolDescriptor } from '@delendai/client/public';

import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { request } from './cli-command.helper';
import {
	isUnexposedHere,
	requalify,
	resolverFor,
	serverPrefix,
	unwrapResolved,
} from './tool-request.service';

const notFound = (tool: string) => ({
	result: {
		content: [
			{ type: 'text', text: `MCP error -32602: Tool ${tool} not found` },
		],
		isError: true,
	},
});

describe('isUnexposedHere (x00616)', () => {
	it('recognises the surface saying a tool is not exposed here', () => {
		expect(isUnexposedHere(notFound('delendai_search_search'))).toBe(true);
	});

	it('recognises the other spelling, which means the same thing', () => {
		// Measured against the live server: `metrics` and `scaffold` answer
		// `disabled` while `search` answers `not found`, and the resolver
		// runs all three. Treating only the first as retryable left four
		// command families broken.
		expect(
			isUnexposedHere({
				result: {
					content: [
						{
							text: 'MCP error -32602: Tool delendai_metrics disabled',
						},
					],
				},
			}),
		).toBe(true);
	});

	it('does not mistake a bad argument for a missing tool', () => {
		// -32602 is "invalid params" as well; retrying THAT through the
		// resolver would hide a caller's mistake behind a second failure.
		expect(
			isUnexposedHere({
				result: {
					content: [
						{
							type: 'text',
							text: 'MCP error -32602: unknown argument "quary"',
						},
					],
				},
			}),
		).toBe(false);
	});

	it('leaves an unrelated failure alone', () => {
		expect(isUnexposedHere(new Error('the disk is full'))).toBe(false);
	});
});

describe('serverPrefix and resolverFor (x00619)', () => {
	const surface = (names: readonly string[]) =>
		fakePartial<ICliCommandContext, 'listTools'>({
			listTools: async () =>
				names.map((name) =>
					fakePartial<IMcpToolDescriptor, 'name'>({ name }),
				),
		});

	it('reads the namespace off the server own surface', async () => {
		await expect(
			serverPrefix(surface(['acme_overview', 'acme_resolve_capability'])),
		).resolves.toBe('acme');
	});

	it('asks the surface once per context', async () => {
		let asked = 0;
		const ctx = fakePartial<ICliCommandContext, 'listTools'>({
			listTools: async () => {
				asked += 1;
				return [
					fakePartial<IMcpToolDescriptor, 'name'>({
						name: 'delendai_resolve_capability',
					}),
				];
			},
		});

		await serverPrefix(ctx);
		await serverPrefix(ctx);

		expect(asked).toBe(1);
	});

	it('answers undefined when no surface says', async () => {
		await expect(
			serverPrefix(surface(['something_else'])),
		).resolves.toBeUndefined();
		await expect(
			serverPrefix(
				fakePartial<ICliCommandContext, 'listTools'>({
					listTools: async () => {
						throw new Error('no transport');
					},
				}),
			),
		).resolves.toBeUndefined();
	});

	it('names the router as this server names it', () => {
		expect(resolverFor('acme')).toBe('acme_resolve_capability');
	});

	it('respells a tool for the namespace the server uses', () => {
		// The canonical name is a LOGICAL identifier; the leading segment
		// is a namespace the server chooses.
		expect(requalify('delendai_search_search', 'acme')).toBe(
			'acme_search_search',
		);
		expect(requalify('delendai_status', 'acme')).toBe('acme_status');
		expect(requalify('status', 'acme')).toBe('acme_status');
	});
});

describe('unwrapResolved (x00616)', () => {
	it('hands back the tool payload the resolver wrapped', () => {
		expect(
			unwrapResolved('t', {
				status: 'ok',
				result: { content: [{ text: '{"count":3}' }] },
			}),
		).toStrictEqual({ count: 3 });
	});

	it('names the refusal instead of returning nothing', () => {
		expect(() =>
			unwrapResolved('delendai_search_search', {
				status: 'terminal',
				reason: 'policy_denied',
				detail: 'the host is read-only',
			}),
		).toThrow(/policy_denied.*read-only/u);
	});

	it('says so when a resolved call carried no payload', () => {
		expect(() => unwrapResolved('t', { status: 'ok' })).toThrow(
			/no payload/u,
		);
	});

	it('hands back prose as prose rather than pretending it was JSON', () => {
		expect(
			unwrapResolved('t', {
				status: 'ok',
				result: { content: [{ text: 'not json at all' }] },
			}),
		).toBe('not json at all');
	});
});

describe('request falls back to the resolver (x00616)', () => {
	const contextThat = (hidden: readonly string[]) => {
		const asked: string[] = [];
		const ctx = fakePartial<ICliCommandContext, 'request' | 'listTools'>({
			listTools: async () => [
				fakePartial<IMcpToolDescriptor, 'name'>({
					name: 'delendai_resolve_capability',
				}),
			],
			request: async <TOut>(
				tool: string,
				args: object,
			): Promise<TOut> => {
				asked.push(tool);
				if (hidden.includes(tool)) {
					throw {
						result: {
							content: [
								{
									text: `MCP error -32602: Tool ${tool} not found`,
								},
							],
						},
					};
				}
				if (tool.endsWith('_resolve_capability')) {
					const wanted = (args as { qualifiedName: string })
						.qualifiedName;
					return {
						status: 'ok',
						result: {
							content: [{ text: `{"ranFor":"${wanted}"}` }],
						},
					} as TOut;
				}
				return { direct: true } as TOut;
			},
		});
		return { ctx, asked };
	};

	it('reaches a hidden tool through the resolver', async () => {
		const { ctx, asked } = contextThat(['delendai_search_search']);

		await expect(
			request(ctx, 'delendai_search_search', { query: 'x' }),
		).resolves.toStrictEqual({ ranFor: 'delendai_search_search' });
		expect(asked).toStrictEqual([
			'delendai_search_search',
			'delendai_resolve_capability',
		]);
	});

	it('costs a visible tool exactly one round trip', async () => {
		const { ctx, asked } = contextThat([]);

		await expect(
			request(ctx, 'delendai_overview', {}),
		).resolves.toStrictEqual({ direct: true });
		expect(asked).toStrictEqual(['delendai_overview']);
	});

	it('does not retry a failure that is not about the tool being hidden', async () => {
		const ctx = fakePartial<ICliCommandContext, 'request' | 'listTools'>({
			listTools: async () => [],
			request: async () => {
				throw new Error('the disk is full');
			},
		});

		await expect(request(ctx, 'delendai_overview', {})).rejects.toThrow(
			/disk is full/u,
		);
	});
});
