import type { APIRoute, GetStaticPaths } from 'astro';

export const getStaticPaths = (() => [
	{ params: { topic: 'agent-dead' } },
]) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
	const topic = params.topic ?? 'agent-dead';
	const body = `event: ${topic}\ndata: {"event":"${topic}","bootstrap":true}\n\n`;
	return new Response(body, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache',
		},
	});
};
