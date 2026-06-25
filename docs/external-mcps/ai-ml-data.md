# AI / ML / data — HuggingFace, Ollama, OpenAI, vector DBs, data platforms

> Most of these are "model bridges" — connect the agent to a model or data
> source it doesn't already have access to. Use sparingly: the agent
> already has its own model. Adding more models to call usually adds more
> noise than signal.

## Model providers

### Ollama (local models)

| Server | Notes |
|---|---|
| `jaspertvdm/mcp-server-ollama-bridge` | Bridge to local Ollama. |
| `VrtxOmega/Ollama-Omega` | Official Ollama MCP. |
| `ollama/ollama-mcp` (if exists) | Official — verify. |

Use only if you want to **delegate** cheap tasks (summarization, drafts)
to a local model.

### Cloud providers

| Server | Provider |
|---|---|
| `mcp-openai` (community) | OpenAI. |
| `mcp-anthropic` (community) | Anthropic API (other than the one the agent uses). |
| `mcp-gemini` (community) | Google Gemini. |
| `mcp-mistral` (community) | Mistral. |
| `mcp-cohere` (community) | Cohere. |
| `mcp-replicate` (community) | Replicate. |
| `mcp-together` (community) | Together. |
| `mcp-groq` (community) | Groq. |
| `mcp-perplexity` (community) | Perplexity. |
| `mcp-huggingface` (community) | HuggingFace. |
| `mcp-deepseek` (community) | DeepSeek. |
| `mcp-xai` (community) | xAI Grok. |
| `mcp-anthropic` (alt) | Anthropic. |

**Caveat**: in mcp-vertex, you already have a configured model via f00067
(multi-model orchestrator). These MCPs are useful only if you want the
agent to **call a different model than its own** for a specific subtask.

## Data science platforms

| Server | Vendor |
|---|---|
| `mcp-jupyter` | Jupyter notebooks. |
| `jjsantos01/jupyter-notebook-mcp` | Same. |
| `datalayer/jupyter-mcp-server` | Same. |
| `mcp-kaggle` | Kaggle datasets. |
| `pramod/kaggle-mcp-server` | Same. |
| `mcp-exploratory-data-analysis` | EDA workflows. |

## ML frameworks

| Server | Notes |
|---|---|
| `mcp-pytorch` | PyTorch model inspection. |
| `mcp-tensorflow` | Same. |
| `mcp-jax` | Same. |
| `mcp-sklearn` | scikit-learn. |
| `mcp-huggingface` | HuggingFace model + dataset search. |
| `mcp-langchain` | LangChain. |
| `mcp-llamaindex` | LlamaIndex. |

These are mostly **read-only** model inspectors (load a model, get its
metadata). Useful when you want the agent to verify a model's existence or
download something.

## Vector databases

See [`databases.md`](./databases.md) — Chroma, Qdrant, Pinecone, Weaviate,
Milvus.

## Embeddings & RAG

| Server | Notes |
|---|---|
| `mcp-ragas` | RAG evaluation. |
| `mcp-langsmith` | LangSmith tracing. |
| `mcp-langfuse` | Langfuse tracing. |
| `mcp-label-studio` | Data labeling. |
| `mcp-argilla` | Same. |
| `mcp-arize-phoenix` | Phoenix observability for ML. |

## Workflow orchestration

| Server | Vendor |
|---|---|
| `mcp-airflow` | Apache Airflow. |
| `mcp-prefect` | Prefect. |
| `mcp-dagster` | Dagster. |
| `mcp-kedro` | Kedro. |
| `mcp-mlflow` | MLflow. |
| `mcp-dbt` | dbt. |
| `mcp-spark` | Apache Spark. |
| `mcp-ray` | Ray. |
| `mcp-dask` | Dask. |
| `mcp-pandas` | pandas (no real server, just a wrapper). |
| `mcp-polars` | polars. |
| `mcp-sklearn` | scikit-learn. |

## What f00068 needs to update

The 🟡 discoverable tier has AI/ML/Data as one of its 9 categories. The
list above (~35 servers) is the realistic universe. Don't promote any to
the curated tier unless the workspace explicitly does ML/data work.

**Drop** any server that's purely a model bridge to a model the agent
already uses (those add nothing — the agent already calls itself).