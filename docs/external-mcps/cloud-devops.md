# Cloud & DevOps — AWS, GCP, Azure, Kubernetes, Terraform, CI

> For any of these, **only wire up the servers you actually use**. Each one
> is a real subprocess that may require auth tokens; don't accumulate
> declarations "just in case". Use `detect` rules so they only mount when
> the project needs them.

## AWS

| Server | Maintainer | Notes |
|---|---|---|
| `awslabs/mcp` | AWS Labs | **Wire if you use AWS.** Multi-server, covers dozens of services (S3, DynamoDB, Lambda, Bedrock, etc.). |
| `alexei-led/aws-mcp-server` | Community | Lighter-weight alternative. |
| `mcp-server-aws-sso` ([aashari](https://github.com/aashari/mcp-server-aws-sso)) | AWS SSO specifically. |
| `aashari/mcp-server-aws-sso` | Community | SSO login. |

**Important caveat**: `awslabs/mcp` is actually a collection of multiple
servers. The catalog lists them as one entry; in practice you instantiate the
specific servers you need (`mcp-server-aws-s3`, `mcp-server-aws-dynamodb`,
`mcp-server-aws-lambda`, `mcp-server-aws-bedrock`, etc.). The npm package
`@awslabs/mcp-server-*` namespace has ~50+ variants.

## GCP

| Server | Maintainer | Notes |
|---|---|---|
| `mcp-gcp` (community) | Community | Generic GCP. |
| (no official Anthropic one) | — | — |

There is no "official Google" GCP MCP server. Several AWS Labs contributors
have started `awslabs/mcp` analogues for GCP but the ecosystem is thin.
For most GCP workspaces, **`mcp-language-server` for code + `context7` for
docs + native bash + `gcloud` CLI via subprocess** is enough.

## Azure

| Server | Maintainer | Notes |
|---|---|---|
| `jdubois/azure-cli-mcp` | Community | Wraps `az` CLI. |
| `hardik-id/azure-resource-graph-mcp-server` | Community | Azure Resource Graph queries. |
| `Infrawise/mcp-server` | Community | Azure FinOps. |
| `AletaIndex/aletaindex-fin-narratives` (cross-cloud) | Community | Multi-cloud narratives. |
| `cloudscope-mcp` ([alexpota](https://github.com/alexpota/cloudscope-mcp)) | Community | Azure cost management. |

## Kubernetes

| Server | Maintainer | Notes |
|---|---|---|
| `@modelcontextprotocol/server-kubernetes` (Anthropic community) | Anthropic | **Wire if you use k8s.** |
| `Flux159/mcp-server-kubernetes` | Community | TypeScript implementation. |
| `rohitg00/kubectl-mcp-server` | Community | kubectl via MCP. |
| `manusa/Kubernetes MCP Server` | Community | OpenShift + Kubernetes. |
| `alexei-led/k8s-mcp-server` | Community | Lightweight. |
| `mrostamii/rancher-mcp-server` | Community | Rancher. |
| `cyclops-ui/mcp-cyclops` | Community | Cyclops abstraction over k8s. |
| `antonio-mello-ai/mcp-proxmox` | Community | Proxmox. |
| `Portainer/portainer-mcp` | Community | Portainer. |
| `StacklokLabs/mkp` | Community | Lightweight k8s MCP. |
| `antonio-mello-ai/mcp-pfsense` | Community | pfSense firewalls. |
| `Matita-Koda/mcp-terraform` | Community | Terraform. |

## Terraform / IaC

| Server | Maintainer | Notes |
|---|---|---|
| `hashicorp/terraform-mcp-server` (official HashiCorp) | HashiCorp | **Wire if you use Terraform.** |
| `nwiizo/tfmcp` | Community | Rust implementation. |
| `pulumi/mcp-server` (official Pulumi) | Pulumi | **Wire if you use Pulumi.** |

## Docker

| Server | Maintainer | Notes |
|---|---|---|
| `mcp-server-docker` ([ckreiling](https://github.com/ckreiling/mcp-server-docker)) | Community | **Wire if you use Docker.** ~100k+ weekly visitors. |
| `docker/hub-mcp` (official Docker Hub) | Docker | Hub access (repos, search, hardened images). |
| `ofershap/mcp-server-docker` | Community | Alternative. |
| `friendlygeorge/docker-mcp-server` | Community | Container ops + auto-restart. |

## CI/CD

| Server | CI | Notes |
|---|---|---|
| `github/github-mcp-server` (official) | GitHub Actions | The most popular CI MCP. |
| `CircleCI/mcp-server-circleci` (official) | CircleCI | ~149k weekly visitors (npm). |
| `buildkite/buildkite-mcp-server` (official) | Buildkite | |
| `bitrise-io/bitrise-mcp` (official) | Bitrise | |
| `Daghis/teamcity-mcp` | Community | JetBrains TeamCity. |
| `avisangle/jenkins-mcp-server` | Community | Jenkins. |
| `imatza-rh/mcp-zuul` | Community | Zuul CI. |
| `currents-dev/currents-mcp` (official) | Currents | Playwright test results. |

## Cloudflare / Vercel / Netlify / Fly / Render / Railway / Heroku

| Server | Maintainer | Notes |
|---|---|---|
| `cloudflare/mcp-server-cloudflare` (official) | Cloudflare | Workers, KV, R2, D1. |
| `ofershap/mcp-server-cloudflare` | Community | Alt. |
| `mcp-vercel` | Community | Vercel. |
| `mcp-netlify` | Community | Netlify. |
| `mcp-fly` | Community | Fly.io. |
| `mcp-render` | Community | Render. |
| `mcp-railway` | Community | Railway. |
| `mcp-heroku` | Community | Heroku. |

## Observability

See [`observability.md`](./observability.md) for the dedicated file.

## What f00068 needs to update

The original ⭐ curated tier had `mcp-aws` and `kubernetes` as generic names.
These should be:

- `awslabs/mcp` → keep, but document that it's a meta-package of multiple
  servers; user must declare the specific sub-servers they want.
- `kubernetes` → `@modelcontextprotocol/server-kubernetes` (note the
  `@modelcontextprotocol/` prefix).
- Add `terraform-mcp-server` and `pulumi/mcp-server` if the workspace uses
  Terraform/Pulumi.

The 🟡 discoverable tier should keep all the rest with the standard "may be
stale" warning.