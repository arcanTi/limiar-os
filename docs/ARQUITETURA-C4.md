# Limiar OS — Diagrama C4

Modelo C4 do produto no estado atual do checkout (`main`). Quatro níveis:
Contexto (L1), Contêineres (L2), Componentes (L3, backend e frontend) e
diagramas dinâmicos (L4) para os dois fluxos que mais definem o sistema.

Convenção de cor nos diagramas:

| Cor | Significado |
| --- | --- |
| azul | escopo interno do Limiar OS |
| cinza | pessoa / sistema externo |
| verde | armazenamento |

---

## Nível 1 — Contexto do sistema

Quem usa o Limiar OS e com o que ele fala fora das próprias fronteiras.

```mermaid
flowchart TB
    gm["<b>Mestre / Admin</b><br/>[Pessoa]<br/>Conduz a sessão de Cyberpunk RED:<br/>campanhas, Mesa tática, cockpit de combate,<br/>gestão de usuários (admin)"]
    player["<b>Jogador</b><br/>[Pessoa]<br/>Opera a própria ficha, rola dados,<br/>move token, encerra o próprio turno"]

    limiar["<b>Limiar OS</b><br/>[Sistema de software]<br/>Sistema operacional de campanha local-first<br/>para Cyberpunk RED: fichas, combate, mapa tático,<br/>campanhas, chat, cyberware, Tarot de Night City<br/>e o minigame Nexus Breach na mesma superfície"]

    google["<b>Google Identity</b><br/>[Sistema externo · OPCIONAL]<br/>Emite id_token do Google Sign-In;<br/>validado via oauth2.googleapis.com/tokeninfo"]
    fs["<b>Sistema de arquivos local</b><br/>[Sistema externo]<br/>uploads/ (imagens), data/seed/ (catálogo)"]

    gm -->|"usa via navegador<br/>HTTP/JSON"| limiar
    player -->|"usa via navegador<br/>HTTP/JSON"| limiar
    limiar -->|"valida id_token, aud, issuer<br/>e e-mail verificado · HTTPS<br/>só quando GOOGLE_CLIENT_ID está definido"| google
    limiar -->|"lê e grava<br/>uploads + referências"| fs

    classDef person fill:#6b6b6b,stroke:#3f3f3f,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#8b8b8b,stroke:#5f5f5f,color:#fff
    class gm,player person
    class limiar system
    class google,fs external
```

**Ponto de arquitetura:** não há dependência externa obrigatória. Login
local com usuário/senha (PBKDF2-HMAC em `backend/security.py`) funciona sem
provedor nenhum; a ausência de `GOOGLE_CLIENT_ID` desabilita a integração
Google sem bloquear o acesso.

---

## Nível 2 — Contêineres

O que roda como unidade executável/deployável separada. Detalhe importante:
**tudo é servido por um único processo Python numa única porta** (8765 por
padrão) — o backend serve `/api/*` *e* os estáticos, incluindo os bundles de
`dist/`.

```mermaid
flowchart TB
    gm["<b>Mestre / Admin</b><br/>[Pessoa]"]
    player["<b>Jogador</b><br/>[Pessoa]"]

    subgraph limiar["Limiar OS"]
        direction TB

        subgraph browser["Navegador"]
            direction TB
            shell["<b>App Shell</b><br/>[SPA · Vite/ES modules]<br/>frontend/index.html + dist/assets/<br/>Ficha, combate, campanhas, chat, HQ,<br/>Tarot, desktop"]
            loginpg["<b>Login</b><br/>[Página · Vite entry]<br/>login.html + assets/login-*<br/>Login local, Google Sign-In,<br/>seletor de campanha"]
            mapapp["<b>Mesa tática</b><br/>[Página · Vite entry + Canvas]<br/>campaign-map.html + assets/campaign-map-*<br/>Cenas, tokens, fog, LOS, luzes,<br/>templates de área, régua"]
            nexus["<b>Nexus Breach</b><br/>[Minigame · JS + Canvas]<br/>frontend/games/nexus/<br/>Netrunning embutido no shell"]
            dice["<b>sarah-dice</b><br/>[Lib vendorizada · WebGL]<br/>vendor/sarah-dice/<br/>Renderização 3D dos dados"]
        end

        api["<b>Servidor de aplicação</b><br/>[Python 3.13 · FastAPI/Uvicorn]<br/>backend/ · porta única (PORT=8765)<br/>Rotas /api/*, sessões, autorização por papel,<br/>WebSocket/long-poll e arquivos estáticos"]

        db[("<b>Banco de dados</b><br/>[PostgreSQL]<br/>Alembic + JSONB + event log<br/>users, sessions, campaigns, characters,<br/>items, chat_messages, campaign_map_*,<br/>campaign_events, assets, settings…")]
        uploads[("<b>Armazenamento de imagens</b><br/>[Sistema de arquivos]<br/>uploads/<br/>Retratos, artes de cena, tokens<br/>limite LIMIAR_MAX_UPLOAD_MB=64")]
        seed[("<b>Catálogo declarativo</b><br/>[JSON]<br/>data/seed/<br/>limiar-seed.json, skills, tarot,<br/>critical-injuries, trauma-plans, i18n")]

        build["<b>Build do frontend</b><br/>[Vite · tempo de build, não roda em produção]<br/>frontend/src/ → dist/*.js<br/>npm run build"]
    end

    google["<b>Google Identity</b><br/>[Sistema externo · opcional]"]

    gm --> loginpg
    player --> loginpg
    loginpg -->|"redireciona após sessão criada"| shell
    shell -->|"abre MESA"| mapapp
    shell --> nexus
    shell --> dice

    shell -->|"JSON/HTTPS<br/>/api/characters, /api/combat-state,<br/>/api/tarot-state, /api/chat, /api/hq…"| api
    loginpg -->|"/api/login, /api/register,<br/>/api/auth/google, /api/session"| api
    mapapp -->|"/api/campaign-maps/*<br/>+ long-poll /api/campaigns/{id}/updates"| api
    nexus -->|"/api/nexus-challenge<br/>/api/nexus-result"| api

    api -->|"psycopg · pool transacional"| db
    api -->|"grava e serve imagens"| uploads
    api -->|"carrega no boot / seed idempotente"| seed
    api -->|"valida id_token · HTTPS"| google
    build -.->|"gera bundles que o backend serve"| shell
    build -.-> loginpg
    build -.-> mapapp

    classDef person fill:#6b6b6b,stroke:#3f3f3f,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef store fill:#2f855a,stroke:#22543d,color:#fff
    classDef external fill:#8b8b8b,stroke:#5f5f5f,color:#fff
    classDef tooling fill:#438dd5,stroke:#2e6295,color:#fff,stroke-dasharray: 5 5
    class gm,player person
    class shell,loginpg,mapapp,nexus,dice,api container
    class db,uploads,seed store
    class google external
    class build tooling
```

**Consequência operacional:** mudanças em `frontend/src/` só aparecem no
servidor real depois de `npm run build` — o backend serve `dist/`, não o
código-fonte. Um servidor estático mostra HTML/CSS mas não prova nada sobre
auth, persistência ou regras apoiadas em API.

---

## Nível 3a — Componentes do servidor de aplicação

`backend/` usa FastAPI nativo. Cada router traduz HTTP para um serviço de
aplicação; os serviços dependem de ports, e os adapters PostgreSQL/filesystem
ficam em `backend/repositories/`. Não existe dispatcher ou handler legado.

```mermaid
flowchart TB
    subgraph api["Servidor de aplicação [Python]"]
        direction TB

        subgraph routes["backend/routers/ — endpoints FastAPI nativos"]
            direction LR
            base["<b>common</b><br/>Dependências de sessão,<br/>limite de corpo e envelope de erro"]
            auth["<b>AuthRoutes</b><br/>auth.py<br/>/api/login, /api/logout, /api/register,<br/>/api/session, /api/auth/google,<br/>/api/users*, /api/password-reset-requests*"]
            camp["<b>CampaignRoutes</b><br/>campaigns.py<br/>/api/campaigns*, convites, membros,<br/>/api/notifications, canal de updates"]
            maps["<b>CampaignMapRoutes</b><br/>campaign_maps.py<br/>/api/campaign-maps/* — cenas, tokens,<br/>walls, luzes, fog, reveals, props,<br/>templates, drawings, pins, pings"]
            chars["<b>CharacterRoutes</b><br/>characters.py<br/>/api/characters*, /api/player-characters"]
            cat["<b>CatalogRoutes</b><br/>catalog.py<br/>/api/items*, /api/reference/*, /api/map"]
            state["<b>StateRoutes</b><br/>state.py<br/>/api/combat-state (+/end-turn),<br/>/api/tarot-state, /api/hq,<br/>/api/nexus-challenge, /api/nexus-result"]
            comms["<b>CommsRoutes</b><br/>comms.py<br/>/api/chat"]
            meta["<b>MetaRoutes</b><br/>meta.py<br/>/api/health, /api/meta/config,<br/>/api/meta/login-art, /api/i18n"]
            upl["<b>UploadRoutes</b><br/>uploads.py<br/>/api/uploads/images"]
        end

        subgraph repos["backend/repositories/ — persistência"]
            direction LR
            rrec["<b>records</b><br/>Documentos tipados genéricos<br/>(fichas, itens, estados)"]
            rcamp["<b>campaigns</b><br/>Campanhas, membros, convites"]
            rid["<b>identity</b><br/>Unit of work transacional<br/>users, sessions e password resets"]
            rmaps["<b>campaign_map_*</b><br/>Fachada + cenas, elementos,<br/>exploração, templates, tokens e projection"]
            rchat["<b>chat</b><br/>chat_messages"]
            rsync["<b>campaign_sync</b><br/>Event log PostgreSQL compartilhado,<br/>tópicos map/chat/combat/roster,<br/>stream entre múltiplos workers"]
        end

        dom["<b>domain/validation.py</b><br/>Validação de payload no servidor<br/>(a regra de CPR vive no frontend)"]
        sec["<b>security.py</b><br/>PBKDF2-HMAC + verificação de senha,<br/>rate limiting por IP"]
        appsvc["<b>application/</b><br/>Casos de uso, autorização e ports<br/>Identity, Session e CampaignEvent services<br/>sem dependência de FastAPI"]
        dbm["<b>db.py + migrations/</b><br/>Pool psycopg, Alembic,<br/>JSONB e seed idempotente"]
        cfg["<b>config.py</b><br/>PORT, HOST, DATABASE_URL, UPLOAD_DIR,<br/>LIMIAR_SESSION_TTL, LIMIAR_MAX_UPLOAD_MB,<br/>LIMIAR_GM_USER/PASSWORD"]
    end

    db[("PostgreSQL<br/>schema Alembic")]
    files[("uploads/ · data/seed/")]
    google["Google Identity<br/>[externo · opcional]"]

    auth --> sec
    auth --> google
    routes --> base
    auth --> appsvc
    chars --> appsvc
    cat --> appsvc
    state --> appsvc
    camp --> appsvc
    maps --> appsvc
    comms --> appsvc
    appsvc --> rid
    appsvc --> rrec
    appsvc --> rcamp
    appsvc --> rmaps
    appsvc --> rchat
    appsvc --> rsync
    routes --> dom
    upl --> files
    cat --> files
    repos --> dbm
    dbm --> db
    base --> cfg

    classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
    classDef store fill:#2f855a,stroke:#22543d,color:#fff
    classDef external fill:#8b8b8b,stroke:#5f5f5f,color:#fff
    class base,auth,camp,maps,chars,cat,state,comms,meta,upl,rid,rrec,rcamp,rmaps,rchat,rsync,dom,sec,appsvc,dbm,cfg comp
    class db,files store
    class google external
```

**Assimetria deliberada:** o backend é fino. Ele valida payload, aplica
papel/propriedade e persiste. As regras de Cyberpunk RED vivem no frontend,
em módulos puros — ver o nível 3b.

---

## Nível 3b — Componentes do App Shell (frontend)

Arquitetura em quatro camadas dentro de `frontend/src/`. A dependência aponta
sempre para dentro: `ui → application → domain`, com `infrastructure`
injetada por baixo a partir do composition root.

```mermaid
flowchart TB
    subgraph shell["App Shell [JS/TS · ES modules · build Vite]"]
        direction TB

        main["<b>main.js</b> — composition root<br/>Cria API + Application, injeta em Component,<br/>monta em &lt;x-dc&gt;"]

        subgraph uil["ui/ — apresentação"]
            direction LR
            comp["<b>Component.js</b><br/>Orquestração central da UI"]
            views["<b>ui/views/</b><br/>sheet · combat · map · campaigns ·<br/>chat · hq · tarot · nexus · desktop"]
        end

        fw["<b>framework/index.js</b><br/>Microframework: classe base DCLogic,<br/>template mustache, patcher de DOM,<br/>sanitização de URL/atributo"]

        subgraph appl["application/ — casos de uso orquestrados"]
            direction LR
            uc1["RollCombatAttack<br/>ApplyCombatDamage<br/>ApplyAreaAttack<br/>EndTurn"]
            uc2["InstallCyberware<br/>ToggleCyberwareEnhancement<br/>BuyIpIncrease<br/>ResolveTarotDraw"]
            fact["<b>createApplication.ts</b><br/>Registro de casos de uso;<br/>rng e clock injetados<br/>(determinismo em teste)"]
        end

        subgraph domn["domain/ — regras puras, sem I/O"]
            direction LR
            d1["character · economy · dice<br/>combat · conditions · movement"]
            d2["cyberware · tarot · items<br/>netrunning · rules · shared"]
            d3["map/ — geometria, visão,<br/>templates, intents"]
            d4["auth · campaigns · chat"]
        end

        subgraph infra["infrastructure/ — I/O"]
            direction LR
            http["<b>api/http.ts</b><br/>Cliente HTTP base"]
            clients["<b>api/</b> — 13 clientes de rota<br/>auth · campaigns · campaignMaps ·<br/>characters · combat · comms · catalog ·<br/>hq · map · nexus · tarot · uploads · users"]
            sess["<b>session.ts</b><br/>Sessão no cliente"]
            store["<b>store.ts</b><br/>Helpers de asset + factory da API"]
            i18n["<b>i18n.ts</b>"]
        end
    end

    api["Servidor de aplicação<br/>[Python · /api/*]"]

    main --> comp
    main --> appl
    main --> infra
    comp --> views
    comp --> fw
    views --> appl
    views --> domn
    appl --> domn
    appl --> clients
    fact --> uc1
    fact --> uc2
    clients --> http
    http --> api
    sess --> http

    classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
    classDef pure fill:#a3d9a5,stroke:#5f9c62,color:#000
    classDef external fill:#8b8b8b,stroke:#5f5f5f,color:#fff
    class main,comp,views,fw,uc1,uc2,fact,http,clients,sess,store,i18n comp
    class d1,d2,d3,d4 pure
    class api external
```

**Regra que sustenta o desenho:** o canvas da Mesa coleta geometria e
contexto, nunca decide resultado mecânico. Quem decide é `domain/`, puro e
testável; `application/` prepara a mutação; `infrastructure/api` persiste.

---

## Nível 3c — Componentes da Mesa tática

`frontend/src/pages/` — a Mesa é uma página própria, com seu próprio
controlador e ciclo de sincronização.

```mermaid
flowchart TB
    subgraph mesa["Mesa tática [página campaign-map.html]"]
        direction TB
        ctrl["<b>campaign-map.js</b><br/>Controlador da página"]

        subgraph cmds["Comandos de mutação"]
            direction LR
            c1["SceneCommands<br/>TokenCommands"]
            c2["PropCommands<br/>LightCommands<br/>TemplateCommands"]
        end

        subgraph io["Entrada e render"]
            direction LR
            pointer["PointerHandlers"]
            keyboard["KeyboardHandlers"]
            renderer["CanvasRenderer"]
        end

        subgraph dataflow["Estado"]
            direction LR
            runtime["DataRuntime"]
            selectors["Selectors"]
            sync["<b>Sync</b><br/>long-poll unificado"]
        end
    end

    mapdom["domain/map/<br/>geometria · LOS · fog ·<br/>templates de área · intents"]
    combatdom["domain/combat/<br/>ataque · dano · munição ·<br/>iniciativa · turnos"]
    apicm["/api/campaign-maps/*<br/>/api/campaigns/{id}/updates"]

    ctrl --> cmds
    ctrl --> io
    ctrl --> dataflow
    pointer --> ctrl
    keyboard --> ctrl
    runtime --> selectors
    selectors --> renderer
    cmds --> apicm
    sync --> apicm
    sync --> runtime
    renderer --> mapdom
    ctrl --> mapdom
    ctrl --> combatdom

    classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
    classDef pure fill:#a3d9a5,stroke:#5f9c62,color:#000
    classDef external fill:#8b8b8b,stroke:#5f5f5f,color:#fff
    class ctrl,c1,c2,pointer,keyboard,renderer,runtime,selectors,sync comp
    class mapdom,combatdom pure
    class apicm external
```

---

## Nível 4a — Dinâmico: ataque de área resolvido na Mesa

Mostra a assimetria frontend-regra / backend-persistência em um caso concreto.

```mermaid
sequenceDiagram
    autonumber
    actor GM as Mestre
    participant Mesa as Mesa (campaign-map.js)
    participant MapD as domain/map
    participant Cockpit as ui/views/combat.js
    participant UC as application/ApplyAreaAttack
    participant CombatD as domain/combat + cyberware + tarot
    participant API as infrastructure/api
    participant BE as FastAPI + application services
    participant DB as PostgreSQL

    GM->>Mesa: posiciona template de área (círculo/cone/retângulo/raio)
    Mesa->>MapD: geometria do template + walls + props
    MapD-->>Mesa: alvos atingidos, cobertura, supressão
    Mesa->>Cockpit: alvos pré-selecionados
    GM->>Cockpit: confirma ataque
    Cockpit->>UC: applyAreaAttack(contexto)
    UC->>CombatD: resolve dano, armadura/SP, críticos, munição
    CombatD-->>UC: breakdown auditável por alvo
    UC->>API: PATCH ficha(s) + /api/combat-state
    API->>BE: JSON
    BE->>BE: valida payload + papel/propriedade
    BE->>DB: grava (records, combat-state)
    DB->>DB: trigger grava campaign_events na mesma transação
    BE-->>API: 200 + estado novo
    API-->>Cockpit: render do breakdown
    Note over BE,Mesa: clientes em long-poll acordam e repuxam o delta
```

---

## Nível 4b — Dinâmico: canal unificado de sincronização

`CampaignEventService` é a fronteira comum do WebSocket e do fallback HTTP.
O adapter `campaign_sync.py` mantém versões e tópicos no PostgreSQL, permitindo
que cada processo observe commits feitos por qualquer outra réplica.

```mermaid
sequenceDiagram
    autonumber
    participant C1 as Cliente A (Mesa)
    participant C2 as Cliente B (App Shell)
    participant BE as CampaignEventService
    participant Adapter as campaign_sync adapter
    participant DB as PostgreSQL event log

    C1->>BE: WebSocket /api/ws/campaigns/{id}?since=N
    C2->>BE: WebSocket /api/ws/campaigns/{id}?since=N
    BE->>BE: SessionService resolve token + autoriza membro
    C2->>BE: POST /api/chat
    BE->>DB: grava chat_messages
    DB->>DB: trigger grava campaign_events na mesma transação
    Adapter->>DB: observa log compartilhado
    Adapter-->>BE: evento {campaignId, version, topic}
    BE->>Adapter: snapshot_since(id, N)
    BE-->>C1: campaign.update {version: N+1, topics: ["chat"]}
    BE-->>C2: campaign.update {version: N+1, topics: ["chat"]}
    Note over C1,BE: clientes sem WebSocket usam o mesmo snapshot<br/>via long-poll HTTP de compatibilidade
```

---

## Fronteiras que o diagrama torna explícitas

1. **Um processo de aplicação, uma porta.** FastAPI/Uvicorn serve API,
   WebSocket e estáticos; PostgreSQL é o único tier persistente e permite
   múltiplos processos compartilharem sessões e eventos de campanha.
2. **Regra no cliente, autorização no servidor.** As regras de CPR são
   frontend puro; o backend impõe papel (`admin`/`gm`/`player`) e propriedade.
   Rotas estreitas como `/api/combat-state/end-turn` existem exatamente para
   dar ao jogador um poder específico sem abrir o estado de combate inteiro.
3. **Local-first de verdade.** Google Identity é o único sistema externo, e é
   opcional. Sem `GOOGLE_CLIENT_ID`, nada quebra.
4. **`dist/` é fronteira de contêiner.** O código-fonte em `frontend/src/` não
   é servido; é insumo de build. Verificar comportamento exige build + servidor
   real.
5. **Tabelas de mapa dominam o schema.** 11 das 25 tabelas são
   `campaign_map_*`. A Mesa é o subsistema mais pesado em estado persistido.
