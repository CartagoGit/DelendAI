import type { SafeScalar } from './contracts/interfaces/reporter.interface';
import { stableIndexOf } from './stable-index.helper';

interface ISyntheticFixture {
	readonly domain: string;
	readonly label: string;
	readonly ids: readonly string[];
	readonly urls: {
		readonly primary: string;
		readonly secondary: string;
	};
	readonly payload: Readonly<Record<string, SafeScalar>>;
	readonly list: readonly SafeScalar[];
}

const BAKERY_TOTAL_CENTS = 4200;
const WEATHER_WINDOW_HOURS = 12;
const INVENTORY_QUANTITY = 24;
const HASH_MULTIPLIER = 33;

const deepFreeze = <T>(value: T): T => {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const entry of Object.values(value as Record<string, unknown>)) {
		deepFreeze(entry);
	}
	return value;
};

export const SYNTHETIC_FIXTURES = deepFreeze([
	{
		domain: 'bakery',
		label: 'Example Bakery',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.invalid/orders',
			secondary: 'https://example.com/catalog/bakery',
		},
		payload: {
			orderId: 'EXAMPLE-001',
			batchId: 'DEMO-123',
			endpoint: 'https://example.invalid/orders',
			bakeryName: 'Example Bakery',
			items: [
				{
					sku: 'SYNTHETIC-42',
					label: 'croissant-crate',
					quantity: 2,
				},
			],
			totalCents: BAKERY_TOTAL_CENTS,
		},
		list: ['EXAMPLE-001', 'https://example.invalid/orders', 2],
	},
	{
		domain: 'weather',
		label: 'Harbor Forecast Desk',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.com/weather/forecast',
			secondary: 'https://example.invalid/weather/windows',
		},
		payload: {
			stationId: 'DEMO-123',
			requestId: 'SYNTHETIC-42',
			endpoint: 'https://example.com/weather/forecast',
			locale: 'Harbor Point',
			windowHours: WEATHER_WINDOW_HOURS,
			includeAlerts: true,
		},
		list: ['DEMO-123', 'Harbor Point', WEATHER_WINDOW_HOURS],
	},
	{
		domain: 'books',
		label: 'North Pier Library',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.invalid/books/catalog',
			secondary: 'https://example.com/books/preview',
		},
		payload: {
			shelfId: 'EXAMPLE-001',
			bookId: 'DEMO-123',
			endpoint: 'https://example.invalid/books/catalog',
			title: 'Harbor Lights Manual',
			copies: 4,
			includePreview: false,
		},
		list: ['DEMO-123', 'Harbor Lights Manual', 4],
	},
	{
		domain: 'pets',
		label: 'Miso Checkup Board',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.com/pets/checkups',
			secondary: 'https://example.invalid/pets/schedules',
		},
		payload: {
			petId: 'SYNTHETIC-42',
			clinicId: 'EXAMPLE-001',
			endpoint: 'https://example.com/pets/checkups',
			petName: 'Miso',
			species: 'cat',
			visits: 3,
		},
		list: ['SYNTHETIC-42', 'Miso', 3],
	},
	{
		domain: 'music-catalog',
		label: 'Sunrise Parade Archive',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.invalid/music/catalog',
			secondary: 'https://example.com/music/playlists',
		},
		payload: {
			trackId: 'DEMO-123',
			playlistId: 'SYNTHETIC-42',
			endpoint: 'https://example.invalid/music/catalog',
			title: 'Sunrise Parade',
			format: 'lossless',
			enabled: true,
		},
		list: ['DEMO-123', 'Sunrise Parade', true],
	},
	{
		domain: 'fictional-inventory',
		label: 'North Shelf Inventory',
		ids: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
		urls: {
			primary: 'https://example.com/inventory/snapshots',
			secondary: 'https://example.invalid/inventory/labels',
		},
		payload: {
			itemId: 'EXAMPLE-001',
			warehouseId: 'DEMO-123',
			endpoint: 'https://example.com/inventory/snapshots',
			sku: 'SYNTHETIC-42',
			quantity: INVENTORY_QUANTITY,
			location: 'North Shelf',
		},
		list: ['EXAMPLE-001', 'SYNTHETIC-42', INVENTORY_QUANTITY],
	},
] as const) as readonly ISyntheticFixture[];

export const selectSyntheticFixture = (input: {
	readonly packageId: string;
	readonly toolName: string;
	readonly toolSeed?: string | undefined;
	readonly errorCode?: string | undefined;
	readonly failureClass: string;
}): ISyntheticFixture =>
	SYNTHETIC_FIXTURES[
		stableIndexOf({
			seed: [
				input.packageId,
				input.toolSeed ?? input.toolName,
				input.errorCode ?? '',
				input.failureClass,
			].join(':'),
			length: SYNTHETIC_FIXTURES.length,
			multiplier: HASH_MULTIPLIER,
		})
	] ?? SYNTHETIC_FIXTURES[0]!;
