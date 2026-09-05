# Pipeline CI/CD do Limiar OS

Este documento descreve os gates executados em pull requests, a publicacao da
imagem aprovada e o deploy na VM Linux de producao.

## Objetivos

- impedir arquivos locais, gerados ou sensiveis no Git;
- detectar cruzamentos indevidos entre camadas;
- validar backend e migrations em PostgreSQL real;
- validar dominio canonico, testes, tipos e build frontend;
- instalar dependencias Python e npm de forma reproduzivel;
- analisar dependencias e codigo para vulnerabilidades;
- testar a mesma imagem que sera publicada;
- publicar por digest imutavel e atestar sua procedencia;
- exigir aprovacao antes do deploy e manter um caminho de rollback.

## Eventos

`.github/workflows/ci.yml` executa em todo pull request para `main` e em todo
push na `main`. Runs antigos de um mesmo PR sao cancelados; runs da `main` nao
sao cancelados porque podem conter um deploy em andamento.

`.github/workflows/security.yml` executa CodeQL em pull requests, pushes na
`main` e semanalmente.

## Reprodutibilidade

As dependencias diretas ficam em `requirements.in` e `requirements-dev.in`. Os
arquivos `requirements.txt` e `requirements-dev.txt` sao locks completos,
gerados em Python 3.13 com hashes obrigatorios.

Para atualizar os locks no mesmo Linux usado em producao:

```bash
./scripts/compile-python-locks.sh
```

O gate de higiene regenera os dois arquivos e exige diff vazio. Resolver no
macOS nao e equivalente: dependencias condicionais de plataforma podem sumir
do lock Linux.

Actions usam SHAs completos e imagens Docker usam digests. Os comentarios de
versao continuam permitindo que o Dependabot proponha atualizacoes legiveis.

## Gate 1 — Repository hygiene

O job recusa paths de assistentes, `.env`, bancos, dependencias instaladas,
artefatos gerados, caches, arquivos acima de 10 MiB, paths rastreados e
ignorados, marcadores de conflito e whitespace invalido.

```bash
python3 scripts/check-repository-hygiene.py
git diff --check
```

## Gate 2 — Dependency review

Em pull requests, o GitHub compara o grafo de dependencias e bloqueia novas
vulnerabilidades de severidade moderada ou superior. Dependabot continua
abrindo PRs semanais para Actions, npm, pip e Docker.

## Gate 3 — Backend

O job usa Python 3.13 e PostgreSQL 18.4:

1. instala o lock com `--require-hashes` e roda `pip check`;
2. prova `alembic upgrade head` em banco vazio;
3. verifica fronteiras arquiteturais;
4. impede crescimento da baseline Ruff;
5. executa os 127 testes sem skips;
6. coleta cobertura de todo `backend/` e publica o JSON por sete dias.

O primeiro run com cobertura estabelece o valor real. Um piso bloqueante deve
ser adicionado depois de revisar esse resultado, nunca estimado.

```bash
./scripts/test-backend-postgres.sh
python3 scripts/check-architecture.py
python3 scripts/ruff-baseline.py
```

## Gate 4 — Frontend e dominio canonico

O job instala `frontend/package-lock.json`, verifica catalogos canonicos, roda a
suite Vitest com os pisos de cobertura, executa TypeScript strict e constroi as
tres entradas Vite. `test:coverage` ja executa a suite inteira; ela nao e
duplicada com `npm test` na CI.

```bash
cd frontend
npm ci
npm run test:catalog
npm run test:coverage
npm run typecheck
npm run build
```

## Gate 5 — Container build and smoke

Somente depois dos gates anteriores, a CI:

1. constroi a imagem multi-stage com bases fixadas por digest;
2. inicia PostgreSQL em rede isolada;
3. inicia a aplicacao como usuario nao-root;
4. aguarda `/api/health`, que consulta PostgreSQL;
5. verifica `/`, `/login.html` e `/campaign-map.html`;
6. sempre publica logs e remove os containers temporarios.

Em pull requests o fluxo termina aqui. Em push na `main`, o mesmo job autentica
no GHCR somente depois do smoke, publica exatamente a imagem testada com a tag
do commit e `main`, resolve o digest e gera uma atestacao de procedencia.

## Gate 6 — CodeQL

O workflow de seguranca analisa Python e JavaScript/TypeScript. Os resultados
aparecem na aba Security e nos checks do pull request.

## Deploy de producao

O job `Deploy · Proxmox VM` recebe do job de container uma referencia
`ghcr.io/...@sha256:...`; referencias mutaveis sao rejeitadas. O job usa o
ambiente protegido `production`, copia os manifests por SSH com host key
estrita e executa o runbook documentado em
[Deploy em VM Proxmox](DEPLOY-PROXMOX-VM.md).

## Protecao obrigatoria da main

O ruleset deve:

1. exigir pull request;
2. exigir branch atualizada;
3. exigir os checks:
   - `Repository hygiene`;
   - `Dependency review`;
   - `Backend · Python 3.13 · PostgreSQL 18`;
   - `Frontend · Node 22`;
   - `Container build and smoke`;
   - `CodeQL · python`;
   - `CodeQL · javascript-typescript`;
4. bloquear force-push e exclusao;
5. exigir resolucao de conversas;
6. usar squash merge;
7. apagar branches integradas automaticamente.

Em um projeto com apenas um mantenedor, exigir PR e checks sem aprovacao externa
evita bloquear todo merge. Ao adicionar outro mantenedor, passe a exigir uma
aprovacao e descarte aprovacoes antigas quando novos commits forem enviados.

## Diagnostico

### Lock Python falhou

Altere o arquivo `.in`, regenere ambos os locks em Python 3.13 e versione a
intencao e o resultado juntos. Nao edite pins transitivos manualmente.

### Backend falhou antes dos testes

Se Alembic falhar, o schema nao nasce do zero. Corrija a migration; nao prepare
o banco manualmente no workflow.

### Catalog audit alterou o working tree

O catalogo e o relatorio divergiram. Revise e versione o relatorio correto com
a mudanca canonica.

### Coverage falhou

Adicione testes que exercitem o comportamento novo. Abaixar um piso exige uma
decisao explicita e justificativa no pull request.

### Smoke falhou

Consulte os logs de app e PostgreSQL anexados ao job. Um `docker build` isolado
nao prova startup, migrations, static files ou banco.

### Deploy falhou

O workflow mantem o backup pre-migration e tenta restaurar a imagem anterior se
o health check interno falhar. Consulte o job, os logs na VM e o runbook antes
de tentar novamente. Nunca restaure banco automaticamente.
