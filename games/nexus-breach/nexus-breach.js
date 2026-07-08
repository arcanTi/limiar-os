/* ============================================================
   Nexus Breach — embeddable build for Limiar OS.

   The standalone game (../../../nexus-breach/game.js) grabbed nodes
   off the global `document` and booted on load. Here it is wrapped as
   window.NexusBreach.mount(container) / .unmount() so the Limiar OS
   component can mount it imperatively into a `data-dc-preserve-children`
   container (same pattern as the 3D dice box and the tarot FX canvas).

   Differences vs. the original game.js:
   - Markup lives in NEXUS_MARKUP and is injected on mount, so the dc
     vdom never owns or wipes it.
   - All element-graph queries are scoped to `root` instead of `document`
     (createElement still uses document).
   - The backdrop canvas sizes to the wrapper, not the viewport.
   - window/global listeners + timers are tracked and removed on unmount.
   - The global "r"/Esc keys ignore events from form fields so the setup
     inputs are typeable.
   ============================================================ */
(function () {
  const TOKEN_SETS = {
    standard: ["1C", "E9", "7A", "BD", "55", "A0", "F2", "D4", "K9", "0X"],
    military: ["MX", "V7", "R3", "CP", "JK", "T9", "HH", "W5", "LN", "QQ"],
    ghost: ["GH", "0S", "T1", "ZZ", "PH", "N4", "XO", "CR", "WT", "EV"],
  };

  const DEFAULT_CONFIG = {
    scriptCount: 3,
    scriptNames: [],
    scriptLengths: [2, 2, 3, 3, 4],
    timeLimit: 95,
    bufferSize: 8,
    mapLayout: "auto",
    extraNodes: 2,
    matrixSize: 6,
    traceRate: 1.0,
    tokenSet: "standard",
    sequenceContinuity: "blocked",
    secondaryObjectives: false,
  };

  const objectiveLibrary = [
    { id: "camera", name: "Camera relay", detail: "Assumir olhos do perimetro", label: "CAM" },
    { id: "auth", name: "Auth bypass", detail: "Quebrar a camada de credencial", label: "AUTH" },
    { id: "proxy", name: "Proxy pivot", detail: "Preparar salto para o nucleo", label: "P1" },
    { id: "vault", name: "Data vault", detail: "Extrair chaves do cofre de dados", label: "DB" },
    { id: "relay", name: "Signal relay", detail: "Tomar o repetidor de sinal", label: "RLY" },
  ];

  const mapLayouts = {
    spine: {
      entry: { x: 70, y: 500 },
      core: { x: 354, y: 78 },
      objectives: [
        { x: 142, y: 408 },
        { x: 214, y: 320 },
        { x: 156, y: 232 },
        { x: 260, y: 164 },
        { x: 326, y: 246 },
      ],
      aux: [
        { x: 96, y: 144 },
        { x: 330, y: 384 },
        { x: 246, y: 454 },
        { x: 332, y: 116 },
      ],
    },
    mesh: {
      entry: { x: 64, y: 492 },
      core: { x: 356, y: 88 },
      objectives: [
        { x: 126, y: 328 },
        { x: 306, y: 328 },
        { x: 118, y: 152 },
        { x: 298, y: 178 },
        { x: 214, y: 248 },
      ],
      aux: [
        { x: 204, y: 440 },
        { x: 72, y: 252 },
        { x: 352, y: 444 },
        { x: 214, y: 76 },
      ],
    },
    ring: {
      entry: { x: 210, y: 510 },
      core: { x: 210, y: 96 },
      objectives: [
        { x: 86, y: 386 },
        { x: 92, y: 206 },
        { x: 210, y: 156 },
        { x: 328, y: 206 },
        { x: 334, y: 386 },
      ],
      aux: [
        { x: 210, y: 430 },
        { x: 56, y: 296 },
        { x: 364, y: 296 },
        { x: 210, y: 282 },
      ],
    },
    split: {
      entry: { x: 70, y: 500 },
      core: { x: 350, y: 82 },
      objectives: [
        { x: 138, y: 384 },
        { x: 90, y: 230 },
        { x: 292, y: 382 },
        { x: 330, y: 226 },
        { x: 214, y: 300 },
      ],
      aux: [
        { x: 208, y: 454 },
        { x: 210, y: 174 },
        { x: 56, y: 94 },
        { x: 360, y: 500 },
      ],
    },
    cluster: {
      entry: { x: 68, y: 492 },
      core: { x: 352, y: 86 },
      objectives: [
        { x: 96, y: 374 },
        { x: 72, y: 246 },
        { x: 148, y: 172 },
        { x: 300, y: 368 },
        { x: 316, y: 214 },
      ],
      aux: [
        { x: 196, y: 316 },
        { x: 242, y: 458 },
        { x: 136, y: 108 },
        { x: 332, y: 108 },
      ],
    },
    star: {
      entry: { x: 210, y: 508 },
      core: { x: 210, y: 88 },
      objectives: [
        { x: 86, y: 416 },
        { x: 50, y: 222 },
        { x: 210, y: 168 },
        { x: 370, y: 222 },
        { x: 334, y: 416 },
      ],
      aux: [
        { x: 210, y: 336 },
        { x: 106, y: 320 },
        { x: 314, y: 320 },
        { x: 210, y: 458 },
      ],
    },
  };

  const NEXUS_MARKUP = `
    <canvas id="backdrop" aria-hidden="true"></canvas>

    <main class="shell" data-state="ready">
      <section class="topbar" aria-label="Painel de invasao">
        <div class="brand">
          <span class="mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">NEXUS // INTRUSION LAYER</p>
            <h1>Breach Protocol</h1>
          </div>
        </div>

        <div class="status-strip" aria-live="polite">
          <div class="metric">
            <span>Tempo</span>
            <strong id="timer">01:35</strong>
          </div>
          <div class="metric">
            <span>Trace</span>
            <strong id="traceReadout">00%</strong>
          </div>
          <div class="meter" aria-label="Nivel de rastreio">
            <i id="traceFill"></i>
          </div>
          <button id="restartBtn" class="icon-button" type="button" aria-label="Reiniciar invasao" title="Reiniciar">
            <span aria-hidden="true">&#8635;</span>
          </button>
        </div>
      </section>

      <section class="game-layout">
        <aside class="panel intel-panel" aria-label="Rede alvo">
          <div class="section-heading">
            <p>Alvo remoto</p>
            <strong>Mapa do sistema</strong>
          </div>

          <div class="network-map" id="networkMap" aria-label="Mapa de acesso do sistema"></div>

          <div class="signal-card">
            <span>Sinal</span>
            <strong id="signalStatus">standby</strong>
            <p id="signalText">Capture os scripts para abrir caminho ate o nucleo.</p>
          </div>
        </aside>

        <section class="panel matrix-panel" aria-label="Matriz de breach">
          <div class="matrix-header">
            <div class="section-heading">
              <p>Handshake</p>
              <strong>Matriz de pacotes</strong>
            </div>
            <div class="turn-hint" id="turnHint">Primeiro pacote: linha superior</div>
          </div>

          <div class="matrix-wrap" id="matrixWrap">
            <div class="axis axis-top" id="axisTop" aria-hidden="true"></div>
            <div class="axis axis-left" id="axisLeft" aria-hidden="true"></div>
            <div id="matrix" class="matrix" role="grid" aria-label="Matriz de pacotes"></div>
          </div>

          <div class="buffer-row" aria-label="Buffer de sequencia">
            <div>
              <p>Buffer</p>
              <strong id="bufferCount">0/8</strong>
            </div>
            <div id="bufferSlots" class="buffer-slots"></div>
          </div>
        </section>

        <aside class="panel ops-panel" aria-label="Operacoes">
          <div class="section-heading">
            <p>Operacoes</p>
            <strong>Scripts ativos</strong>
          </div>

          <div id="objectives" class="objectives" aria-live="polite"></div>

          <div class="tools">
            <button id="scanBtn" class="tool-button" type="button">
              <span class="tool-icon" aria-hidden="true">&#9089;</span>
              <span>
                <strong>Re-scan</strong>
                <small>Nova matriz, +12% trace</small>
              </span>
            </button>
            <button id="purgeBtn" class="tool-button" type="button">
              <span class="tool-icon" aria-hidden="true">&#9003;</span>
              <span>
                <strong>Limpar buffer</strong>
                <small>Perde a cadeia atual</small>
              </span>
            </button>
          </div>

          <div class="terminal" aria-label="Log da invasao">
            <div class="terminal-top">
              <span></span><span></span><span></span>
              <strong>syslog</strong>
            </div>
            <div id="log" class="log"></div>
          </div>
        </aside>
      </section>

      <section id="overlay" class="overlay" aria-live="assertive">
        <div class="modal">
          <p id="overlayKicker">PROTOCOLO ARMADO</p>
          <h2 id="overlayTitle">Entrar no sistema</h2>
          <p id="overlayText">Combine os pacotes na ordem dos scripts. A primeira escolha vem da linha superior; depois alterne coluna e linha.</p>
          <form id="setupForm" class="setup-form" aria-label="Configuracao inicial">

            <div class="config-group">
              <p class="config-group-label">Scripts</p>
              <label class="config-field config-field-wide">
                <span>Scripts no mapa</span>
                <input id="scriptCount" name="scriptCount" type="range" min="1" max="5" value="3" />
                <strong data-output="scriptCount">3</strong>
              </label>
              <div class="config-field config-field-wide">
                <span>Tamanho e nome por script</span>
                <div id="scriptLengthList" class="script-length-list" aria-label="Configuracao individual de cada script"></div>
              </div>
            </div>

            <div class="config-row">
              <div class="config-group">
                <p class="config-group-label">Invasao</p>
                <label class="config-field">
                  <span>Tempo total</span>
                  <select id="timeLimit" name="timeLimit">
                    <option value="60">01:00</option>
                    <option value="95" selected>01:35</option>
                    <option value="120">02:00</option>
                    <option value="150">02:30</option>
                  </select>
                </label>
                <label class="config-field">
                  <span>Buffer</span>
                  <select id="bufferSize" name="bufferSize">
                    <option value="5">5 slots</option>
                    <option value="6">6 slots</option>
                    <option value="8" selected>8 slots</option>
                    <option value="10">10 slots</option>
                    <option value="12">12 slots</option>
                    <option value="16">16 slots</option>
                    <option value="20">20 slots</option>
                    <option value="26">26 slots</option>
                  </select>
                </label>
              </div>

              <div class="config-group">
                <p class="config-group-label">Mapa</p>
                <label class="config-field">
                  <span>Arquitetura</span>
                  <select id="mapLayout" name="mapLayout">
                    <option value="auto" selected>Auto</option>
                    <option value="spine">Coluna dorsal</option>
                    <option value="mesh">Malha</option>
                    <option value="ring">Anel</option>
                    <option value="split">Rotas divididas</option>
                    <option value="cluster">Cluster</option>
                    <option value="star">Estrela</option>
                  </select>
                </label>
                <label class="config-field">
                  <span>Nos auxiliares</span>
                  <input id="extraNodes" name="extraNodes" type="range" min="0" max="4" value="2" />
                  <strong data-output="extraNodes">2</strong>
                </label>
                <label class="config-field">
                  <span>Objetivos secundarios</span>
                  <select id="secondaryObjectives" name="secondaryObjectives">
                    <option value="false" selected>Desativado</option>
                    <option value="true">Ativado</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="config-group config-group--grid">
              <p class="config-group-label">Dificuldade</p>
              <label class="config-field">
                <span>Tamanho da matriz</span>
                <select id="matrixSize" name="matrixSize">
                  <option value="4">4&#215;4</option>
                  <option value="5">5&#215;5</option>
                  <option value="6" selected>6&#215;6</option>
                  <option value="7">7&#215;7</option>
                </select>
              </label>
              <label class="config-field">
                <span>Velocidade do trace</span>
                <select id="traceRate" name="traceRate">
                  <option value="0.6">Lenta</option>
                  <option value="1.0" selected>Normal</option>
                  <option value="1.5">Alta</option>
                  <option value="2.0">Critica</option>
                </select>
              </label>
              <label class="config-field config-field-wide">
                <span>Conjunto de tokens</span>
                <select id="tokenSet" name="tokenSet">
                  <option value="standard" selected>Padrao</option>
                  <option value="military">Militar</option>
                  <option value="ghost">Fantasma</option>
                </select>
              </label>
              <label class="config-field config-field-wide">
                <span>Continuidade dos codigos</span>
                <select id="sequenceContinuity" name="sequenceContinuity">
                  <option value="blocked" selected>Bloqueada</option>
                  <option value="linked">Permitida</option>
                </select>
              </label>
            </div>

          </form>
          <button id="primaryAction" type="button">Iniciar invasao</button>
        </div>
      </section>
    </main>
  `;

  const state = {
    grid: [],
    buffer: [],
    selected: new Set(),
    objectives: [],
    secondaryObjectives: [],
    nextObjectiveIndex: 0,
    config: { ...DEFAULT_CONFIG },
    map: null,
    running: false,
    over: false,
    timeLeft: DEFAULT_CONFIG.timeLimit,
    trace: 0,
    phase: "column",
    lastCell: null,
    tickId: null,
    pulseId: null,
  };

  // Mount container + resolved element refs + tracked global listeners.
  let root = null;
  let el = {};
  let listeners = [];
  // When false (player mode) the setup form is hidden and the config comes
  // from the GM-supplied `pendingConfig` instead of the form controls.
  let allowSetup = true;
  let pendingConfig = null;
  // Optional callback fired once when a round ends (player mode), so the host
  // can report the result back to the GM.
  let onResult = null;

  function emitResult(outcome, reason) {
    if (typeof onResult !== "function") return;
    onResult({
      outcome,
      reason,
      timeLeft: Math.max(0, state.timeLeft),
      trace: Math.round(state.trace),
      scriptsDone: state.objectives.filter((o) => o.complete).length,
      totalScripts: state.objectives.length,
      bufferUsed: state.buffer.length,
      matrixSize: state.config.matrixSize,
      at: new Date().toISOString(),
    });
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push({ target, type, fn, opts });
  }

  function resolveEl() {
    el = {
      shell: root.querySelector(".shell"),
      matrix: root.querySelector("#matrix"),
      matrixWrap: root.querySelector("#matrixWrap"),
      axisTop: root.querySelector("#axisTop"),
      axisLeft: root.querySelector("#axisLeft"),
      objectives: root.querySelector("#objectives"),
      bufferSlots: root.querySelector("#bufferSlots"),
      bufferCount: root.querySelector("#bufferCount"),
      timer: root.querySelector("#timer"),
      traceReadout: root.querySelector("#traceReadout"),
      traceFill: root.querySelector("#traceFill"),
      turnHint: root.querySelector("#turnHint"),
      networkMap: root.querySelector("#networkMap"),
      log: root.querySelector("#log"),
      scanBtn: root.querySelector("#scanBtn"),
      purgeBtn: root.querySelector("#purgeBtn"),
      restartBtn: root.querySelector("#restartBtn"),
      overlay: root.querySelector("#overlay"),
      overlayKicker: root.querySelector("#overlayKicker"),
      overlayTitle: root.querySelector("#overlayTitle"),
      overlayText: root.querySelector("#overlayText"),
      primaryAction: root.querySelector("#primaryAction"),
      setupForm: root.querySelector("#setupForm"),
      scriptCount: root.querySelector("#scriptCount"),
      scriptLengthList: root.querySelector("#scriptLengthList"),
      timeLimit: root.querySelector("#timeLimit"),
      bufferSize: root.querySelector("#bufferSize"),
      mapLayout: root.querySelector("#mapLayout"),
      extraNodes: root.querySelector("#extraNodes"),
      matrixSize: root.querySelector("#matrixSize"),
      traceRate: root.querySelector("#traceRate"),
      tokenSet: root.querySelector("#tokenSet"),
      sequenceContinuity: root.querySelector("#sequenceContinuity"),
      secondaryObjectives: root.querySelector("#secondaryObjectives"),
      signalStatus: root.querySelector("#signalStatus"),
      signalText: root.querySelector("#signalText"),
      canvas: root.querySelector("#backdrop"),
    };
  }

  function activeTokens() {
    return TOKEN_SETS[state.config.tokenSet] ?? TOKEN_SETS.standard;
  }

  function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // In GM/standalone mode the config is read from the form; in player mode it
  // is taken from the challenge the GM sent (normalized to the same shape).
  function readSetupConfig() {
    return allowSetup ? readFormConfig() : normalizeConfig(pendingConfig);
  }

  function readFormConfig() {
    const scriptCount = clamp(Number(el.scriptCount.value), 1, objectiveLibrary.length);
    const scriptLengths = readScriptLengthControls(scriptCount);
    const scriptNames = readScriptNameControls(scriptCount);
    const sequenceContinuity = el.sequenceContinuity.value;
    const minimumBuffer = getMinimumBufferLength(scriptLengths, sequenceContinuity);
    const requestedBuffer = clamp(Number(el.bufferSize.value), 5, 30);

    return {
      scriptCount,
      scriptNames,
      scriptLengths,
      timeLimit: Number(el.timeLimit.value),
      bufferSize: Math.max(requestedBuffer, minimumBuffer),
      mapLayout: el.mapLayout.value,
      extraNodes: clamp(Number(el.extraNodes.value), 0, 4),
      matrixSize: clamp(Number(el.matrixSize.value), 4, 7),
      traceRate: Number(el.traceRate.value),
      tokenSet: el.tokenSet.value,
      sequenceContinuity,
      secondaryObjectives: el.secondaryObjectives.value === "true",
    };
  }

  function normalizeConfig(cfg) {
    const base = { ...DEFAULT_CONFIG, ...(cfg || {}) };
    const scriptCount = clamp(Number(base.scriptCount) || DEFAULT_CONFIG.scriptCount, 1, objectiveLibrary.length);
    const rawLengths = Array.isArray(base.scriptLengths) && base.scriptLengths.length ? base.scriptLengths : DEFAULT_CONFIG.scriptLengths;
    const scriptLengths = Array.from({ length: scriptCount }, (_, i) => clamp(Number(rawLengths[i]) || DEFAULT_CONFIG.scriptLengths[i] || 3, 2, 6));
    const sequenceContinuity = base.sequenceContinuity === "linked" ? "linked" : "blocked";
    const minimumBuffer = getMinimumBufferLength(scriptLengths, sequenceContinuity);
    const requestedBuffer = clamp(Number(base.bufferSize) || DEFAULT_CONFIG.bufferSize, 5, 30);

    return {
      scriptCount,
      scriptNames: Array.isArray(base.scriptNames) ? base.scriptNames : [],
      scriptLengths,
      timeLimit: Number(base.timeLimit) || DEFAULT_CONFIG.timeLimit,
      bufferSize: Math.max(requestedBuffer, minimumBuffer),
      mapLayout: base.mapLayout || "auto",
      extraNodes: clamp(Number(base.extraNodes) || 0, 0, 4),
      matrixSize: clamp(Number(base.matrixSize) || DEFAULT_CONFIG.matrixSize, 4, 7),
      traceRate: Number(base.traceRate) || DEFAULT_CONFIG.traceRate,
      tokenSet: base.tokenSet || "standard",
      sequenceContinuity,
      secondaryObjectives: !!base.secondaryObjectives,
    };
  }

  function readScriptLengthControls(count = Number(el.scriptCount.value)) {
    const selects = [...el.scriptLengthList.querySelectorAll("select")];
    return Array.from({ length: count }, (_, index) => {
      const fallback = DEFAULT_CONFIG.scriptLengths[index] ?? 3;
      return clamp(Number(selects[index]?.value ?? fallback), 2, 6);
    });
  }

  function readScriptNameControls(count = Number(el.scriptCount.value)) {
    const inputs = [...el.scriptLengthList.querySelectorAll(".script-name-input")];
    return Array.from({ length: count }, (_, index) => inputs[index]?.value.trim() ?? "");
  }

  function updateSetupReadouts() {
    syncBufferSizeToScripts();
    el.setupForm.querySelector('[data-output="scriptCount"]').textContent = el.scriptCount.value;
    el.setupForm.querySelector('[data-output="extraNodes"]').textContent = el.extraNodes.value;
  }

  function applyConfigToForm(cfg) {
    const normalized = normalizeConfig(cfg);
    state.config = normalized;
    el.scriptCount.value = String(normalized.scriptCount);
    el.timeLimit.value = String(normalized.timeLimit);
    el.bufferSize.value = String(normalized.bufferSize);
    el.mapLayout.value = normalized.mapLayout;
    el.extraNodes.value = String(normalized.extraNodes);
    el.matrixSize.value = String(normalized.matrixSize);
    el.traceRate.value = String(normalized.traceRate);
    el.tokenSet.value = normalized.tokenSet;
    el.sequenceContinuity.value = normalized.sequenceContinuity;
    el.secondaryObjectives.value = String(normalized.secondaryObjectives);

    syncScriptLengthControls();
    [...el.scriptLengthList.querySelectorAll(".script-length-item")].forEach((item, index) => {
      const input = item.querySelector(".script-name-input");
      const select = item.querySelector("select");
      if (input) input.value = normalized.scriptNames[index] ?? "";
      if (select) select.value = String(normalized.scriptLengths[index] ?? DEFAULT_CONFIG.scriptLengths[index] ?? 3);
    });
  }

  function syncBufferSizeToScripts() {
    const minimumBuffer = getMinimumBufferLength(readScriptLengthControls(), el.sequenceContinuity.value);
    const currentBuffer = Number(el.bufferSize.value);
    if (currentBuffer >= minimumBuffer) return;

    const nextOption = [...el.bufferSize.options].find((option) => Number(option.value) >= minimumBuffer);
    if (nextOption) {
      el.bufferSize.value = nextOption.value;
    }
  }

  function syncScriptLengthControls() {
    const count = clamp(Number(el.scriptCount.value), 1, objectiveLibrary.length);
    const currentLengths = readScriptLengthControls(Math.max(count, el.scriptLengthList.querySelectorAll("select").length));
    el.scriptLengthList.innerHTML = "";

    for (let index = 0; index < count; index += 1) {
      const item = document.createElement("label");
      item.className = "script-length-item";
      const placeholder = objectiveLibrary[index]?.name ?? `Script ${index + 1}`;
      const savedName = state.config.scriptNames[index] ?? "";
      item.innerHTML = `
        <small>Script ${String(index + 1).padStart(2, "0")}</small>
        <input
          type="text"
          class="script-name-input"
          placeholder="${placeholder}"
          value="${savedName}"
          aria-label="Nome do script ${index + 1}"
          maxlength="32"
        />
        <select data-script-length="${index}" aria-label="Tamanho do script ${index + 1}">
          ${[2, 3, 4, 5, 6]
            .map(
              (length) =>
                `<option value="${length}"${length === (currentLengths[index] ?? DEFAULT_CONFIG.scriptLengths[index] ?? 3) ? " selected" : ""}>${length} pacotes</option>`,
            )
            .join("")}
        </select>
      `;
      item.querySelector("select").addEventListener("change", updateSetupReadouts);
      el.scriptLengthList.appendChild(item);
    }
  }

  function getScriptLengths() {
    return state.config.scriptLengths.slice(0, state.config.scriptCount);
  }

  function getCompactedLength(lengths) {
    return lengths.reduce((total, length, index) => total + length - (index > 0 ? 1 : 0), 0);
  }

  function getMinimumBufferLength(lengths, continuity = "blocked") {
    if (continuity === "linked") return getCompactedLength(lengths);
    return lengths.reduce((total, length) => total + length, 0);
  }

  function makeSequence(length = 3) {
    const tokens = activeTokens();
    const sequence = [];
    while (sequence.length < length) {
      const next = randomItem(tokens);
      if (sequence[sequence.length - 1] !== next) {
        sequence.push(next);
      }
    }
    return sequence;
  }

  function buildObjectives() {
    const templates = shuffle(objectiveLibrary).slice(0, state.config.scriptCount);
    const lengths = getScriptLengths();

    state.objectives = templates.map((template, index) => ({
      ...template,
      name: state.config.scriptNames[index]?.trim() || template.name,
      node: template.id,
      route: template.id,
      order: index,
      sequence: makeSequence(lengths[index]),
      complete: false,
    }));

    state.objectives.forEach((objective, index) => {
      if (index > 0 && state.config.sequenceContinuity === "linked") {
        objective.sequence[0] = state.objectives[index - 1].sequence.at(-1);
      } else if (index > 0 && objective.sequence[0] === state.objectives[index - 1].sequence.at(-1)) {
        objective.sequence[0] = activeTokens().find((token) => token !== state.objectives[index - 1].sequence.at(-1)) ?? objective.sequence[0];
      }
    });
  }

  function buildSecondaryObjectives() {
    state.secondaryObjectives = [];
    if (!state.config.secondaryObjectives || !state.map) return;

    const auxNodes = state.map.nodes.filter((node) => node.type === "aux");
    if (auxNodes.length === 0) return;

    state.secondaryObjectives = auxNodes.map((node, index) => ({
      id: node.id,
      nodeId: node.id,
      name: `Script N${index + 1}`,
      label: node.label,
      sequence: makeSequence(2),
      complete: false,
    }));

    auxNodes.forEach((node) => {
      node.hasSecondary = true;
    });
  }

  function makeGrid() {
    const size = state.config.matrixSize;
    const required = getWinningChain();
    const cells = Array.from({ length: size * size }, (_, index) => ({
      row: Math.floor(index / size),
      col: index % size,
      token: randomItem(activeTokens()),
    }));

    const chosenPath = makeMatrixPath(required.length, size);

    required.slice(0, chosenPath.length).forEach((token, index) => {
      const { row, col } = chosenPath[index];
      cells[row * size + col].token = token;
    });

    state.grid = cells;
  }

  function makeMatrixPath(length, size = 6) {
    const targetLength = clamp(length, 1, size * size);
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const path = [{ row: 0, col: Math.floor(Math.random() * size) }];
      const used = new Set([cellKey(path[0])]);
      let phase = "column";

      while (path.length < targetLength) {
        const current = path.at(-1);
        const candidates = [];

        for (let index = 0; index < size; index += 1) {
          const candidate = phase === "column" ? { row: index, col: current.col } : { row: current.row, col: index };
          if (!used.has(cellKey(candidate))) {
            candidates.push(candidate);
          }
        }

        if (candidates.length === 0) break;
        const next = randomItem(candidates);
        path.push(next);
        used.add(cellKey(next));
        phase = phase === "column" ? "row" : "column";
      }

      if (path.length === targetLength) return path;
    }

    return findMatrixPath(targetLength, size);
  }

  function findMatrixPath(length, size = 6) {
    const path = [{ row: 0, col: 0 }];
    const used = new Set([cellKey(path[0])]);

    function countOnwardMoves(cell, nextPhase) {
      let count = 0;
      for (let index = 0; index < size; index += 1) {
        const candidate = nextPhase === "column" ? { row: index, col: cell.col } : { row: cell.row, col: index };
        if (!used.has(cellKey(candidate))) {
          count += 1;
        }
      }
      return count;
    }

    function search(phase) {
      if (path.length === length) return true;
      const current = path.at(-1);
      const nextPhase = phase === "column" ? "row" : "column";
      const candidates = [];

      for (let index = 0; index < size; index += 1) {
        const candidate = phase === "column" ? { row: index, col: current.col } : { row: current.row, col: index };
        if (!used.has(cellKey(candidate))) {
          candidates.push(candidate);
        }
      }

      candidates.sort((a, b) => countOnwardMoves(a, nextPhase) - countOnwardMoves(b, nextPhase));

      for (const candidate of candidates) {
        path.push(candidate);
        used.add(cellKey(candidate));
        if (search(nextPhase)) return true;
        used.delete(cellKey(candidate));
        path.pop();
      }

      return false;
    }

    if (search("column")) return path;
    return path;
  }

  function getWinningChain() {
    return state.objectives.reduce((chain, objective) => {
      if (state.config.sequenceContinuity === "linked" && chain.at(-1) === objective.sequence[0]) {
        return chain.concat(objective.sequence.slice(1));
      }
      return chain.concat(objective.sequence);
    }, []);
  }

  function buildSystemMap() {
    const layoutName = resolveMapLayoutName();
    const layout = mapLayouts[layoutName];
    const nodes = [
      { id: "entry", label: "IN", type: "entry", ...layout.entry },
      ...state.objectives.map((objective, index) => ({
        id: objective.node,
        label: objective.label,
        type: "objective",
        ...layout.objectives[index],
      })),
      ...layout.aux.slice(0, state.config.extraNodes).map((node, index) => ({
        id: `aux-${index}`,
        label: `N${index + 1}`,
        type: "aux",
        hasSecondary: false,
        ...node,
      })),
      { id: "core", label: "CORE", type: "core", ...layout.core },
    ];

    const routes = [];
    const objectiveNodes = nodes.filter((node) => node.type === "objective");
    const entryNode = nodes.find((node) => node.id === "entry");
    const coreNode = nodes.find((node) => node.id === "core");

    objectiveNodes.forEach((node, index) => {
      const from = index === 0 ? entryNode : objectiveNodes[index - 1];
      routes.push({
        id: state.objectives[index].route,
        type: "objective",
        d: makeRoutePath(from, node, index, layoutName),
      });
    });

    routes.push({
      id: "core-link",
      type: "core",
      d: makeRoutePath(objectiveNodes.at(-1) ?? entryNode, coreNode, 6, layoutName),
    });

    nodes
      .filter((node) => node.type === "aux")
      .forEach((node, index) => {
        const anchors = [entryNode, ...objectiveNodes, coreNode];
        routes.push({
          id: `aux-link-${index}`,
          type: "aux",
          d: makeRoutePath(anchors[index % anchors.length], node, index + 8, layoutName),
        });
      });

    state.map = { layout: layoutName, nodes, routes, coreRoute: "core-link" };
  }

  function resolveMapLayoutName() {
    if (state.config.mapLayout !== "auto") return state.config.mapLayout;
    const heavy = ["mesh", "ring", "split", "cluster", "star"];
    const light = ["spine", "mesh", "split", "star", "cluster"];
    const options = state.config.scriptCount >= 4 ? heavy : light;
    if (state.config.extraNodes >= 3 && options.includes("ring")) return "ring";
    return randomItem(options);
  }

  function makeRoutePath(from, to, index, layoutName) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const scales = { mesh: 34, ring: 52, split: 46, spine: 28, cluster: 38, star: 22 };
    const bendScale = scales[layoutName] ?? 28;
    const bend = (index % 2 === 0 ? 1 : -1) * bendScale;
    const c1x = from.x + dx * 0.34 + bend;
    const c1y = from.y + dy * 0.16;
    const c2x = from.x + dx * 0.68 - bend;
    const c2y = from.y + dy * 0.84;
    return `M${from.x} ${from.y} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${to.x} ${to.y}`;
  }

  function renderMap() {
    const routes = state.map.routes
      .map((route) => `<path class="route route-${route.type}" data-route="${route.id}" d="${route.d}" />`)
      .join("");
    const nodes = state.map.nodes
      .map((node) => {
        const radius = node.type === "core" ? 26 : 23;
        let extraClass = "";
        if (node.type === "aux") {
          extraClass = node.hasSecondary ? " is-secondary" : " is-muted";
        }
        return `
          <g class="node node-${node.type}${extraClass}" data-node="${node.id}">
            <circle cx="${node.x}" cy="${node.y}" r="${radius}" />
            <text x="${node.x}" y="${node.y + 6}">${node.label}</text>
          </g>
        `;
      })
      .join("");

    el.networkMap.innerHTML = `
      <svg viewBox="0 0 420 560" role="img" aria-labelledby="mapTitle mapDesc">
        <title id="mapTitle">Mapa de rede do Nexus Breach</title>
        <desc id="mapDesc">Mapa ${state.map.layout} com ${state.objectives.length} scripts e ${state.config.extraNodes} nos auxiliares.</desc>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        ${routes}
        ${nodes}
      </svg>
      <div id="mapMessage" class="map-message" aria-live="polite"></div>
    `;
  }

  function resetRound() {
    clearInterval(state.tickId);
    updateSetupReadouts();
    state.config = readSetupConfig();
    state.buffer = [];
    state.selected.clear();
    state.secondaryObjectives = [];
    state.nextObjectiveIndex = 0;
    state.running = false;
    state.over = false;
    state.timeLeft = state.config.timeLimit;
    state.trace = 0;
    state.phase = "column";
    state.lastCell = null;
    el.log.innerHTML = "";
    buildObjectives();
    buildSystemMap();
    buildSecondaryObjectives();
    makeGrid();
    renderMap();
    renderAll();
    resetMap();
    const auxInfo = state.secondaryObjectives.length > 0 ? `; ${state.secondaryObjectives.length} secundarios` : "";
    addLog(`handshake pronto; ${state.objectives.length} scripts em mapa ${state.map.layout}${auxInfo}`, "warn");
    showOverlay(
      "PROTOCOLO ARMADO",
      allowSetup ? "Entrar no sistema" : "Desafio do mestre",
      allowSetup
        ? "Combine os pacotes na ordem dos scripts. A continuidade entre scripts vem bloqueada por padrao para exigir cada sequencia completa."
        : state.config.sequenceContinuity === "linked"
          ? "O mestre preparou esta invasao. Scripts podem continuar pelo ultimo codigo capturado; depois alterne coluna e linha."
          : "O mestre preparou esta invasao. Cada script exige sua propria sequencia completa; nao ha continuidade pelo ultimo codigo.",
      "Iniciar invasao",
      true,
    );
  }

  // Difficulty-derived trace economy. Mistakes and the per-second drain climb
  // super-linearly with the configured trace rate, so Critical bites noticeably
  // harder than a flat 2x; success rewards scale up in step so cleanly breaking
  // scripts and the core code still pays back the extra heat. Easier rates
  // (Lenta/Normal) keep their original linear, flat-reward behaviour because the
  // super-linear term only kicks in above 1.0x.
  function traceFactors() {
    const rate = state.config.traceRate;
    const over = Math.max(0, rate - 1);
    return {
      rate,
      pressure: rate * (1 + over * 0.4), // mistakes: axis violation / rejected packet
      drain: rate * (1 + over * 0.2),    // per-second rastreio
      reward: 1 + over * 0.6,            // breaking scripts / core code
    };
  }

  function startRound() {
    state.running = true;
    state.over = false;
    el.shell.classList.add("is-running");
    addLog("invasao iniciada; trace ativo", "warn");
    state.tickId = setInterval(() => {
      state.timeLeft -= 1;
      state.trace = Math.min(100, state.trace + 0.42 * traceFactors().drain);
      if (state.timeLeft <= 0) {
        failRound("tempo esgotado");
      } else if (state.trace >= 100) {
        failRound("rastreio completo");
      }
      renderStatus();
    }, 1000);
    renderAll();
  }

  function showOverlay(kicker, title, text, buttonText, showSetup = false) {
    el.overlayKicker.textContent = kicker;
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.primaryAction.textContent = buttonText;
    el.setupForm.classList.toggle("is-hidden", !(showSetup && allowSetup));
    el.shell.classList.remove("is-running");
  }

  function showMapMessage(kicker, title, text) {
    const message = root.querySelector("#mapMessage");
    if (!message) return;
    message.innerHTML = `
      <span>${kicker}</span>
      <strong>${title}</strong>
      <small>${text}</small>
    `;
    message.classList.add("is-visible");
  }

  function clearMapMessage() {
    const message = root.querySelector("#mapMessage");
    if (!message) return;
    message.classList.remove("is-visible");
    message.innerHTML = "";
  }

  function failRound(reason) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    clearInterval(state.tickId);
    addLog(`conexao encerrada: ${reason}`, "bad");
    showOverlay("ACESSO NEGADO", "Trace detectado", "O sistema isolou a rota de entrada. Reconfigure a invasao ou tente outra matriz.", "Configurar nova invasao");
    emitResult("fail", reason);
  }

  function winRound() {
    if (state.over) return;
    state.over = true;
    state.running = false;
    clearInterval(state.tickId);
    state.trace = Math.max(0, state.trace - 8);
    root.querySelector(`[data-route="${state.map.coreRoute}"]`)?.classList.remove("is-available");
    root.querySelector(`[data-route="${state.map.coreRoute}"]`)?.classList.add("is-live");
    root.querySelector('[data-node="core"]').classList.remove("is-next");
    root.querySelector('[data-node="core"]').classList.add("is-live", "is-open");
    el.signalStatus.textContent = "root";
    el.signalText.textContent = "Nucleo aberto. Sessao fantasma estabelecida.";
    addLog("core aberto; permissao root obtida", "good");
    showMapMessage("ACESSO CONCEDIDO", "Sistema invadido", "Nucleo sob controle. Use reiniciar para configurar outra invasao.");
    renderStatus();
    emitResult("win", "nucleo aberto");
  }

  function isValidCell(cell) {
    if (!state.running || state.over || state.selected.has(cellKey(cell))) return false;
    if (!state.lastCell) return cell.row === 0;
    if (state.phase === "column") return cell.col === state.lastCell.col;
    return cell.row === state.lastCell.row;
  }

  function cellKey(cell) {
    return `${cell.row}:${cell.col}`;
  }

  function pickCell(cell) {
    if (!isValidCell(cell)) {
      if (state.running && !state.over) {
        state.trace = Math.min(100, state.trace + 2.5 * traceFactors().pressure);
        addLog("pacote rejeitado; regra de eixo violada", "bad");
        renderAll();
      }
      return;
    }

    const hadPreviousCell = Boolean(state.lastCell);
    state.buffer.push(cell.token);
    state.selected.add(cellKey(cell));
    state.lastCell = cell;
    state.phase = hadPreviousCell && state.phase === "column" ? "row" : "column";
    state.trace = Math.min(100, state.trace + 1.1 * state.config.traceRate);
    addLog(`capturado ${cell.token} em R${cell.row + 1}:C${cell.col + 1}`);
    checkObjectives();
    checkSecondaryObjectives();

    if (state.buffer.length >= state.config.bufferSize && !allObjectivesComplete()) {
      failRound("buffer saturado");
    }

    renderAll();
  }

  function checkObjectives() {
    const objective = state.objectives[state.nextObjectiveIndex];
    if (!objective || objective.complete) return;

    if (containsSequence(state.buffer, objective.sequence)) {
      objective.complete = true;
      state.nextObjectiveIndex += 1;
      const relief = Math.round(6 * traceFactors().reward);
      state.trace = Math.max(0, state.trace - relief);
      activateObjective(objective);
      addLog(`${objective.name.toLowerCase()} desbloqueado; trace -${relief}`, "good");
    }

    if (allObjectivesComplete()) {
      winRound();
    }
  }

  function checkSecondaryObjectives() {
    state.secondaryObjectives.forEach((obj) => {
      if (obj.complete) return;
      if (containsSequence(state.buffer, obj.sequence)) {
        obj.complete = true;
        const relief = Math.round(10 * traceFactors().reward);
        state.trace = Math.max(0, state.trace - relief);
        activateSecondaryObjective(obj);
        addLog(`script auxiliar ${obj.label} capturado; trace -${relief}`, "good");
      }
    });
  }

  function containsSequence(buffer, sequence) {
    if (sequence.length > buffer.length) return false;
    for (let start = 0; start <= buffer.length - sequence.length; start += 1) {
      const slice = buffer.slice(start, start + sequence.length);
      if (slice.every((token, index) => token === sequence[index])) return true;
    }
    return false;
  }

  function allObjectivesComplete() {
    return state.objectives.every((objective) => objective.complete);
  }

  function activateObjective(objective) {
    const route = root.querySelector(`[data-route="${objective.route}"]`);
    const node = root.querySelector(`[data-node="${objective.node}"]`);
    route?.classList.remove("is-available");
    route?.classList.add("is-live");
    node?.classList.remove("is-next");
    node?.classList.add("is-live", "is-open");

    const nextObjective = state.objectives[state.nextObjectiveIndex];
    if (nextObjective) {
      markNextRoute(nextObjective.route, nextObjective.node);
    } else {
      markNextRoute(state.map.coreRoute, "core");
    }

    el.signalStatus.textContent = objective.id;
    el.signalText.textContent = `${objective.detail}. Proxima camada exposta.`;
  }

  function activateSecondaryObjective(obj) {
    const node = root.querySelector(`[data-node="${obj.nodeId}"]`);
    node?.classList.remove("is-secondary");
    node?.classList.add("is-secondary-done");

    const routeIndex = obj.nodeId.replace("aux-", "");
    root.querySelector(`[data-route="aux-link-${routeIndex}"]`)?.classList.add("is-secondary-live");
  }

  function resetMap() {
    clearMapMessage();
    root.querySelectorAll(".route").forEach((route) => route.classList.remove("is-live", "is-available", "is-secondary-live"));
    root.querySelectorAll(".node").forEach((node) => node.classList.remove("is-live", "is-open", "is-next", "is-secondary-done"));
    root.querySelector(".node-entry")?.classList.add("is-live");
    const firstObjective = state.objectives[0];
    if (firstObjective) {
      markNextRoute(firstObjective.route, firstObjective.node);
    }
    el.signalStatus.textContent = "standby";
    el.signalText.textContent = "Capture os scripts para abrir caminho ate o nucleo.";
  }

  function markNextRoute(routeId, nodeId) {
    root.querySelector(`[data-route="${routeId}"]`)?.classList.add("is-available");
    root.querySelector(`[data-node="${nodeId}"]`)?.classList.add("is-next");
  }

  function purgeBuffer() {
    if (!state.running || state.over) return;
    state.buffer = [];
    state.selected.clear();
    state.lastCell = null;
    state.phase = "column";
    state.trace = Math.min(100, state.trace + 4 * state.config.traceRate);
    addLog("buffer limpo; matriz mantida", "warn");
    renderAll();
  }

  function scanMatrix() {
    if (!state.running || state.over) return;
    state.buffer = [];
    state.selected.clear();
    state.lastCell = null;
    state.phase = "column";
    state.trace = Math.min(100, state.trace + 12 * state.config.traceRate);
    makeGrid();
    addLog("nova matriz recebida; trace elevado", "warn");
    renderAll();
  }

  function renderAll() {
    renderMatrix();
    renderObjectives();
    renderBuffer();
    renderStatus();
    renderTurnHint();
    el.scanBtn.disabled = !state.running || state.over;
    el.purgeBtn.disabled = !state.running || state.over || state.buffer.length === 0;
  }

  function renderMatrix() {
    const size = state.config.matrixSize;
    el.matrixWrap.style.setProperty("--matrix-size", size);

    el.axisTop.innerHTML = Array.from({ length: size }, (_, i) => `<span>C${i + 1}</span>`).join("");
    el.axisLeft.innerHTML = Array.from({ length: size }, (_, i) => `<span>R${i + 1}</span>`).join("");

    el.matrix.innerHTML = "";
    state.grid.forEach((cell) => {
      const button = document.createElement("button");
      button.className = "cell";
      button.type = "button";
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `Pacote ${cell.token}, linha ${cell.row + 1}, coluna ${cell.col + 1}`);
      button.dataset.row = cell.row;
      button.dataset.col = cell.col;
      button.innerHTML = `<strong>${cell.token}</strong>`;
      if (state.selected.has(cellKey(cell))) button.classList.add("is-selected");
      if (isValidCell(cell)) button.classList.add("is-valid");
      if (state.running && !isValidCell(cell) && !state.selected.has(cellKey(cell))) button.classList.add("is-invalid");
      button.addEventListener("click", () => pickCell(cell));
      el.matrix.appendChild(button);
    });
  }

  function renderObjectives() {
    el.objectives.innerHTML = "";

    state.objectives.forEach((objective, index) => {
      const item = document.createElement("article");
      const isNext = !objective.complete && index === state.nextObjectiveIndex;
      const status = objective.complete ? "OPEN" : isNext ? "NEXT" : "LOCKED";
      item.className = `objective${objective.complete ? " is-complete" : ""}${isNext ? " is-next" : ""}`;
      item.innerHTML = `
        <div class="objective-head">
          <span>${String(index + 1).padStart(2, "0")} // ${objective.name}</span>
          <span>${status}</span>
        </div>
        <div class="sequence">
          ${objective.sequence.map((token) => `<span class="token">${token}</span>`).join("")}
        </div>
      `;
      el.objectives.appendChild(item);
    });

    if (state.secondaryObjectives.length > 0) {
      const divider = document.createElement("p");
      divider.className = "objectives-divider";
      divider.textContent = "Scripts Auxiliares";
      el.objectives.appendChild(divider);

      state.secondaryObjectives.forEach((obj) => {
        const item = document.createElement("article");
        item.className = `objective objective-secondary${obj.complete ? " is-complete" : ""}`;
        item.innerHTML = `
          <div class="objective-head">
            <span>${obj.label} // ${obj.name}</span>
            <span>${obj.complete ? "OPEN" : "BONUS"}</span>
          </div>
          <div class="sequence">
            ${obj.sequence.map((token) => `<span class="token">${token}</span>`).join("")}
          </div>
        `;
        el.objectives.appendChild(item);
      });
    }
  }

  function renderBuffer() {
    el.bufferCount.textContent = `${state.buffer.length}/${state.config.bufferSize}`;
    el.bufferSlots.style.setProperty("--buffer-size", state.config.bufferSize);
    el.bufferSlots.innerHTML = "";
    for (let index = 0; index < state.config.bufferSize; index += 1) {
      const slot = document.createElement("span");
      slot.className = `buffer-slot${state.buffer[index] ? " is-filled" : ""}`;
      slot.textContent = state.buffer[index] ?? "--";
      el.bufferSlots.appendChild(slot);
    }
  }

  function renderStatus() {
    const minutes = Math.floor(Math.max(0, state.timeLeft) / 60);
    const seconds = Math.max(0, state.timeLeft) % 60;
    el.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    el.traceReadout.textContent = `${Math.round(state.trace).toString().padStart(2, "0")}%`;
    el.traceFill.style.width = `${Math.min(100, state.trace)}%`;
  }

  function renderTurnHint() {
    if (state.over && allObjectivesComplete()) {
      el.turnHint.textContent = "Sistema invadido";
      return;
    }
    if (state.over) {
      el.turnHint.textContent = "Conexao encerrada";
      return;
    }
    if (!state.running) {
      el.turnHint.textContent = "Aguardando inicio";
      return;
    }
    if (!state.lastCell) {
      el.turnHint.textContent = "Primeiro pacote: linha superior";
      return;
    }
    const axis = state.phase === "column" ? `coluna C${state.lastCell.col + 1}` : `linha R${state.lastCell.row + 1}`;
    el.turnHint.textContent = `Proximo pacote: mesma ${axis}`;
  }

  function addLog(message, tone = "") {
    const entry = document.createElement("p");
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    entry.className = tone;
    entry.textContent = `[${stamp}] ${message}`;
    el.log.prepend(entry);
    while (el.log.children.length > 9) {
      el.log.lastElementChild.remove();
    }
  }

  function initBackdrop() {
    const canvas = el.canvas;
    const ctx = canvas.getContext("2d");
    const particles = [];
    const lines = [];
    let W = 0;
    let H = 0;

    function dims() {
      // Size to the wrapper (root) rather than the viewport.
      return { w: root.clientWidth || canvas.clientWidth || 1, h: root.clientHeight || canvas.clientHeight || 1 };
    }

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const d = dims();
      W = d.w;
      H = d.h;
      canvas.width = Math.floor(W * ratio);
      canvas.height = Math.floor(H * ratio);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles.length = 0;
      lines.length = 0;

      const count = Math.floor((W * H) / 26000);
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: 0.18 + Math.random() * 0.45,
          vy: -0.08 + Math.random() * 0.16,
          size: 1 + Math.random() * 2.5,
          color: Math.random() > 0.72 ? "rgba(255,189,74,0.72)" : "rgba(70,244,255,0.64)",
        });
      }

      for (let i = 0; i < 34; i += 1) {
        lines.push({
          x: Math.random() * W,
          y: Math.random() * H,
          length: 80 + Math.random() * 190,
          speed: 0.5 + Math.random() * 1.8,
          hue: Math.random() > 0.75 ? "255,189,74" : "70,244,255",
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      lines.forEach((line) => {
        const gradient = ctx.createLinearGradient(line.x, line.y, line.x + line.length, line.y);
        gradient.addColorStop(0, `rgba(${line.hue},0)`);
        gradient.addColorStop(0.5, `rgba(${line.hue},0.18)`);
        gradient.addColorStop(1, `rgba(${line.hue},0)`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x + line.length, line.y);
        ctx.stroke();
        line.x += line.speed;
        if (line.x > W + line.length) {
          line.x = -line.length;
          line.y = Math.random() * H;
        }
      });

      particles.forEach((particle) => {
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x > W) particle.x = 0;
        if (particle.y < 0) particle.y = H;
        if (particle.y > H) particle.y = 0;
      });

      state.pulseId = requestAnimationFrame(draw);
    }

    on(window, "resize", resize);
    resize();
    draw();
  }

  function initSetupControls() {
    applyConfigToForm(allowSetup ? pendingConfig || state.config : pendingConfig);
    el.scriptCount.addEventListener("input", () => {
      syncScriptLengthControls();
      updateSetupReadouts();
    });
    el.extraNodes.addEventListener("input", updateSetupReadouts);
    [el.timeLimit, el.bufferSize, el.mapLayout, el.matrixSize, el.traceRate, el.tokenSet, el.sequenceContinuity, el.secondaryObjectives].forEach((input) => {
      input.addEventListener("change", updateSetupReadouts);
    });
    updateSetupReadouts();
  }

  function bindControls() {
    el.primaryAction.addEventListener("click", () => {
      if (state.over) {
        resetRound();
        return;
      }
      resetRound();
      startRound();
    });

    el.restartBtn.addEventListener("click", resetRound);
    el.scanBtn.addEventListener("click", scanMatrix);
    el.purgeBtn.addEventListener("click", purgeBuffer);
  }

  function onKeydown(event) {
    // Ignore shortcuts while the player is typing into the setup form.
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key.toLowerCase() === "r") resetRound();
    if (event.key === "Escape") purgeBuffer();
  }

  // mount(container, { showSetup, config })
  //   showSetup: true  -> GM/standalone, the setup form is editable (default).
  //   showSetup: false -> player, plays the GM `config` with the form hidden.
  function mount(container, opts = {}) {
    if (!container) return;
    if (root) unmount();
    root = container;
    allowSetup = opts.showSetup !== false;
    pendingConfig = opts.config || null;
    onResult = typeof opts.onResult === "function" ? opts.onResult : null;
    root.innerHTML = NEXUS_MARKUP;
    resolveEl();
    bindControls();
    on(window, "keydown", onKeydown);
    initSetupControls();
    initBackdrop();
    resetRound();
  }

  function unmount() {
    clearInterval(state.tickId);
    cancelAnimationFrame(state.pulseId);
    state.tickId = null;
    state.pulseId = null;
    listeners.forEach(({ target, type, fn, opts }) => target.removeEventListener(type, fn, opts));
    listeners = [];
    if (root) root.innerHTML = "";
    el = {};
    root = null;
    allowSetup = true;
    pendingConfig = null;
    onResult = null;
  }

  // Returns the challenge config the GM is composing in the form, normalized
  // so it can be persisted via the API and replayed by a player.
  function readConfig() {
    return allowSetup ? normalizeConfig(readFormConfig()) : normalizeConfig(pendingConfig);
  }

  window.NexusBreach = { mount, unmount, isMounted: () => !!root, readConfig };
})();
