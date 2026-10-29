/**
 * declared-provider.interface.ts — a model provider declared in models.dev's shape.
 */
import type z from 'zod';

import type { DECLARED_PROVIDER_SCHEMA } from '../constants/declared-provider-schema.constant';

export type IDeclaredProvider = z.infer<typeof DECLARED_PROVIDER_SCHEMA>;
