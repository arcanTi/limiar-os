# Saude do repositorio — 2026-09-05

## Nota atual: 9,0 / 10

O repositorio esta operacional, testavel e com uma arquitetura reconhecivel.
Desde a revisao anterior (2026-08-06) as duas dividas P0 que a propria tabela
apontava foram fechadas — estado compartilhado escopado por campanha e escrita
com revisao otimista — e a suite quase dobrou de tamanho sem perder o gate de
zero skips. A nota nao e maior porque o bundle principal voltou a passar de
500 KB, os pisos de cobertura do CI ficaram oito pontos abaixo do valor real
medido (deixaram de barrar regressao) e a UI continua concentrada.

| Area | Nota | Evidencia |
| --- | ---: | --- |
| Build e entrega | 9,0 | Tres entradas Vite, artefatos ignorados e Docker multi-stage; chunk principal em 503 KB dispara o aviso de 500 KB |
| Testes | 9,2 | 1223 testes frontend em 88 arquivos; 194 backend em PostgreSQL 18.4 com zero skips |
| Arquitetura | 9,5 | HTTP/WebSocket sobre servicos/ports, adapters por agregado, event log, escopo por campanha e revisao otimista |
| Manutenibilidade | 8,0 | Dominio em 87% de linhas cobertas, mas `Component.js` (2.110 linhas) e `views/combat.js` (2.501) seguem concentrados |
| Higiene | 8,8 | Gates de higiene, arquitetura, Ruff e catalogo passam; `backend/api/` e `backend/services/` ficaram como pacotes vazios |
| Observabilidade de qualidade | 7,0 | Cobertura e Ruff bloqueiam regressao, mas os pisos sao de 2026-07-28 e hoje sobra folga de 8 pontos |

## Evidencia desta revisao

Medida em 2026-09-05, no branch `codex/feat/campaign-scope`.

- 88 arquivos e **1223 testes Vitest** passaram (`npm run test:coverage`).
- Cobertura global: **65,02% linhas**, 56,28% statements, 51,96% branches e
  52,38% funcoes — contra 57,54 / 48,13 / 46,67 / 44,62 em 2026-08-06.
- Cobertura por camada (linhas): `domain/` 87,0%, `application/` 83,1%,
  `infrastructure/` 61,1%, `ui/` 52,4%, `pages/` 38,1%, `framework/` 11,0%.
- `tsc --noEmit` passou, com `noUnusedLocals` e `noUnusedParameters`.
- **194 testes backend** passaram em PostgreSQL 18.4 (`postgres:18.4-trixie`,
  `scripts/test-backend-postgres.sh`) com o gate de zero skips.
- O build Vite gerou `index.html`, `login.html` e `campaign-map.html`; chunks:
  `index` 503,43 KB (gzip 144,05), `domain` 232,65 KB (gzip 73,75), `nexus`
  34,67 KB, `campaign-map` 67,81 KB, CSS principal 113,83 KB.
- `check-architecture.py`, `check-repository-hygiene.py`, `ruff-baseline.py`
  (estavel em 239 achados) e `verify-domain-catalogs.sh` (217 casos PASS)
  passaram; `git diff --check` limpo.
- O schema e propriedade do Alembic: `init_db()` roda `upgrade head` antes de
  semear, e as revisoes vao de `0001` a `0008`.
- Estado compartilhado por campanha: `chat_messages.campaign_id` e
  `campaign_settings(campaign_id, key)`; todas as rotas de estado ficam sob
  `/api/campaigns/{campaign_id}/...`; `test_campaign_scope.py` prova que chat,
  estado e eventos nao cruzam campanhas.
- Escrita concorrente: `campaign_settings` e `characters` so gravam com
  `expectedRevision` (compare-and-swap num UPDATE unico) e devolvem 409
  `REVISION_CONFLICT`; o cliente recarrega e reaplica o patch
  (`Component.js:1344`), coberto por `test_optimistic_revisions.py` e
  `test/unit/api/revisions.test.ts`.
- Login e um token de acesso de 6 caracteres com limite de 10/min por IP e
  60/min global; nao ha mais provedor externo de identidade.

## Divida que impede nota maior

1. **Pisos de cobertura desatualizados.** `vite.config.js` ainda exige lines 57
   / statements 47 / branches 46 / functions 44, os valores reais de
   2026-07-28. Com 65,02% medidos hoje, uma queda de oito pontos passa no CI.
   Subir o piso para o valor atual arredondado para baixo e trabalho de uma
   linha e devolve a funcao do gate.
2. **Cobertura de borda.** `framework/` em 11,0% de linhas e `pages/` em 38,1%
   seguem sendo o piso do numero global; `ui/` esta em 52,4%.
3. **Bundle.** O chunk `index` esta em 503 KB (gzip 144 KB) e dispara o aviso
   de 500 KB do Vite. `manualChunks` ja separa `domain` e `nexus`; falta
   modularizar os scripts 3D legados e carregar superficies sob demanda.
4. **Ruff.** Baseline congelada em 239 achados; nada novo entra, mas a reducao
   incremental nao comecou.
5. **UI concentrada.** `Component.js` tem 2.110 linhas e `ui/views/combat.js`
   2.501; `index.html` mantem 806 atributos `style=` inline.
6. **Ports da Mesa.** `application/campaign_maps.py` ainda usa `Any` e
   `__getattr__` em vez de um port explicito por agregado.
7. **DTOs.** `backend/schemas.py` tem 7 modelos Pydantic; 25 assinaturas de
   rota continuam em `dict[str, object]`.
8. **Pacotes mortos.** `backend/api/` e `backend/services/` contem apenas um
   `__init__.py` e nao sao importados por ninguem.
9. **Upload.** `AssetService` valida tamanho e allowlist de MIME, mas confia no
   `Content-Type` declarado pelo cliente: nao ha checagem de magic bytes, cota
   por usuario nem coleta de asset orfao.
