# Saude do repositorio — 2026-08-06

## Nota atual: 8,9 / 10

O repositorio esta operacional, testavel e com uma arquitetura reconhecivel.
O fluxo de entrega agora e reproduzivel: PostgreSQL e obrigatorio no CI, skips
falham a execucao, e todo HTML/CSS/JavaScript de producao nasce do Vite no CI
e no container. A nota nao e maior porque ainda existe divida mensuravel de
cobertura, lint, tamanho de bundle e complexidade de UI.

| Area | Nota | Evidencia |
| --- | ---: | --- |
| Build e entrega | 9,2 | Tres entradas Vite, artefatos ignorados e Docker multi-stage validado |
| Testes | 8,8 | 763 testes frontend; 127 backend no PostgreSQL e zero skips no CI |
| Arquitetura | 9,5 | HTTP/WebSocket sobre servicos/ports, adapters por agregado e event log |
| Manutenibilidade | 8,0 | Ficha compartilhada, casos de uso e imports estritos; UI ainda concentrada |
| Higiene | 9,0 | Raiz coesa, gerados/tooling removidos, ignores explicitos |
| Observabilidade de qualidade | 7,0 | Cobertura e Ruff bloqueiam regressao, mas os pisos sao baixos |

## Evidencia desta revisao

- 69 arquivos e 763 testes Vitest passaram.
- Cobertura: 57,54% linhas, 48,13% statements, 46,67% branches e 44,62% funcoes.
- TypeScript passou tambem com `noUnusedLocals` e `noUnusedParameters`.
- O build Vite gerou `index.html`, `login.html` e `campaign-map.html` com todos
  os assets locais presentes.
- 127 testes backend passaram em PostgreSQL 18.4 com o gate de zero skips.
- A baseline Ruff caiu de 242 para 240 achados e `git diff --check` passou.
- A imagem multi-stage foi construida e o Compose subiu app + PostgreSQL; API,
  `index.html`, `login.html` e `campaign-map.html` responderam 200.
- Identidade usa `IdentityService` e um unit of work PostgreSQL; nenhum router
  executa SQL e o gate arquitetural nao possui mais excecoes.
- HTTP e WebSocket resolvem principal por `SessionService`; `CampaignEventService`
  concentra autorizacao e stream, deixando `asgi.py` sem imports de repositories.
- A Mesa foi dividida fisicamente em cenas, elementos, exploracao, templates,
  tokens e projection; `repositories/campaign_maps.py` e uma fachada de 10 linhas.

## Divida que impede nota maior

1. Elevar cobertura principalmente em `ui/`, `framework/` e no Nexus.
2. Reduzir progressivamente os 240 achados da baseline Ruff.
3. O bundle principal caiu de aproximadamente 520 KB para 389 KB; ainda falta
   modularizar os scripts 3D legados que continuam globais.
4. Continuar a migracao de estilos inline fora do partial compartilhado.
5. Continuar reduzindo `Component.js` e as maiores views; persistência de ficha,
   combate e comandos externos da Mesa já saiu das views.
6. Substituir `Any`/`__getattr__` do servico da Mesa por ports explicitos por agregado.
7. Migrar contratos `dict[str, object]` das rotas para DTOs Pydantic graduais.
