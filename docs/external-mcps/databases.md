# Databases — the right MCP for each engine

> Same pattern as LSPs: most database MCPs are thin wrappers. The right pick
> depends on what you actually need (read-only? read+write? schema-aware?
> performance?).

## Recommended ⭐ seeds

### PostgreSQL

| Server | Why |
|---|---|
| `@modelcontextprotocol/server-postgres` (Anthropic official) | Read-only, schema inspection. 77k weekly visitors. **Default**. |
| `crystaldba/postgres-mcp` | Adds performance analysis, tuning, health checks. Use **in addition to** the Anthropic one. |
| `JaviMaligno/postgres_mcp` | 14 tools, security-first SQL injection prevention, read-only by default. |
| `schemabrain` ([Arun-kc](https://github.com/Arun-kc/schemabrain)) | "Read-only trust layer for Postgres: the agent never writes SQL — twelve tools compile it from definitions you control, PII and secret categories are refused before the query runs, and every call lands in a tamper-evident SHA-256 audit chain." Worth considering if you have compliance needs. |
| `surfin-spam-safe-db-mcp` ([narekmalk](https://github.com/narekmalk/safedb-mcp)) | "Read-only DB access by AI agents, with SQL guardrails, table allowlists, PII masking, and audit logs." |

### SQLite

| Server | Why |
|---|---|
| `@modelcontextprotocol/server-sqlite` (Anthropic official) | Database ops + analysis features. |
| `hannesrudolph/sqlite-explorer-fastmcp-mcp-server` | Read-only with safety validation. |
| `jparkerweb/mcp-sqlite` | Comprehensive SQLite interaction. |
| `ofershap/mcp-server-sqlite` | Query, schema inspection, query plan explanation. |

### Multi-database (universal)

| Server | Why |
|---|---|
| `centralmind/gateway` | Auto-generates MCP from DB schema. Supports PG, ClickHouse, MySQL, Snowflake, BigQuery, Supabase. |
| `runekaagaard/mcp-alchemy` | SQLAlchemy-based, supports PG/MySQL/MariaDB/SQLite/Oracle/MS SQL Server. |
| `FreePeak/db-mcp-server` | Go, MySQL/Postgres. Includes transaction management, query building. |
| `crystaldba/postgres-mcp` | Also covers MySQL in some forks. |
| `Aiven-Open/mcp-aiven` | Aiven-managed PG/Kafka/ClickHouse/OpenSearch. |
| `wenge-research/smartdb_mcp` | Universal multi-DB (MySQL, PG, MSSQL, MariaDB, Dameng, Oracle). |
| `ThinAirTelematics/thinair-data` | Hosted PG/MySQL/SQL Server — 24 dialect-aware tools. |
| `snowflake-labs/mcp` | Official Snowflake, structured + unstructured data. |
| `couchbase/mcp-server-couchbase` | Official Couchbase. |

## Databases with strong native MCPs

### ClickHouse

| Server | Notes |
|---|---|
| `ClickHouse/mcp-clickhouse` (official) | Schema inspection + queries. |
| `mcp-clickhouse` (alt) | Same idea. |

### MongoDB

| Server | Notes |
|---|---|
| `mongodb-js/mongodb-mcp-server` (official, 86k weekly) | The de facto standard. |
| `furey/mongodb-lens` | Full-featured community. |
| `kiliczsh/mcp-mongo-server` | Simple, lightweight. |

### Redis

| Server | Notes |
|---|---|
| `redis/mcp-redis` (official) | The Redis-team-maintained one. Wire this. |
| `redis/mcp-redis-cloud` (official) | For Redis Cloud specifically. |

### Elasticsearch

| Server | Notes |
|---|---|
| `cr7258/elasticsearch-mcp-server` | Solid community pick. |
| `elastic/mcp-server-elasticsearch` (official) | Use this if you can. |

### BigQuery

| Server | Notes |
|---|---|
| `ergut/mcp-bigquery-server` | Direct BigQuery access. |
| `LucasHild/mcp-server-bigquery` | Schema inspection. |

### Snowflake

| Server | Notes |
|---|---|
| `Snowflake-Labs/mcp` (official) | Cortex Agents + structured/unstructured data. |
| `isaacwasserman/mcp-snowflake-server` | Read + optional write. |

### Supabase

| Server | Notes |
|---|---|
| `supabase-community/supabase-mcp` (official) | Full Supabase project ops. |

### Neon

| Server | Notes |
|---|---|
| `neondatabase/mcp-server-neon` (official) | Serverless Postgres. |

## Vector databases

| Server | When to use |
|---|---|
| `chroma-core/chroma-mcp` | If you use Chroma locally. |
| `qdrant/mcp-server-qdrant` | If you use Qdrant. |
| `weaviate/mcp-server-weaviate` | If you use Weaviate. |
| `zilliztech/mcp-server-milvus` | If you use Milvus / Zilliz. |
| `sirmews/mcp-pinecone` | If you use Pinecone. |

## Time-series & specialized

| Server | Database |
|---|---|
| `InfluxData/influxdb3_mcp_server` (official) | InfluxDB 3. |
| `VictoriaMetrics-Community/mcp-victorialogs` | VictoriaLogs. |
| `GreptimeTeam/greptimedb-mcp-server` | GreptimeDB. |
| `idoru/influxdb-mcp-server` | InfluxDB OSS v2. |
| `pab1it0/adx-mcp-server` | Azure Data Explorer. |
| `hydrolix/mcp-hydrolix` | Hydrolix. |
| `tradercjz/dolphindb-mcp-server` | DolphinDB. |

## Message queues

| Server | MQ |
|---|---|
| `confluentinc/mcp-confluent` (official) | Kafka / Confluent Cloud. |
| `jovezhong/mcp-timeplus` | Kafka + Timeplus SQL. |
| `wklee610/kafka-mcp` | Kafka introspection + offset management. |
| `aywengo/kafka-schema-reg-mcp` | Kafka Schema Registry. |

## Graph databases

| Server | Database |
|---|---|
| `neo4j-contrib/mcp-neo4j` (official) | Neo4j + Knowledge Graph Memory. |
| `memgraph/mcp-memgraph` | Memgraph. |

## What f00068 needs to update

The original curated tier mentioned `@modelcontextprotocol/server-postgres` and
`@modelcontextprotocol/server-sqlite` — these are still correct.

The 🟡 discoverable tier has ~35 database servers. Most are redundant. Keep
the official ones (MongoDB, Redis, Snowflake, ClickHouse, BigQuery,
Supabase, Neon, Elasticsearch) in the curated tier as opt-in per workspace.
Move community ones to 🟡 with the standard "may be stale" warning.