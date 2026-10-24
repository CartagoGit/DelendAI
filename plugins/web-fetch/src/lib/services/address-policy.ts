/**
 * address-policy.ts — which resolved addresses a fetch may connect to.
 *
 * The allow-list names hosts, and a name is only as good as what it
 * resolves to: an allow-listed name that resolves to 127.0.0.1 or to a
 * cloud metadata address (DNS rebinding) reached the inside of the
 * machine. A private, loopback, link-local or unspecified address is
 * refused unless the caller opted in, or the allow-listed host is that
 * literal address or `localhost` — naming it is the opt-in.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { IResolveHost } from '../contracts/interfaces/fetch.interface';

/** Every address the system resolver answers for `hostname`. */
export const resolveWithDns: IResolveHost = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map(
		(entry) => entry.address,
	);

const IPV4_OCTETS = 4;

const isPrivateIpv4 = (address: string): boolean => {
	const octets = address.split('.').map(Number);
	if (octets.length !== IPV4_OCTETS) return true;
	const [a = 0, b = 0] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
};

/** True for an address a public fetch has no business connecting to. */
export const isPrivateAddress = (address: string): boolean => {
	const lower = address.toLowerCase().replace(/^\[|\]$/gu, '');
	const family = isIP(lower);
	if (family === 4) return isPrivateIpv4(lower);
	if (family !== 6) return true;
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(lower);
	if (mapped?.[1] !== undefined) return isPrivateIpv4(mapped[1]);
	return (
		lower === '::' ||
		lower === '::1' ||
		/^f[cd]/u.test(lower) ||
		/^fe[89ab]/u.test(lower) ||
		/^ff/u.test(lower)
	);
};

/** Naming a literal address or `localhost` in the allow-list opts in. */
const namesItsOwnAddress = (hostname: string): boolean =>
	hostname.toLowerCase() === 'localhost' ||
	isIP(hostname.replace(/^\[|\]$/gu, '')) !== 0;

/**
 * The first resolved address of `hostname` the fetch must not connect
 * to, or `undefined` when every one may be reached.
 */
export const refusedAddress = (
	hostname: string,
	addresses: readonly string[],
	allowPrivateAddresses: boolean,
): string | undefined => {
	if (allowPrivateAddresses || namesItsOwnAddress(hostname)) return undefined;
	if (addresses.length === 0) return '(no address)';
	return addresses.find(isPrivateAddress);
};
