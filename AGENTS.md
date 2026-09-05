# Regras operacionais para agentes e controladores

Este arquivo se aplica a todo o repositório. Ele orienta agentes de código,
assistentes, automações interativas e qualquer controlador capaz de alterar
arquivos, Git, GitHub, infraestrutura ou serviços externos.

O pedido atual do usuário define o objetivo. Estas regras definem como executar
esse objetivo com segurança. Se uma autorização estiver ambígua ou duas regras
entrarem em conflito, interrompa a ação persistente e peça confirmação.

## Antes de alterar o projeto

1. Leia `README.md` e `CONTRIBUTING.md`.
2. Consulte `docs/DDD-DOMINIO-LIMPO.md` e `docs/ARQUITETURA-C4.md` antes de
   alterar regras de domínio, casos de uso ou fronteiras arquiteturais.
3. Consulte `docs/CI-PIPELINE.md` antes de alterar dependências, workflows,
   qualidade, empacotamento ou deploy.
4. Execute `git status --short --branch` e preserve todas as mudanças existentes
   que não pertencem ao pedido atual.
5. Restrinja a mudança ao objetivo solicitado. Não inclua refatorações,
   atualizações ou limpezas incidentais sem aprovação.

## Ações locais permitidas

Quando necessárias para atender ao pedido atual, o agente pode:

- ler e pesquisar arquivos;
- inspecionar histórico, branches, status e diffs do Git;
- editar somente arquivos dentro do escopo solicitado;
- executar testes, linters, builds, auditorias e verificações de segurança;
- criar recursos temporários descartáveis para validação;
- relatar problemas e propor mudanças sem aplicá-las.

Essas permissões não autorizam automaticamente ações persistentes no Git,
GitHub, ambiente de produção ou serviços externos.

## Ações que exigem autorização explícita

Não execute nenhuma das ações abaixo sem autorização inequívoca do usuário no
pedido atual ou em um fluxo ainda em andamento que as tenha aprovado:

- criar, alterar, emendar ou apagar commits e tags;
- fazer push, force-push ou alterar remotes;
- criar, renomear ou apagar branches locais ou remotas;
- abrir, fechar, editar, aprovar ou fazer merge de pull requests;
- publicar pacotes, imagens, releases ou artefatos;
- iniciar deploy, rollback, migrations ou operações em produção;
- criar ou alterar secrets, environments, rulesets e configurações do GitHub;
- enviar mensagens, issues, comentários ou dados para serviços externos.

Uma solicitação para editar ou corrigir código não implica autorização para
commit, push, PR, merge ou deploy. Prepare e valide a mudança; depois informe o
estado do worktree e aguarde instrução quando essas ações não tiverem sido
pedidas expressamente.

## Política de Git

- Nunca trabalhe diretamente na `main`. Use a branch indicada pelo usuário ou
  crie uma branch somente quando houver autorização para isso.
- Nunca reescreva a `main`, faça force-push ou apague refs protegidas.
- Não use `git reset --hard`, `git clean -fd`, `git checkout --`, comandos
  recursivos destrutivos ou equivalentes para descartar mudanças.
- Não sobrescreva trabalho não relacionado. Um worktree sujo pertence ao
  usuário até prova em contrário.
- Antes de um commit autorizado, revise `git status`, `git diff --check`, o diff
  completo e a lista exata de arquivos staged.
- Commits autorizados devem ser focados, usar Conventional Commits e passar
  pelos hooks. Nunca use `--no-verify`.
- Não faça amend, rebase, squash manual, cherry-pick ou alteração de histórico
  sem pedido explícito.
- O merge na `main` ocorre somente por pull request e pelo método squash
  permitido pelo ruleset.

## CI, qualidade e segurança

As verificações são políticas do projeto, não obstáculos a serem contornados.

- Nunca desative jobs, testes, hooks, CodeQL, Dependency Review ou verificações
  de higiene para obter um resultado verde.
- Nunca adicione `continue-on-error`, filtros, skips ou exclusões com a intenção
  de esconder uma falha.
- Não reduza pisos de cobertura nem aumente a baseline Ruff para acomodar uma
  regressão. Uma alteração deliberada dessas políticas exige decisão explícita,
  justificativa e revisão.
- Não enfraqueça `scripts/check-architecture.py` ou testes arquiteturais para
  permitir dependências proibidas. Corrija a direção da dependência.
- Não edite pins transitivos em `requirements.txt` ou
  `requirements-dev.txt`. Altere os arquivos `.in` e execute
  `./scripts/compile-python-locks.sh`.
- Preserve hashes de dependências e pins por SHA ou digest usados nos workflows
  e imagens. Atualizações precisam de validação equivalente.
- Não faça deploy de tag mutável. Produção recebe somente a imagem por digest
  aprovada pelo job de container.
- Uma falha existente deve ser diagnosticada e informada; não mascarada.

## DDD e domínio limpo

- O domínio não importa FastAPI, PostgreSQL, HTTP, filesystem ou UI.
- A aplicação coordena casos de uso e depende de portas e do domínio.
- Infraestrutura e adapters implementam portas e isolam integrações.
- Routers traduzem HTTP; não concentram regras de negócio ou persistência.
- No frontend, `domain` não depende de `application`, `infrastructure`, `ui` ou
  `pages`.
- Mudanças de regra devem usar o vocabulário do domínio e incluir testes de
  exemplos, invariantes e falhas relevantes.

## Testes manuais na aplicação

- Teste exploratório na UI roda em `./run-test.sh` (porta 8766, banco tmpfs,
  uploads em `tmp/livetest-uploads/`), nunca em `./run-local.sh`.
- `run-local.sh` serve o banco de desenvolvimento real: fichas, campanhas e
  fotos criadas ali sobrevivem ao teste e aparecem para os jogadores.
- Se um teste precisar do banco de desenvolvimento, diga isso antes e limpe as
  linhas criadas ao terminar.

## Segredos, dados e artefatos

- Nunca leia, imprima, versione ou transmita secrets além do estritamente
  necessário para uma operação explicitamente autorizada.
- Não versione `.env`, bancos, uploads, tokens, chaves, logs privados,
  dependências instaladas, caches, cobertura ou artefatos de build.
- Não introduza `CLAUDE.md`, `.claude/`, transcrições, comentários de agentes ou
  arquivos específicos de outro controlador sem solicitação explícita.
- Não altere este `AGENTS.md` nem as políticas da pipeline apenas para liberar
  uma mudança em andamento. Mudanças de governança exigem pedido explícito.

## Validação e entrega

Use os comandos definidos em `CONTRIBUTING.md` e os gates descritos em
`docs/CI-PIPELINE.md`. A validação deve ser proporcional ao risco e incluir, no
mínimo, as verificações diretamente afetadas pela mudança.

Ao concluir:

1. informe os arquivos alterados e o efeito da mudança;
2. liste os comandos executados e seus resultados;
3. declare claramente testes não executados ou riscos restantes;
4. informe se há mudanças não commitadas;
5. não transforme uma entrega local em commit, push, PR, merge ou deploy sem a
   autorização exigida acima.
