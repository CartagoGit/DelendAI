import type { z } from 'zod';

import type { AGENT_CATALOG_MESSAGE_SCHEMA } from '../constants/agent-catalog-message-schema.constant';

export type AgentCatalogMessage = z.infer<typeof AGENT_CATALOG_MESSAGE_SCHEMA>;
