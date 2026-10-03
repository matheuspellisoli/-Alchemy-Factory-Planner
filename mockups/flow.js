// Protótipo estático do novo fluxo (HTML + SVG). Dados fixos do plano
// "Growth Potion 12/min"; nada aqui recalcula o plano de verdade.

const LAYOUT = document.body.dataset.layout; // "columns" | "clusters"

const I = (name) => `../static/icons/items/${name}.png`;
const D = (name) => `../static/icons/devices/${name}.png`;

const LANES = {
  brine: { name: "Brine", color: "#63b8ff" },
  chamomile: { name: "Chamomile Powder", color: "#d5a6ff" },
  clay: { name: "Clay Powder", color: "#f0b35b" },
  final: { name: "Receita final", color: "#5dd3c8" },
  raw: { name: "Entrada", color: "#f0b35b" }
};

const BELT_RATE = 60;
const FUELS = ["Coal", "Charcoal", "Coke", "Logs", "Plank"];

const BASE_NODES = [
  { id: "gp", type: "process", lane: "final", item: "Growth Potion", icon: I("growth-potion"), machine: "Advanced Blender", machineIcon: D("advanced-blender"), count: 1.2, rate: 12, load: 1, recipes: ["Growth Potion", "Growth Potion (alt.)"], seconds: 6 },
  { id: "chp", type: "process", lane: "chamomile", item: "Chamomile Powder", icon: I("chamomile-powder"), machine: "Grinder", machineIcon: D("grinder"), count: 1.2, rate: 24, load: 1, recipes: ["Chamomile Powder"], seconds: 3 },
  { id: "cha", type: "process", lane: "chamomile", item: "Chamomile", icon: I("chamomile"), machine: "Nursery", machineIcon: D("nursery"), count: 3.2, rate: 24, load: 1, recipes: ["Chamomile"], seconds: 1120 },
  { id: "clp", type: "process", lane: "clay", item: "Clay Powder", icon: I("clay-powder"), machine: "Grinder", machineIcon: D("grinder"), count: 4.8, rate: 72, load: 1, recipes: ["Clay Powder"], seconds: 4 },
  { id: "cla", type: "process", lane: "clay", item: "Clay", icon: I("clay"), machine: "Assembler", machineIcon: D("assembler"), count: 4.8, rate: 72, load: 1, recipes: ["Clay"], seconds: 4 },
  { id: "chap", type: "process", lane: "clay", item: "Charcoal Powder", icon: I("charcoal-powder"), machine: "Grinder", machineIcon: D("grinder"), count: 9.6, rate: 144, load: 1, recipes: ["Charcoal Powder"], seconds: 4 },
  { id: "char", type: "process", lane: "clay", item: "Charcoal", icon: I("charcoal"), machine: "Crucible", machineIcon: D("crucible"), count: 9.6, rate: 144, load: 1, recipes: ["Charcoal", "Coke and Charcoal"], fuel: "Coal", seconds: 4 },
  { id: "pla", type: "process", lane: "clay", item: "Plank", icon: I("plank"), machine: "Table Saw", machineIcon: D("table-saw"), count: 4.8, rate: 144, load: 1, recipes: ["Plank"], seconds: 2 },
  { id: "coal", type: "process", lane: "clay", item: "Coal", icon: I("coal"), machine: "Stone Crusher", machineIcon: D("stone-crusher"), count: 0.48, rate: 9.6, load: 1, recipes: ["Coal", "Stone and Coal"], seconds: 3 },
  { id: "sand", type: "process", lane: "clay", item: "Sand", icon: I("sand"), machine: "Stone Crusher", machineIcon: D("stone-crusher"), count: 28.8, rate: 288, load: 1, recipes: ["Salt and Sand", "Salt and Sand 2", "Sand"], waste: [["Salt", 288, I("salt")]], seconds: 600 },
  { id: "brine", type: "process", lane: "brine", item: "Brine", icon: I("brine"), machine: "Extractor", machineIcon: D("extractor"), count: 3.2, rate: 960, load: 1, recipes: ["Brine"], seconds: 2 },
  { id: "salt", type: "process", lane: "brine", item: "Salt", icon: I("salt"), machine: "Stone Crusher", machineIcon: D("stone-crusher"), count: 4.8, rate: 48, load: 1, recipes: ["Salt and Sand", "Salt and Sand 2"], waste: [["Sand", 48, I("sand")]], seconds: 600 },
  { id: "seeds", type: "raw", lane: "chamomile", item: "Chamomile Seeds", icon: I("chamomile-seeds"), rate: 0.17 },
  { id: "logs", type: "raw", lane: "clay", item: "Logs", icon: I("logs"), rate: 0.72 },
  { id: "coalore", type: "raw", lane: "clay", item: "Coal Ore", icon: I("coal-ore"), rate: 0.08 },
  { id: "rocksalt", type: "raw", lane: "clay", item: "Rock Salt", icon: I("rock-salt"), rate: 3.36 },
  { id: "out", type: "output", lane: "final", item: "Growth Potion", icon: I("growth-potion"), rate: 12 }
];

// [de, para, item, taxa/min, combustível?]
const BASE_EDGES = [
  ["seeds", "cha", "Chamomile Seeds", 0.17],
  ["cha", "chp", "Chamomile", 24],
  ["chp", "gp", "Chamomile Powder", 24],
  ["logs", "pla", "Logs", 0.72],
  ["pla", "char", "Plank", 144],
  ["coalore", "coal", "Coal Ore", 0.08],
  ["coal", "char", "Coal", 9.6, true],
  ["char", "chap", "Charcoal", 144],
  ["chap", "cla", "Charcoal Powder", 144],
  ["rocksalt", "sand", "Rock Salt", 2.88],
  ["sand", "cla", "Sand", 288],
  ["cla", "clp", "Clay", 72],
  ["clp", "gp", "Clay Powder", 72],
  ["rocksalt", "salt", "Rock Salt", 0.48],
  ["salt", "brine", "Salt", 48],
  ["brine", "gp", "Brine", 960],
  ["gp", "out", "Growth Potion", 12]
];

const COL = 520;
const ITEM_OFFSET = 310; // distância do nó de item para a máquina que o produz
const ROW = 170;

// Posições em (coluna, linha). Clusters duplicam Rock Salt por subcadeia.
const LAYOUTS = {
  columns: {
    positions: {
      salt: [4, -0.25], brine: [5, -0.25],
      seeds: [3, 1], cha: [4, 1], chp: [5, 1],
      rocksalt: [2, 1.6],
      gp: [6, 2], out: [7, 2],
      sand: [3, 2.5], cla: [4, 3], clp: [5, 3],
      logs: [0, 3.75], pla: [1, 3.75], char: [2, 3.75], chap: [3, 3.75],
      coalore: [0, 4.85], coal: [1, 4.85]
    }
  },
  clusters: {
    split: { rocksalt: ["salt", "sand"] },
    positions: {
      "rocksalt@salt": [3, 0], salt: [4, 0], brine: [5, 0],
      seeds: [3, 1.75], cha: [4, 1.75], chp: [5, 1.75],
      logs: [0, 3.25], pla: [1, 3.25], char: [2, 3.25], chap: [3, 3.25],
      coalore: [0, 4.35], coal: [1, 4.35],
      "rocksalt@sand": [2, 5.05], sand: [3, 4.75],
      cla: [4, 3.85], clp: [5, 3.85],
      gp: [6.4, 2.1], out: [7.4, 2.1]
    },
    groups: [
      { lane: "brine", root: "brine" },
      { lane: "chamomile", root: "chp" },
      { lane: "clay", root: "clp" },
      { lane: "final", root: "out", noCollapse: true }
    ]
  }
};

// ---------- montar grafo ----------
function buildGraph() {
  const layout = LAYOUTS[LAYOUT];
  let nodes = BASE_NODES.map((node) => ({ ...node }));
  let edges = BASE_EDGES.map(([from, to, item, rate, fuel]) => ({ from, to, item, rate, fuel: !!fuel }));

  Object.entries(layout.split || {}).forEach(([id, consumers]) => {
    const original = nodes.find((node) => node.id === id);
    nodes = nodes.filter((node) => node.id !== id);
    consumers.forEach((consumer) => {
      const lane = nodes.find((node) => node.id === consumer).lane;
      const edge = edges.find((entry) => entry.from === id && entry.to === consumer);
      nodes.push({ ...original, id: `${id}@${consumer}`, lane, rate: edge.rate });
      edge.from = `${id}@${consumer}`;
    });
  });

  nodes.forEach((node) => {
    const [col, row] = layout.positions[node.id];
    node.x = col * COL;
    node.desiredY = row * ROW;
    node.y = node.desiredY;
  });

  // Entre duas máquinas entra um nó de item: saída de uma, entrada da outra.
  nodes.filter((node) => node.type === "process").forEach((machine) => {
    const consumers = edges.filter((edge) => edge.from === machine.id);
    const intoOutput = consumers.every((edge) => nodes.find((n) => n.id === edge.to).type === "output");
    const extra = { lane: machine.lane, producer: machine.id, x: machine.x + ITEM_OFFSET, desiredY: machine.desiredY, y: machine.desiredY };
    if (!intoOutput) {
      const itemId = `item:${machine.id}`;
      nodes.push({ ...extra, id: itemId, type: "item", item: machine.item, icon: machine.icon, rate: machine.rate });
      consumers.forEach((edge) => { edge.from = itemId; });
      edges.push({ from: machine.id, to: itemId, item: machine.item, rate: machine.rate, fuel: false });
    }
    (machine.waste || []).forEach(([item, rate, icon]) => {
      const wasteId = `waste:${machine.id}:${item}`;
      nodes.push({ ...extra, id: wasteId, type: "waste", item, icon, rate });
      edges.push({ from: machine.id, to: wasteId, item, rate, fuel: false, waste: true });
    });
  });
  return { nodes, edges, groups: layout.groups || [] };
}

const graph = buildGraph();
const byId = new Map(graph.nodes.map((node) => [node.id, node]));
const ui = { collapsed: new Set(), hover: "", selected: "", scale: 1, x: 0, y: 0 };

// ---------- consultas no grafo ----------
const incoming = (id) => graph.edges.filter((edge) => edge.to === id);
const outgoing = (id) => graph.edges.filter((edge) => edge.from === id);

function walk(id, step) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    step(stack.pop()).forEach((next) => {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    });
  }
  return seen;
}
const upstream = (id) => walk(id, (n) => incoming(n).map((edge) => edge.from));
const downstream = (id) => walk(id, (n) => outgoing(n).map((edge) => edge.to));

// Um nó some quando todos os seus consumidores estão ocultos ou recolhidos.
function hiddenNodes() {
  const hidden = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    graph.nodes.forEach((node) => {
      if (hidden.has(node.id)) return;
      const consumers = outgoing(node.id).map((edge) => edge.to);
      const orphan = node.producer && hidden.has(node.producer);
      if (orphan || (consumers.length && consumers.every((to) => hidden.has(to) || ui.collapsed.has(to)))) {
        hidden.add(node.id);
        changed = true;
      }
    });
  }
  return hidden;
}

function highlightSet() {
  const focus = ui.hover || ui.selected;
  if (!focus) return null;
  return new Set([focus, ...upstream(focus), ...downstream(focus)]);
}

// ---------- formatação ----------
const fmt = (value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const laneColor = (node) => (node.type === "raw" ? LANES.raw.color : LANES[node.lane].color);
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- render ----------
const stage = document.querySelector(".stage");
const world = document.querySelector(".world");
const svg = document.querySelector(".edges");
const nodeLayer = document.querySelector(".nodes");
const groupLayer = document.querySelector(".groups");
const details = document.querySelector(".details");

function ioRow(dir, item, rate, extra = "") {
  const icon = byId.get([...byId.keys()].find((id) => byId.get(id).item === item))?.icon || "";
  return `
    <div class="io-row ${dir} ${extra}">
      <span class="port ${dir}" data-item="${esc(item)}"></span>
      ${icon ? `<img src="${icon}" alt="" />` : ""}
      <span class="io-name">${esc(item)}</span>
      <span class="io-rate">${fmt(rate)}/min</span>
    </div>`;
}

function nodeHtml(node, hidden) {
  const lane = laneColor(node);
  const hiddenUp = ui.collapsed.has(node.id) ? [...upstream(node.id)].filter((id) => hidden.has(id) && byId.get(id).type === "process") : [];
  const hiddenRaw = ui.collapsed.has(node.id) ? [...upstream(node.id)].filter((id) => hidden.has(id)).map((id) => byId.get(id)).filter((entry) => entry.type === "raw") : [];
  const canCollapse = incoming(node.id).length > 0 && node.type === "process";

  if (node.type === "item" || node.type === "waste") {
    const belts = Math.ceil(node.rate / BELT_RATE);
    return `
      <div class="node item ${node.type}" data-id="${node.id}" style="--lane:${lane};left:${node.x}px;top:${node.y}px">
        <span class="port in" data-item="${esc(node.item)}"></span>
        ${node.type === "item" ? `<span class="port out" data-item="${esc(node.item)}"></span>` : ""}
        <img class="item-icon" src="${node.icon}" alt="" />
        <strong>${esc(node.item)}</strong>
        <span class="rate">${fmt(node.rate)}/min</span>
        <span class="item-meta">${node.type === "waste" ? "sobra · sem destino" : `${belts} esteira${belts === 1 ? "" : "s"}`}</span>
      </div>`;
  }

  if (node.type === "raw" || node.type === "output") {
    return `
      <div class="node ${node.type}" data-id="${node.id}" style="--lane:${lane};left:${node.x}px;top:${node.y}px">
        <span class="port ${node.type === "raw" ? "out" : "in"}" data-item="${esc(node.item)}"></span>
        <div class="node-head">
          <span class="node-icon"><img src="${node.icon}" alt="" /></span>
          <div class="node-title">
            <strong>${esc(node.item)}</strong>
            <span><span class="rate">${fmt(node.rate)}/min</span> ${node.type === "raw" ? "entrada" : "saída"}</span>
          </div>
        </div>
      </div>`;
  }

  const inputs = incoming(node.id);
  const toolbar = `
    <div class="node-toolbar">
      ${canCollapse ? `<button data-act="collapse" title="Recolher/expandir entradas">${ui.collapsed.has(node.id) ? "⊞ Expandir" : "⊟ Recolher"}</button>` : ""}
      <button data-act="details" title="Detalhes">ⓘ</button>
    </div>`;

  return `
    <div class="node process" data-id="${node.id}" style="--lane:${lane};left:${node.x}px;top:${node.y}px">
      ${toolbar}
      <div class="node-head">
        <span class="node-icon machine"><img src="${node.machineIcon}" alt="" /></span>
        <div class="node-title">
          <strong>${esc(node.machine)}</strong>
          <span class="node-product"><img src="${node.icon}" alt="" />${esc(node.recipes[0])}</span>
        </div>
        <span class="count-badge" title="${fmt(node.count)} máquinas (${Math.ceil(node.count)} arredondado)">×${fmt(node.count)}</span>
      </div>
      <div class="load-line">
        <div class="load"><span style="width:${node.load * 100}%"></span></div>
        <span>${Math.round(node.load * 100)}%</span>
      </div>
      <div class="io">
        <div class="io-title">Entradas</div>
        ${inputs.map((edge) => ioRow("in", edge.item, edge.rate, `${edge.fuel ? "fuel" : ""} ${hidden.has(edge.from) ? "hidden-src" : ""}`)).join("")}
        <div class="io-title out">Saídas</div>
        ${ioRow("out", node.item, node.rate)}
        ${(node.waste || []).map(([item, rate]) => ioRow("out", item, rate, "waste")).join("")}
      </div>
      ${node.recipes.length > 1 ? `
        <div class="node-row">
          <label>Receita</label>
          <select data-recipe="${node.id}">${node.recipes.map((r, i) => `<option ${i === 0 ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>
        </div>` : ""}
      ${node.fuel ? `
        <div class="node-row">
          <label>🔥 Comb.</label>
          <select data-fuel="${node.id}">${FUELS.map((f) => `<option ${f === node.fuel ? "selected" : ""}>${f}</option>`).join("")}</select>
        </div>` : ""}
      ${hiddenUp.length ? `
        <span class="chip collapsed" data-act="collapse" title="Expandir">
          ▸ ${hiddenUp.length} máquina${hiddenUp.length === 1 ? "" : "s"} oculta${hiddenUp.length === 1 ? "" : "s"}
          ${hiddenRaw.map((raw) => `<img src="${raw.icon}" alt="${esc(raw.item)}" title="${esc(raw.item)}" />`).join("")}
        </span>` : ""}
    </div>`;
}

function render() {
  const hidden = hiddenNodes();
  const visible = graph.nodes.filter((node) => !hidden.has(node.id));
  nodeLayer.innerHTML = visible.map((node) => nodeHtml(node, hidden)).join("");
  nodeLayer.querySelectorAll(".node").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === ui.selected);
  });
  drawEdges();
  renderDetails();
}

// Retângulo de cada nó visível, medido no DOM (altura varia com selects/chips).
function boxes() {
  const map = new Map();
  nodeLayer.querySelectorAll(".node").forEach((el) => {
    map.set(el.dataset.id, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, el });
  });
  return map;
}

// Centro de uma porta (por item) em coordenadas do mundo.
function portPoint(box, id, dir, item) {
  const el = box.get(id).el;
  const port = [...el.querySelectorAll(`.port.${dir}`)].find((p) => p.dataset.item === item) || el.querySelector(`.port.${dir}`);
  const rect = port.getBoundingClientRect();
  const worldRect = world.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2 - worldRect.left) / ui.scale,
    y: (rect.top + rect.height / 2 - worldRect.top) / ui.scale
  };
}

function drawEdges() {
  const box = boxes();
  const hot = highlightSet();
  const visibleEdges = graph.edges.filter((edge) => box.has(edge.from) && box.has(edge.to));

  svg.innerHTML = visibleEdges.map((edge) => {
    const start = portPoint(box, edge.from, "out", edge.item);
    const end = portPoint(box, edge.to, "in", edge.item);
    const dx = Math.max(60, Math.abs(end.x - start.x) / 2);
    const isHot = hot && hot.has(edge.from) && hot.has(edge.to);
    const dim = hot && !isHot ? "dim" : "";
    const lane = laneColor(byId.get(edge.to));
    return `<path class="edge ${edge.fuel ? "fuel" : ""} ${edge.waste ? "waste" : ""} ${isHot ? "hot" : ""} ${dim}" style="--lane:${lane}" d="M${start.x},${start.y} C${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}" />`;
  }).join("");

  box.forEach((b, id) => b.el.classList.toggle("dim", !!hot && !hot.has(id)));
  drawGroups(box);
}

// Cada nó de item fica na altura da porta de saída da máquina que o produz.
function alignItemNodes() {
  const box = boxes();
  graph.nodes.filter((node) => node.producer && box.has(node.id) && box.has(node.producer)).forEach((node) => {
    const port = portPoint(box, node.producer, "out", node.item);
    node.y = port.y - box.get(node.id).h / 2;
    if (node.type === "waste") node.y += box.get(node.id).h + 16;
  });
}

// Empilha os nós de cada coluna a partir da linha desejada, sem sobreposição.
function autoLayout() {
  render();
  const box = boxes();
  const visible = graph.nodes.filter((node) => box.has(node.id) && !node.producer);
  const columns = new Map();
  visible.forEach((node) => {
    // Nos clusters, cada subcadeia empilha as próprias colunas.
    const key = LAYOUT === "clusters" ? `${node.x}|${node.lane}` : node.x;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(node);
  });
  columns.forEach((column) => {
    let previous = null;
    column.sort((a, b) => a.desiredY - b.desiredY).forEach((node) => {
      node.y = previous ? Math.max(node.desiredY, previous.y + box.get(previous.id).h + 32) : node.desiredY;
      previous = node;
    });
  });

  render();
  alignItemNodes();
  render();

  const after = boxes();
  const shown = graph.nodes.filter((node) => after.has(node.id));
  // Depois, empurra cada subcadeia para baixo da anterior.
  if (LAYOUT === "clusters") {
    let bottom = -Infinity;
    graph.groups
      .filter((group) => !group.noCollapse)
      .map((group) => shown.filter((node) => node.lane === group.lane))
      .filter((members) => members.length)
      .sort((a, b) => Math.min(...a.map((n) => n.desiredY)) - Math.min(...b.map((n) => n.desiredY)))
      .forEach((members) => {
        const top = Math.min(...members.map((n) => n.y));
        const shift = Math.max(0, bottom + 110 - top);
        members.forEach((n) => { n.y += shift; });
        bottom = Math.max(...members.map((n) => n.y + after.get(n.id).h));
      });
  }
  render();
}

function drawGroups(box) {
  groupLayer.innerHTML = graph.groups.map((group) => {
    const members = graph.nodes.filter((node) => node.lane === group.lane && box.has(node.id));
    if (!members.length) return "";
    const pad = 24;
    const head = 40;
    const x = Math.min(...members.map((n) => box.get(n.id).x)) - pad;
    const y = Math.min(...members.map((n) => box.get(n.id).y)) - pad - head;
    const right = Math.max(x + 560, Math.max(...members.map((n) => box.get(n.id).x + box.get(n.id).w)) + pad);
    const bottom = Math.max(...members.map((n) => box.get(n.id).y + box.get(n.id).h)) + pad;
    const all = graph.nodes.filter((node) => node.lane === group.lane);
    const machines = all.reduce((sum, node) => sum + (node.count || 0), 0);
    const recipes = all.filter((node) => node.type === "process").length;
    const collapsed = ui.collapsed.has(group.root);
    const hot = highlightSet();
    const dim = hot && !members.some((n) => hot.has(n.id)) ? "dim" : "";
    return `
      <div class="group ${dim}" style="--lane:${LANES[group.lane].color};left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px">
        <div class="group-head">
          <strong>${group.lane === "final" ? "Final" : "Subcadeia"} · ${esc(LANES[group.lane].name)}</strong>
          <span>${recipes} receita${recipes === 1 ? "" : "s"} · ${fmt(machines)} máquinas</span>
          ${group.noCollapse ? "" : `<button data-group="${group.root}">${collapsed ? "⊞ Expandir" : "⊟ Recolher"}</button>`}
        </div>
      </div>`;
  }).join("");
}

function renderDetails() {
  const node = byId.get(ui.selected);
  if (!node || node.type !== "process") {
    details.classList.remove("open");
    return;
  }
  const ins = incoming(node.id);
  details.innerHTML = `
    <header>
      <img src="${node.machineIcon}" alt="" />
      <div><h2>${esc(node.machine)}</h2><p>produz ${esc(node.item)} · ${esc(LANES[node.lane].name)}</p></div>
      <button class="close" data-act="close">✕</button>
    </header>
    <h3>Produção</h3>
    <div class="stat-grid">
      <div class="stat"><strong>${fmt(node.rate)}/min</strong><span>taxa</span></div>
      <div class="stat"><strong>${fmt(node.count)}×</strong><span>máquinas (${Math.ceil(node.count)} inteiras)</span></div>
      <div class="stat"><strong>${Math.round(node.load * 100)}%</strong><span>carga</span></div>
      <div class="stat"><strong>${fmt(node.seconds)}s</strong><span>ciclo</span></div>
    </div>
    <h3>Receita</h3>
    <select data-recipe="${node.id}">${node.recipes.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
    ${node.fuel ? `<h3>Combustível</h3><select data-fuel="${node.id}">${FUELS.map((f) => `<option ${f === node.fuel ? "selected" : ""}>${f}</option>`).join("")}</select>` : ""}
    <h3>Entradas</h3>
    <div class="io-list">${ins.map((e) => `<div><img src="${byId.get(e.from).icon}" alt="" />${esc(e.item)}${e.fuel ? " 🔥" : ""}<span>${fmt(e.rate)}/min</span></div>`).join("")}</div>
    <h3>Saídas</h3>
    <div class="io-list">
      <div><img src="${node.icon}" alt="" />${esc(node.item)}<span>${fmt(node.rate)}/min</span></div>
      ${(node.waste || []).map(([item, rate, icon]) => `<div><img src="${icon}" alt="" />${esc(item)} (sobra)<span>${fmt(rate)}/min</span></div>`).join("")}
    </div>
    <p class="note">No app real, trocar receita/combustível aqui recalcula o plano inteiro.</p>`;
  details.classList.add("open");
}

// ---------- viewport ----------
function applyView() {
  world.style.transform = `translate(${ui.x}px, ${ui.y}px) scale(${ui.scale})`;
}

function fit() {
  const box = [...boxes().values()];
  const minX = Math.min(...box.map((b) => b.x)) - 80;
  const minY = Math.min(...box.map((b) => b.y)) - 90;
  const maxX = Math.max(...box.map((b) => b.x + b.w)) + 80;
  const maxY = Math.max(...box.map((b) => b.y + b.h)) + 60;
  const rect = stage.getBoundingClientRect();
  ui.scale = Math.min(1, Math.max(0.35, Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))));
  ui.x = (rect.width - (maxX - minX) * ui.scale) / 2 - minX * ui.scale;
  ui.y = (rect.height - (maxY - minY) * ui.scale) / 2 - minY * ui.scale;
  applyView();
}

function zoom(factor, cx, cy) {
  const next = Math.min(1.8, Math.max(0.3, ui.scale * factor));
  ui.x = cx - ((cx - ui.x) / ui.scale) * next;
  ui.y = cy - ((cy - ui.y) / ui.scale) * next;
  ui.scale = next;
  applyView();
}

let toastTimer = 0;
function toast(text) {
  const el = document.querySelector(".toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function toggleCollapse(id) {
  if (ui.collapsed.has(id)) ui.collapsed.delete(id);
  else ui.collapsed.add(id);
  autoLayout();
}

// ---------- eventos ----------
let drag = null;

stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest("select, button, .details, .chip.collapsed")) return;
  const nodeEl = event.target.closest(".node");
  drag = {
    id: nodeEl?.dataset.id || "",
    startX: event.clientX,
    startY: event.clientY,
    originX: nodeEl ? byId.get(nodeEl.dataset.id).x : ui.x,
    originY: nodeEl ? byId.get(nodeEl.dataset.id).y : ui.y,
    moved: false
  };
  if (!nodeEl) stage.classList.add("panning");
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (drag.id) {
    const node = byId.get(drag.id);
    const moveX = drag.originX + dx / ui.scale - node.x;
    const moveY = drag.originY + dy / ui.scale - node.y;
    [node, ...graph.nodes.filter((n) => n.producer === node.id)].forEach((n) => {
      n.x += moveX;
      n.y += moveY;
      const el = nodeLayer.querySelector(`[data-id="${n.id}"]`);
      if (el) {
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
      }
    });
    drawEdges();
  } else {
    ui.x = drag.originX + dx;
    ui.y = drag.originY + dy;
    applyView();
  }
});

stage.addEventListener("pointerup", () => {
  if (drag && !drag.moved) {
    ui.selected = drag.id && byId.get(drag.id).type === "process" ? drag.id : "";
    render();
  }
  drag = null;
  stage.classList.remove("panning");
});

stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  zoom(event.deltaY > 0 ? 0.9 : 1.1, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

nodeLayer.addEventListener("pointerover", (event) => {
  const id = event.target.closest(".node")?.dataset.id || "";
  if (id !== ui.hover && !drag) {
    ui.hover = id;
    drawEdges();
  }
});
nodeLayer.addEventListener("pointerleave", () => {
  ui.hover = "";
  drawEdges();
});

document.addEventListener("click", (event) => {
  const act = event.target.closest("[data-act]")?.dataset.act;
  const nodeId = event.target.closest(".node")?.dataset.id;
  if (act === "collapse" && nodeId) toggleCollapse(nodeId);
  if (act === "details" && nodeId) {
    ui.selected = nodeId;
    render();
  }
  if (act === "close") {
    ui.selected = "";
    render();
  }
  const group = event.target.closest("[data-group]")?.dataset.group;
  if (group) toggleCollapse(group);

  const zoomAct = event.target.dataset.zoom;
  if (zoomAct) {
    const rect = stage.getBoundingClientRect();
    if (zoomAct === "fit") fit();
    else zoom(zoomAct === "in" ? 1.15 : 0.87, rect.width / 2, rect.height / 2);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.recipe) toast(`Receita: ${event.target.value} — o plano seria recalculado`);
  if (event.target.dataset.fuel) toast(`Combustível: ${event.target.value} — o plano seria recalculado`);
});

window.addEventListener("resize", fit);

autoLayout();
fit();
