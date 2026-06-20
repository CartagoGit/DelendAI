---
title: Predefinições de lint e verificação de tipos por framework
plugin: rules
audience: agente que precisa aplicar regras de lint/tipo
order: 1
lang: pt
---

# Predefinições de lint e verificação de tipos por framework

O plugin `rules` responde a uma pergunta: "quais regras de lint e
verificação de tipos devo aplicar a este projeto, este arquivo, esta
pasta?" A resposta é derivada do **framework** que o projeto usa e de
**qual área do projeto** um arquivo reside. A configuração do próprio
projeto sempre prevalece.

## 0. O modelo mental

Uma **área do projeto** é um diretório de nível superior com seu próprio
`package.json` (ou equivalente). Cada área recebe um framework detectado
a partir do seu `package.json` / `requirements.txt` / `Cargo.toml` /
`pubspec.yaml` / `go.mod` — o plugin fornece uma pequena biblioteca de
mapeamentos "vejo X, padrão para Y".

Uma **predefinição** é um pacote de (regras de lint, config de verificação
de tipos) para um determinado framework. O plugin tem predefinições para
`ts-eslint`, `ts-prettier`, `py-ruff`, `rs-clippy`, `go-vet`, `kt-detekt`,
… (somente os que mapeiam para ferramentas instaladas no host).

O plugin pode funcionar em três modos (definido com `--rules-mode=`):

| Modo | Comportamento |
|---|---|
| `strict` | Falha se o projeto não tem config de regras e nenhuma predefinição o cobre. |
| `mixed` (padrão) | Aplicar a predefinição se o projeto não tem config; nunca falhar. |
| `advisory` | Não escrever nada; apenas reportar o que *seria* aplicado. |

## 1. Aplicar uma predefinição a uma área do projeto

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

A resposta é uma lista de arquivos escritos + um resumo:

```json
{
  "ok": true,
  "written": [
    "apps/web/.eslintrc.json",
    "apps/web/tsconfig.strict.json"
  ],
  "preset": "ts-eslint+ts-prettier",
  "warnings": []
}
```

Se o projeto já tem um `.eslintrc.json`, o plugin o deixa em paz e
reporta `preset: "user-override"`. A config do projeto **sempre
prevalece** — esse é o contrato.

## 2. Listar as predefinições disponíveis

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Retorna o nome da predefinição, os arquivos que escreveria e um link
para a config upstream de que herda. A lista é o que o host tem
instalado em `node_modules` — sem fetch de rede.

## 3. Verificar o que seria aplicado (simulação)

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react",
    "dryRun": true
  }
}
```

Mesmo formato de resposta, mas o array `written` reflete o que **seria**
escrito — nada é. Use em modo advisory ou para mostrar ao usuário um
diff antes de confirmar.

## 4. Mapear um projeto às suas áreas (amigável ao CI)

`rules_resolve_map` é a ferramenta somente leitura que retorna o
mapeamento detectado área do projeto → framework → predefinição. O
plugin o armazena em cache em `.cache/mcp-vertex/rules/rules-map.json`
para que uma execução CI não re-detecte em cada invocação.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Erros frequentes

- **Dois `package.json` na mesma área** (workspace + aninhado): o plugin
  pega o mais próximo ao arquivo. Se a detecção estiver errada, passe
  `area` explicitamente.
- **Framework personalizado**: passe `framework: "<seu-nome>"` e o plugin
  não aplicará nenhuma predefinição (nenhum match no registro). A
  ferramenta responderá com `preset: "no-preset"` e um aviso.
- **Ferramenta não instalada localmente**: aplicar uma predefinição que
  requer `ruff` em uma máquina sem `ruff` terá sucesso (o plugin apenas
  escreve config), mas o `quality_run_quality` downstream falhará com
  `code: 127`. Execute `rules_check` primeiro para simular toda a cadeia.

## Próximo passo

- [Como os plugins `rules` e `quality` colaboram](#)
- [Personalizando uma predefinição sem bifurcá-la (a regra user-override)](#)
