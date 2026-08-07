# Pipeline de pull request do Limiar OS

Este documento descreve os gates executados para cada pull request e para
pushes nas branches protegidas. A pipeline foi desenhada para reproduzir o
ambiente de producao: Python 3.13, Node.js 22 e PostgreSQL 18.

## Objetivos

- impedir que arquivos locais, gerados ou sensiveis entrem no Git;
- detectar cruzamentos indevidos entre camadas;
- validar backend e migrations em PostgreSQL real;
- validar regras canonicas, testes, tipos e build frontend;
- construir a mesma imagem usada em producao;
- iniciar a imagem e provar as superficies HTTP principais;
- cancelar execucoes antigas quando um novo commit chega ao mesmo PR.

## Quando a CI executa

O workflow `.github/workflows/ci.yml` executa em:

- todo `pull_request`;
- push em `main`;
- push em `codex/clean-foundation` durante a troca da fundacao Git.

Depois que a branch limpa se tornar a branch principal, o trigger temporario de
`codex/clean-foundation` pode ser removido.

## Gate 1 — Repository hygiene

O job mais curto roda primeiro e falha quando encontra:

- paths do Claude ou de outros assistentes;
- `.env` real;
- banco local ou backup de banco;
- `node_modules`, `dist`, `uploads` ou `graphify-out` versionados;
- bytecode/cache;
- arquivos maiores que 10 MiB;
- arquivo simultaneamente rastreado e ignorado;
- marcadores de conflito;
- whitespace invalido detectado por `git diff --check`.

Comando local:

```bash
python3 scripts/check-repository-hygiene.py
git diff --check
```

O `.claude/` permanece no `.gitignore` como barreira preventiva. O diretorio e
seu conteudo nao pertencem ao produto e o gate recusa qualquer path desse tipo
que seja rastreado.

## Gate 2 — Backend

O GitHub Actions cria um PostgreSQL 18.4 vazio e instala as dependencias em
Python 3.13.

Ordem:

1. `alembic upgrade head` prova uma instalacao vazia;
2. `scripts/check-architecture.py` verifica a direcao das dependencias;
3. `scripts/ruff-baseline.py` impede crescimento da divida Ruff;
4. pytest executa toda a suite backend;
5. `LIMIAR_FAIL_ON_SKIP=1` transforma qualquer skip em falha.

Comando local equivalente, usando o container PostgreSQL de teste:

```bash
./scripts/test-backend-postgres.sh
python3 scripts/check-architecture.py
python3 scripts/ruff-baseline.py
```

## Gate 3 — Frontend e dominio canonico

O job usa Node.js 22 e instala exatamente `frontend/package-lock.json` com
`npm ci`.

Ordem:

1. auditoria deterministica do catalogo;
2. verificadores de armas, cyberware, efeitos, criticos, combate, REDmas e
   homebrew;
3. Vitest;
4. cobertura com os pisos atuais;
5. TypeScript strict;
6. build Vite das tres entradas;
7. upload do resumo de cobertura por sete dias.

Comando local:

```bash
cd frontend
npm ci
npm run test:catalog
npm test
npm run test:coverage
npm run typecheck
npm run build
```

Os verificadores de catalogo sao executados por `tsx`, fixado no lockfile. Isso
permite importar os modulos TypeScript atuais e respeitar o alias `@seed`, sem
manter copias `.js` aposentadas.

## Gate 4 — Container build and smoke

Este job so inicia depois de hygiene, backend e frontend passarem.

Etapas:

1. construir `Dockerfile` multi-stage;
2. criar uma rede Docker isolada;
3. iniciar PostgreSQL 18.4;
4. aguardar `pg_isready`;
5. iniciar a imagem do Limiar OS;
6. aguardar `/api/health`;
7. verificar `/`, `/login.html` e `/campaign-map.html`;
8. publicar logs no job mesmo em falha;
9. remover containers e rede em qualquer resultado.

Esse gate prova em conjunto:

- build frontend dentro do Docker;
- instalacao das dependencias Python;
- migrations no startup;
- criacao do usuario inicial;
- conexao real com PostgreSQL;
- configuracao de static files;
- processo rodando como usuario nao-root.

## Dependencias

`.github/dependabot.yml` abre PRs semanais separados para:

- GitHub Actions;
- npm;
- pip;
- Docker.

Esses PRs passam pelos mesmos quatro gates. Alertas novos nao alteram
silenciosamente as versoes do projeto.

## Protecao recomendada da branch principal

Depois da fundacao limpa ser publicada:

1. exigir pull request;
2. exigir os checks `Repository hygiene`, `Backend`, `Frontend` e
   `Container build and smoke`;
3. exigir branch atualizada antes do merge;
4. bloquear force-push;
5. bloquear exclusao da branch principal;
6. usar squash merge;
7. exigir resolucao de conversas;
8. apagar branches integradas automaticamente.

## Particularidade da branch sem historico

`codex/clean-foundation` possui um commit-raiz sem parent. Por isso ela nao pode
ser integrada ao `main` historico por merge normal sem reintroduzir o historico
antigo como outro parent.

O corte deve seguir uma destas operacoes administrativas:

1. tornar `codex/clean-foundation` a nova branch default; ou
2. substituir `main` pela branch limpa com force-push deliberado.

A segunda opcao exige autorizacao explicita, aviso a todos os clones e nova
configuracao das protecoes. Ate essa decisao, o workflow valida pushes na branch
limpa sem tocar no `origin/main`.

## Diagnostico de falhas

### Hygiene falhou

Execute o script local e remova o path apontado do indice. Nao adicione uma
excecao sem documentar por que o arquivo faz parte do produto.

### Backend falhou antes dos testes

Se Alembic falhar, o schema nao pode ser criado do zero. Corrija a migration;
nao prepare o banco manualmente no workflow.

### Catalog audit alterou o working tree

O catalogo e o relatorio estao divergentes. Revise a mudanca gerada e versione
o relatorio correto junto da alteracao canonica.

### Coverage falhou

Uma alteracao reduziu um dos pisos globais. Adicione testes que exercitem o
novo comportamento. Abaixar o piso requer decisao arquitetural explicita.

### Smoke falhou

Os logs do app e do PostgreSQL aparecem sempre no final do job. Reproduza com
`docker build` e `docker run`; nao considere o build isolado prova de startup.
