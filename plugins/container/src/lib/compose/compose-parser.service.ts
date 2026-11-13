/**
 * compose-parser.service.ts — a compose file's services: names, images,
 * ports, the names of their environment variables and their mounts.
 *
 * Only as much of the format as the tools need to name a service and
 * say what it exposes. Environment values are never returned: they are
 * where a compose file keeps its secrets.
 */
import { parse } from 'yaml';

import type { IComposeService } from '../contracts/interfaces/docker-command.interface';

const strings = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.map((item) =>
				typeof item === 'object' && item !== null
					? [
							(item as Record<string, unknown>).source,
							(item as Record<string, unknown>).target,
						]
							.filter((part) => part !== undefined)
							.join(':')
					: String(item),
			)
		: [];

const environmentNames = (value: unknown): readonly string[] => {
	if (Array.isArray(value))
		return value
			.map((item) => String(item).split('=')[0] ?? '')
			.filter((name) => name.length > 0);
	if (typeof value === 'object' && value !== null) return Object.keys(value);
	return [];
};

/** The services of a compose file, or an empty list when it has none. */
export const parseCompose = (text: string): readonly IComposeService[] => {
	const document: unknown = parse(text);
	const services =
		typeof document === 'object' && document !== null
			? (document as Record<string, unknown>).services
			: undefined;
	if (typeof services !== 'object' || services === null) return [];
	return Object.entries(services as Record<string, unknown>).map(
		([name, raw]) => {
			const service = (
				typeof raw === 'object' && raw !== null ? raw : {}
			) as Record<string, unknown>;
			const build = service.build;
			return {
				name,
				...(typeof service.image === 'string'
					? { image: service.image }
					: {}),
				...(typeof build === 'string'
					? { build }
					: typeof build === 'object' &&
							build !== null &&
							typeof (build as Record<string, unknown>)
								.context === 'string'
						? {
								build: String(
									(build as Record<string, unknown>).context,
								),
							}
						: {}),
				ports: strings(service.ports),
				environment: environmentNames(service.environment),
				mounts: strings(service.volumes),
			};
		},
	);
};
