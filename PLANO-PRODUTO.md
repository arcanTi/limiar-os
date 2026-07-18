# PLANO-PRODUTO.md — Roadmap de produto do Limiar OS

> **SUPERSEDED 2026-07-18**: plano unificado em `README-PLANO.md`.

Criado 2026-07-17. Visao de product management sobre onde o produto esta e
para onde vale levar. Execucao detalhada do eixo mapa vive em
`PLANO-MAPA-2.md` (sequencia de `PLANO-MAPA-FOUNDRY.md`, ja concluido).

## 0. North star

> A mesa roda a sessao inteira dentro do Limiar OS, sem abrir o Foundry.

Tudo neste plano se justifica por aproximar essa frase da realidade. O que nao
aproxima, nao entra.

## 1. Estado atual (inventario)

| Modulo | Estado | Observacao |
| --- | --- | --- |
| Fichas vivas (stats, HP, cyberware, lesoes) | maduro | domain modules testados |
| Engine de combate CPR RAW | maduro | cockpit + rolagens + DV por range |
| Cyberware | maduro | fases do PLANO-CYBERWARE concluidas |
| Night City Tarot | maduro | deck persistido, efeitos resolvidos, trigger 3x6 no combate |
| Campanhas/membership/convites | maduro | public/private, roster, convites |
| Chat | funcional | poll 3.5s, sem log estruturado |
| Nexus Breach (minigame) | funcional | ilha — sem vinculo com economia/campanha |
| Mapa tatico (Foundry-lite) | completo, pouco provado | F1–F8 concluidas; F3+ sem verificacao completa no browser |
| Login/auth (admin/gm/player) | maduro | rework de login em andamento (login.html novo) |
| Sync tempo real | parcial | long-poll so no mapa (F7); resto em polls fixos |

Fatos de codigo relevantes:

- Entrada da Mesa EXISTE: icone MAP do desktop (`desktop.js` nav → 
  `openCampaignMap()` → `campaign-map.html?campaign=ID`). O README.md do
  produto esta desatualizado quando afirma que a entrada foi removida.
- Long-poll autenticado existe apenas em `GET /campaign-maps/:id/updates`
  (`waitForUpdate` no cliente, fallback polling 4s).
- App principal: chat 3.5s, roster 5s, poll de GM para fichas/combate — tudo
  `setInterval` fixo em `Component.js`.

## 2. Eixos de produto (ranqueados)

### E1 — Provar a Mesa em sessao real (alavanca maxima, custo minimo)

O modulo mais ambicioso do produto esta construido e sub-provado. Valor
construido nao entregue e valor zero. Antes de qualquer feature nova de mapa:
rodar 1 sessao real com o mapa como superficie principal e colher friccao real.

- Verificar no browser as fases entregues sem prova (F3, F5–F8).
- Corrigir README.md (Mesa existe; documentar o fluxo de abrir a mesa).
- UX de entrada/retorno: abrir mesa por campanha especifica, voltar ao app.
- Saida: lista de friccao da sessao vira backlog do E2.

### E2 — Mapa <-> ficha <-> combate como moat

F4 (regua vira ataque com DV por banda) e o que o Foundry nao faz nativo.
O posicionamento e vencer em "estado mecanico vivo na mesma tela", nunca em
paridade de feature generica.

- Turno/iniciativa visivel no token; abrir cockpit a partir do token.
- GM aplica condicao/dano direto no token (context menu), reflete na ficha.
- AoE resolve: template -> tokens afetados -> dano em area no cockpit.
- Detalhe de execucao: `PLANO-MAPA-2.md` fases M2 e M4.

### E3 — Sync tempo-real unificado (plataforma)

Generalizar o long-poll do F7 para um canal por campanha e aposentar os
`setInterval` fixos de chat/roster/combate. Trabalho de plataforma barato,
ganho transversal: mesa inteira ao vivo, base para iniciativa compartilhada.
Detalhe: `PLANO-MAPA-2.md` fase M3.

### E4 — Companion mobile do jogador

Jogador na mesa fisica com celular: ficha, HP, rolagens, aceitar convite.
Mapa responsivo/touch e a parte cara; ficha responsiva e a parte barata e ja
multiplica uso por jogador sem custo para o GM. Comecar pela ficha.

### E5 — Multi-sistema (campaign OS generico)

O nucleo do mapa ja nasceu generico + adapter CPR (`systemAdapter.ts`).
Caminho para "ferramenta da minha mesa" -> "campaign OS": migracao
`campaigns.system` + `theme`, registry de adapters, segunda campanha piloto
(zombies). Regra de produto: so genericizar quando a segunda campanha real
existir. Pull, nao push.

### E6 — Conteudo como sistema (Tarot, Nexus)

- Tarot com efeito mecanico resolvido e diferencial raro: dar palco na mesa
  (overlay de carta no mapa quando o trigger 3x6 dispara em combate).
- Nexus Breach deixa de ser ilha: recompensa ligada a economia (eddies/IP) e
  NET architecture como cena/pin vinculado no mapa.

### E7 — Journal / log de sessao

Chat ja persiste; promover a log estruturado (rolagens, dano, pings, eventos
de cena) sai barato e resolve continuidade de campanha. Pins/notas de cena
(F8) sao a semente.

## 3. Sequencia recomendada

```
E1 (provar) -> E2 (moat) -> E3 (plataforma) -> E4..E7 por demanda da mesa
```

- E1 e pre-requisito de tudo: friccao real > roadmap teorico.
- E2 e E3 se alimentam: turno vivo no mapa (E2) fica melhor com sync (E3),
  mas nenhum bloqueia o outro — E2 funciona no polling atual.
- E5 espera a segunda campanha. E6/E7 sao apostas de encantamento, entram em
  janelas curtas entre fases pesadas.

## 4. Higiene e debitos (fazer antes de abrir frente nova)

- [ ] Commitar o trabalho em voo (~20 arquivos modificados + login rework).
- [ ] Atualizar README.md (Mesa existe; mapa F1–F8; login novo).
- [ ] `dist/` versionado junto do fonte — garantir rebuild disciplinado
      (`dist/limiar-app.js`, `dist/campaign-map.js`) a cada entrega.
- [ ] Padrao de corrida do terrain-paint anotado — qualquer feature nova de
      escrita concorrente segue o padrao revision/`expectedRevision`.

## 5. Metricas de sucesso (proxy simples, sem telemetria pesada)

| Eixo | Sinal de sucesso |
| --- | --- |
| E1 | 1 sessao inteira com mapa aberto do inicio ao fim |
| E2 | ataque medido no mapa vira rolagem com DV sem digitar nada |
| E3 | zero `setInterval` de dados no Component.js; latencia percebida <2s |
| E4 | jogador usa a propria ficha pelo celular durante a sessao |
| E5 | segunda campanha (nao-CPR) criada e jogada com o mesmo nucleo |

## 6. Nao-objetivos (por decisao)

- Nao competir com Foundry em paridade de modulo (audio, video, animacoes,
  hex grid, marketplace de modulos). Ver secao 2 do PLANO-MAPA-FOUNDRY.
- Nao virar SaaS/hosted por ora: produto e local-first para a mesa do grupo.
  Distribuicao (Docker/host) so se o objetivo mudar.
- Nao adicionar dependencia externa nova (sem PixiJS, sem CDN) — decisao
  tecnica transversal ja firmada.
