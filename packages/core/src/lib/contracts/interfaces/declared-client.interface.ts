/**
 * declared-client.interface.ts — a client as configuration declares it.
 */
import type { z } from 'zod';

import type { KNOWN_CLIENT_SCHEMA } from '../constants/known-client-schema.constant';

export type IDeclaredClient = z.infer<typeof KNOWN_CLIENT_SCHEMA>;
