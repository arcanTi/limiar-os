# Como contribuir com o Limiar OS

Obrigado por dedicar tempo ao projeto. Contribuições podem assumir a forma de
código, testes, documentação, relatos de defeito, propostas de domínio ou
melhorias na experiência de jogo.

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
Vulnerabilidades devem seguir a [Política de Segurança](SECURITY.md), nunca uma
issue pública.

## Antes de começar

1. Procure uma issue existente antes de abrir outra.
2. Para mudanças relevantes de comportamento ou de domínio, abra uma proposta
   antes de investir em uma implementação extensa.
3. Mantenha cada contribuição focada em um problema verificável.
4. Não inclua segredos, bancos locais, uploads, dependências instaladas ou
   artefatos gerados.

## Ambiente de desenvolvimento

O projeto usa Python 3.13, Node.js 22 e PostgreSQL 18. Docker é a forma
recomendada de executar o banco de testes.

Instale as dependências:

```bash
python3 -m pip install -r requirements-dev.txt
cd frontend
npm ci
cd ..
```

Para iniciar a aplicação completa:

```bash
docker compose up --build
```

## Arquitetura e domínio

O Limiar OS segue DDD e arquitetura em camadas. A direção das dependências é
uma regra do projeto:

- o domínio não depende de framework, banco, HTTP ou interface;
- a aplicação coordena casos de uso e depende de portas e do domínio;
- adapters implementam portas e isolam PostgreSQL, FastAPI e integrações;
- routers traduzem HTTP e não executam persistência diretamente;
- no frontend, `domain` não importa `application`, `infrastructure`, `ui` ou
  `pages`;
- regras do jogo pertencem ao domínio; renderização, eventos do navegador e
  transporte pertencem às camadas externas.

Consulte [DDD e Domínio Limpo](docs/DDD-DOMINIO-LIMPO.md) e a
[Arquitetura C4](docs/ARQUITETURA-C4.md) antes de alterar fronteiras. Uma mudança
de regra deve incluir exemplos de domínio e testes que expressem o vocabulário
do jogo.

## Branches e commits

Crie uma branch curta a partir da `main` atualizada. Nomes como
`feature/area-attack`, `fix/session-expiry` e `docs/combat-rules` deixam a
intenção explícita.

Prefira commits pequenos e descritivos no formato Conventional Commits:

```text
feat(combat): resolve armor ablation
fix(auth): reject expired sessions
docs(domain): describe campaign aggregate
test(map): cover stale scene revision
```

## Validação local

Execute os gates relacionados à mudança antes de abrir o pull request.

Backend completo, com PostgreSQL e zero testes ignorados:

```bash
./scripts/test-backend-postgres.sh
```

Frontend:

```bash
cd frontend
npm test
npm run test:coverage
npm run typecheck
npm run build
```

Catálogos e regras canônicas:

```bash
sh scripts/verify-domain-catalogs.sh
```

Arquitetura, qualidade Python e higiene:

```bash
python3 scripts/check-architecture.py
python3 scripts/ruff-baseline.py
python3 scripts/check-repository-hygiene.py
git diff --check
```

A descrição completa dos gates está em
[Pipeline de Pull Request](docs/CI-PIPELINE.md).

## Pull requests

Um pull request deve:

- explicar o problema e o resultado, não apenas listar arquivos alterados;
- indicar se há mudança em regra de domínio, contrato HTTP, persistência ou UI;
- incluir testes proporcionais ao risco;
- documentar migrações, incompatibilidades e decisões relevantes;
- manter a CI verde e resolver comentários de revisão;
- evitar refatorações não relacionadas ao objetivo declarado.

Pull requests podem ser mantidos como rascunho enquanto ainda não estiverem
prontos para revisão. O merge depende de revisão e dos gates definidos para a
`main`.

## Licença das contribuições

Ao enviar uma contribuição, você concorda que ela seja disponibilizada sob a
[Licença MIT](LICENSE). Componentes de terceiros continuam sujeitos às licenças
presentes em seus próprios diretórios.
