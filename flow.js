// Fluxo de produção em HTML + SVG: máquinas, itens entre máquinas e subcadeias (clusters).
// Depende das funções globais de app.js (state, machineById, recipesFor, ...), que é
// carregado depois deste arquivo; tudo aqui só é chamado após o carregamento.

const flowEls = {
  stage: document.querySelector("#flowStage"),
  world: document.querySelector("#flowStage .flow-world"),
  groups: document.querySelector("#flowStage .flow-groups"),
  edges: document.querySelector("#flowStage .flow-edges"),
  nodes: document.querySelector("#flowStage .flow-nodes"),
  details: document.querySelector("#flowDetails"),
  toast: document.querySelector("#flowToast"),
  legend: document.querySelector("#flowLegend")
};

const FLOW_ITEM_GAP = 60; // espaço entre a máquina e o nó do item que ela produz
const FLOW_COL_GAP = 70;
const FLOW_UNITS_PER_COLUMN = 8; // nível 3: máquinas por sub-coluna
const FLOW_HUD_TOP = 16; // margem do enquadramento dentro do editor
const FLOW_HUD_BOTTOM = 16;
const FLOW_ROW_GAP = 32;
const FLOW_GROUP_PAD = 24; // margem interna da caixa da subcadeia
const FLOW_GROUP_HEAD = 40; // altura do cabeçalho da caixa
const FLOW_GROUP_MIN_WIDTH = 560;
const FLOW_GROUP_SPACING = 28; // espaço entre caixas
// Cores dos blocos, em harmonia com o logo (petróleo, cobre, sálvia, lavanda, terracota, areia).
const FLOW_FINAL_COLOR = "#e6bd6c";
const FLOW_RAW_COLOR = "#d9944a";
const FLOW_LANE_COLORS = ["#79adba", "#c98f5a", "#9cc58a", "#a993cf", "#cf7f6c", "#7fb3a3", "#c2ab7c"];


const flowUi = {
  level: 0,
  layout: "",
  buildOrder: null,
  unlocked: new Set(),
  detailLane: "",
  detailTabs: [], // abas de bloco abertas: { lane, name, view, key }
  lines: null, // linhas (blocos) da fábrica para a barra lateral: { base, order, depends }
  graph: null,
  lastMachines: null,
  overviewKey: "",
  byId: new Map(),
  outputsKey: "",
  collapsed: new Set(),
  offsets: {},
  fresh: new Set(),
  hover: "",
  selected: "",
  scale: 1,
  x: 0,
  y: 0,
  drag: null,
  pressed: null,
  toastTimer: 0,
  freshTimer: 0
};

// ---------- grafo ----------

function buildFlowGraph(plan) {
  const machineByItem = new Map(plan.machines.map((entry) => [entry.item, entry]));

  // O plano repete arestas quando um item aparece em vários caminhos; soma por par.
  const itemEdges = [];
  const edgeIndex = new Map();
  plan.edges.forEach((edge) => {
    const raw = edge.rawInput || !machineByItem.has(edge.from);
    const key = `${edge.from}|${edge.to}|${flowKind(edge)}|${raw ? 1 : 0}`;
    const existing = edgeIndex.get(key);
    if (existing) {
      existing.rate += edge.rate;
      existing.loop = existing.loop || !!edge.loop;
    } else {
      const entry = { from: edge.from, to: edge.to, rate: edge.rate, fuel: !!edge.fuel, fertilizer: !!edge.fertilizer, raw, loop: !!edge.loop };
      edgeIndex.set(key, entry);
      itemEdges.push(entry);
    }
  });

  // Subcadeias: cada ingrediente direto de um produto final vira um cluster. Ligações de
  // insumo (combustível, fertilizante) não puxam a linha do insumo para dentro do bloco:
  // cada insumo produzido na fábrica ganha um bloco próprio.
  const targets = plan.targetOutputs.map((output) => output.item).filter((item) => machineByItem.has(item));
  const lanes = [{ id: "final", name: t("lane.final"), kind: "final", color: FLOW_FINAL_COLOR, root: "" }];
  const laneOf = new Map(targets.map((item) => [item, "final"]));
  const isSupplyEdge = (edge) => edge.fuel || edge.fertilizer;
  const follows = (edge) => !edge.raw && !edge.loop && !isSupplyEdge(edge);
  const addLane = (rootItem, kind) => {
    if (laneOf.has(rootItem)) return;
    const lane = {
      id: `lane:${rootItem}`,
      name: rootItem,
      kind,
      color: FLOW_LANE_COLORS[(lanes.length - 1) % FLOW_LANE_COLORS.length],
      root: machineByItem.get(rootItem).id
    };
    lanes.push(lane);
    const stack = [rootItem];
    while (stack.length) {
      const item = stack.pop();
      if (laneOf.has(item)) continue;
      laneOf.set(item, lane.id);
      itemEdges.filter((entry) => entry.to === item && follows(entry)).forEach((entry) => stack.push(entry.from));
    }
  };
  targets.forEach((target) => {
    itemEdges.filter((edge) => edge.to === target && follows(edge)).forEach((edge) => addLane(edge.from, "chain"));
  });
  // Insumos de insumos (ex.: a linha de fertilizante queima combustível) também viram blocos.
  let found = true;
  while (found) {
    found = false;
    itemEdges
      .filter((edge) => isSupplyEdge(edge) && !edge.raw && machineByItem.has(edge.from) && !laneOf.has(edge.from))
      .forEach((edge) => {
        addLane(edge.from, edge.fuel ? "fuel" : "fertilizer");
        found = true;
      });
  }
  plan.machines.forEach((entry) => {
    if (!laneOf.has(entry.item)) laneOf.set(entry.item, "final");
  });

  // Coluna = maior distância até o produto final (receitas mais básicas à esquerda).
  const depth = new Map(targets.map((item) => [item, 0]));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < plan.machines.length + 2) {
    changed = false;
    itemEdges.forEach((edge) => {
      // Arestas de ciclo voltam para trás; ficam fora do cálculo de colunas.
      if (edge.raw || edge.loop || !depth.has(edge.to)) return;
      const next = depth.get(edge.to) + 1;
      if ((depth.get(edge.from) ?? -1) < next) {
        depth.set(edge.from, next);
        changed = true;
      }
    });
  }
  const maxDepth = Math.max(0, ...depth.values());
  const colOf = (item) => maxDepth - (depth.get(item) ?? 0) + 1;

  const nodes = [];
  const edges = [];
  const add = (node) => {
    nodes.push(node);
    return node;
  };

  plan.machines.forEach((entry) => {
    add({
      id: entry.id,
      type: "process",
      item: entry.item,
      lane: laneOf.get(entry.item),
      col: colOf(entry.item),
      entry
    });
  });

  // Itens entre máquinas e sobras.
  plan.machines.forEach((entry) => {
    const consumers = itemEdges.filter((edge) => edge.from === entry.item && !edge.raw);
    if (consumers.length) {
      const itemId = `item:${entry.id}`;
      const rate = consumers.reduce((sum, edge) => sum + edge.rate, 0);
      add({ id: itemId, type: "item", item: entry.item, lane: laneOf.get(entry.item), producer: entry.id, rate });
      edges.push({ from: entry.id, to: itemId, item: entry.item, rate, fuel: false });
      consumers.forEach((edge) => {
        edges.push({ from: itemId, to: machineByItem.get(edge.to).id, item: edge.from, rate: edge.rate, fuel: edge.fuel, fertilizer: edge.fertilizer, loop: edge.loop });
      });
    }
    if (state.settings.showByproducts) {
      const mainQty = entry.outputs[entry.item] || 1;
      Object.entries(entry.outputs).forEach(([item, qty]) => {
        if (item === entry.item) return;
        const wasteId = `waste:${entry.id}:${item}`;
        const rate = (entry.demand * qty) / mainQty;
        add({ id: wasteId, type: "waste", item, lane: laneOf.get(entry.item), producer: entry.id, rate });
        edges.push({ from: entry.id, to: wasteId, item, rate, fuel: false, waste: true });
      });
    }
  });

  // Matérias-primas: nos clusters, um nó por subcadeia que as consome; nas colunas, um só.
  const columns = flowLayout() === "columns";
  itemEdges.filter((edge) => edge.raw).forEach((edge) => {
    const consumer = machineByItem.get(edge.to);
    const lane = laneOf.get(edge.to);
    const rawId = columns ? `raw:${edge.from}` : `raw:${edge.from}@${lane}`;
    let rawNode = nodes.find((node) => node.id === rawId);
    if (!rawNode) {
      rawNode = add({ id: rawId, type: "raw", item: edge.from, lane, col: colOf(edge.to) - 1, rate: 0 });
    }
    rawNode.col = Math.min(rawNode.col, colOf(edge.to) - 1);
    rawNode.rate += edge.rate;
    edges.push({ from: rawId, to: consumer.id, item: edge.from, rate: edge.rate, fuel: edge.fuel, fertilizer: edge.fertilizer });
  });

  plan.targetOutputs.forEach((output) => {
    const producer = machineByItem.get(output.item);
    const outId = `out:${output.item}`;
    add({ id: outId, type: "output", item: output.item, lane: "final", col: maxDepth + 2, rate: output.rate });
    if (producer) edges.push({ from: producer.id, to: outId, item: output.item, rate: output.rate, fuel: false });
  });

  return { nodes, edges, lanes };
}

// Nível 1: matérias-primas → fábrica (um nó só) → saídas editáveis.
function buildOverviewGraph(plan) {
  const nodes = [];
  const edges = [];
  const fuelInputs = new Set(plan.edges.filter((edge) => edge.fuel).map((edge) => edge.from));
  const fertilizerInputs = new Set(plan.edges.filter((edge) => edge.fertilizer).map((edge) => edge.from));
  if (plan.targetOutputs.length) {
    const total = plan.machines.reduce((sum, entry) => sum + entry.machineCount, 0);
    nodes.push({ id: "factory", type: "factory", lane: "final", col: 1, plan, total });
  }
  Object.entries(plan.raw).sort((a, b) => b[1] - a[1]).forEach(([item, rate]) => {
    nodes.push({ id: `raw:${item}`, type: "raw", item, lane: "final", col: 0, rate });
    edges.push({ from: `raw:${item}`, to: "factory", item, rate, fuel: fuelInputs.has(item), fertilizer: fertilizerInputs.has(item) });
  });
  plan.targetOutputs.forEach((output) => {
    const id = `goal:${output.id}`;
    nodes.push({ id, type: "goal", item: output.item, lane: "final", col: 2, rate: output.rate, outputId: output.id });
    edges.push({ from: "factory", to: id, item: output.item, rate: output.rate, fuel: false });
  });
  if (state.settings.showByproducts) {
    Object.entries(plan.waste).forEach(([item, rate]) => {
      nodes.push({ id: `waste:${item}`, type: "waste", item, lane: "final", col: 2, rate });
      edges.push({ from: "factory", to: `waste:${item}`, item, rate, fuel: false, waste: true });
    });
  }
  nodes.push({ id: "add", type: "add", lane: "final", col: 2 });
  return { nodes, edges, lanes: [] };
}

// Nível 3: a linha física de um bloco. Cada máquina física vira um nó ("unit") e cada fluxo de
// item vira tantas esteiras quantas forem necessárias (taxa ÷ Esteira/min). O que vem de fora
// do bloco entra como fonte; o que sai vai para um nó de saída (outro bloco, produto ou sobra).
function buildDetailGraph(base, laneId) {
  const lane = base.lanes.find((entry) => entry.id === laneId);
  const byId = new Map(base.nodes.map((node) => [node.id, node]));
  const processes = base.nodes.filter((node) => node.type === "process" && node.lane === laneId);
  const inBlock = (id) => processes.some((node) => node.id === id);
  const laneName = (node) => base.lanes.find((entry) => entry.id === node?.lane)?.name || "";
  const nodes = [];
  const edges = [];
  const units = new Map();
  const belt = state.settings.beltRate;

  // Máquinas físicas de cada receita do bloco, com a carga de cada uma.
  processes.forEach((process) => {
    const entry = process.entry;
    const count = Math.max(1, Math.ceil(entry.machineCount - 1e-9));
    const exact = entry.exactMachines || entry.machineCount;
    const list = Array.from({ length: count }, (_, index) => {
      const load = Math.max(0, Math.min(1, exact - index));
      // Muitas máquinas da mesma receita quebram em sub-colunas lado a lado.
      const subColumn = Math.floor(index / FLOW_UNITS_PER_COLUMN) * 0.1;
      const unit = { id: `unit:${process.id}#${index + 1}`, type: "unit", lane: laneId, col: process.col * 4 + subColumn, entry, index: index + 1, load, share: exact ? load / exact : 0 };
      nodes.push(unit);
      return unit;
    });
    units.set(process.id, list);
  });

  // Um fluxo = um item indo de produtores para consumidores, passando por K esteiras.
  let streamIndex = 0;
  const stream = ({ item, rate, producers = [], consumers = [], source = null, sink = null, col }) => {
    if (!(rate > 0)) return;
    const id = `s${streamIndex += 1}`;
    const count = Math.max(1, Math.ceil(rate / belt - 1e-9));
    const belts = Array.from({ length: count }, (_, index) => {
      const node = { id: `belt:${id}#${index + 1}`, type: "belt", item, lane: laneId, col, rate: rate / count, index: index + 1, total: count };
      nodes.push(node);
      return node;
    });
    producers.forEach((unit, index, all) => {
      const target = belts[Math.floor((index * count) / all.length)];
      edges.push({ from: unit.id, to: target.id, item, rate: unit.rate, fuel: false });
    });
    consumers.forEach((consumer, index, all) => {
      const from = belts[Math.floor((index * count) / all.length)];
      edges.push({ from: from.id, to: consumer.unit.id, item, rate: consumer.rate, fuel: consumer.kind === 1, fertilizer: consumer.kind === 2 });
    });
    if (source) {
      nodes.push(source);
      belts.forEach((entry) => edges.push({ from: source.id, to: entry.id, item, rate: entry.rate, fuel: false }));
    }
    if (sink) {
      nodes.push(sink);
      belts.forEach((entry) => edges.push({ from: entry.id, to: sink.id, item, rate: entry.rate, fuel: false }));
    }
  };
  const consumersOf = (edgesIn) => edgesIn.flatMap((edge) => (units.get(edge.to) || []).map((unit) => ({
    unit, kind: flowKind(edge), rate: edge.rate * unit.share
  })));
  const producersOf = (process, rate) => (units.get(process.id) || []).map((unit) => ({ id: unit.id, rate: rate * unit.share }));

  processes.forEach((process) => {
    const col = process.col * 4;
    // Saída principal: consumidores dentro do bloco + o que segue para fora.
    const itemNode = base.nodes.find((node) => node.type === "item" && node.producer === process.id);
    const toOutputs = base.edges.filter((edge) => edge.from === process.id && byId.get(edge.to)?.type === "output");
    const outgoing = itemNode ? base.edges.filter((edge) => edge.from === itemNode.id) : [];
    const inside = outgoing.filter((edge) => inBlock(edge.to));
    const outside = [...outgoing.filter((edge) => !inBlock(edge.to)), ...toOutputs];
    const total = [...inside, ...outside].reduce((sum, edge) => sum + edge.rate, 0);
    const outsideRate = outside.reduce((sum, edge) => sum + edge.rate, 0);
    const destinations = [...new Set(outside.map((edge) => {
      const target = byId.get(edge.to);
      return target?.type === "output" ? t("dest.final") : t("dest.block", { name: laneName(target) });
    }))].join(", ");
    stream({
      item: process.item,
      rate: total,
      producers: producersOf(process, total),
      consumers: consumersOf(inside),
      sink: outsideRate > 0 ? { id: `sink:${process.id}`, type: "output", item: process.item, lane: laneId, col: col + 2, rate: outsideRate, label: t("dest.to", { list: destinations }) } : null,
      col: col + 1
    });
    // Sobras.
    base.edges.filter((edge) => edge.from === process.id && edge.waste).forEach((edge) => {
      stream({
        item: edge.item,
        rate: edge.rate,
        producers: producersOf(process, edge.rate),
        sink: { id: `waste:${process.id}:${edge.item}`, type: "waste", item: edge.item, lane: laneId, col: col + 2, rate: edge.rate },
        col: col + 1
      });
    });
  });

  // Entradas que vêm de fora do bloco (matéria-prima, outros blocos, insumos), por item e tipo.
  const external = new Map();
  base.edges.filter((edge) => inBlock(edge.to)).forEach((edge) => {
    const from = byId.get(edge.from);
    const producer = from?.type === "item" ? from.producer : "";
    if (producer && inBlock(producer)) return;
    const key = `${edge.item}|${flowKind(edge)}`;
    const group = external.get(key) || { item: edge.item, edges: [], origin: from?.type === "raw" ? t("origin.outside") : t("origin.block", { name: laneName(byId.get(producer)) }) };
    group.edges.push(edge);
    external.set(key, group);
  });
  external.forEach((group, key) => {
    const rate = group.edges.reduce((sum, edge) => sum + edge.rate, 0);
    const firstCol = Math.min(...group.edges.map((edge) => byId.get(edge.to).col * 4));
    stream({
      item: group.item,
      rate,
      consumers: consumersOf(group.edges),
      source: { id: `src:${key}`, type: "raw", item: group.item, lane: laneId, col: firstCol - 2, rate, label: group.origin },
      col: firstCol - 1
    });
  });

  return { nodes, edges, lanes: lane ? [lane] : [] };
}

const flowIncoming = (id) => flowUi.graph.edges.filter((edge) => edge.to === id);
const flowOutgoing = (id) => flowUi.graph.edges.filter((edge) => edge.from === id);

function flowWalk(id, step) {
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
const flowUpstream = (id) => flowWalk(id, (node) => flowIncoming(node).map((edge) => edge.from));
const flowDownstream = (id) => flowWalk(id, (node) => flowOutgoing(node).map((edge) => edge.to));

// Um nó some quando todos os seus consumidores estão ocultos ou recolhidos.
function flowHiddenNodes() {
  const hidden = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    flowUi.graph.nodes.forEach((node) => {
      if (hidden.has(node.id)) return;
      const consumers = flowOutgoing(node.id).map((edge) => edge.to);
      const orphan = node.producer && hidden.has(node.producer);
      if (orphan || (consumers.length && consumers.every((to) => hidden.has(to) || flowUi.collapsed.has(to)))) {
        hidden.add(node.id);
        changed = true;
      }
    });
  }
  return hidden;
}

function flowHighlightSet() {
  const focus = flowUi.hover || flowUi.selected;
  if (!focus || !flowUi.byId.has(focus)) return null;
  return new Set([focus, ...flowUpstream(focus), ...flowDownstream(focus)]);
}

// ---------- html ----------

function flowLaneColor(node) {
  if (node.type === "raw") return FLOW_RAW_COLOR;
  return flowUi.graph.lanes.find((lane) => lane.id === node.lane)?.color || FLOW_FINAL_COLOR;
}

function flowIcon(path, className = "") {
  return path ? `<img class="${className}" src="${escapeHtml(iconUrl(path))}" alt="" />` : "";
}

function flowIconAttr(path) {
  return path ? ` data-icon="${escapeHtml(iconUrl(path))}"` : "";
}

// Tipo da ligação: 0 = entrada comum, 1 = combustível, 2 = fertilizante (cada um tem porta própria).
function flowKind(edge) {
  return edge.fuel ? 1 : edge.fertilizer ? 2 : 0;
}

function flowPortKey(item, kind = 0) {
  return `${item}|${Number(kind) || 0}`;
}

function flowIoRow(dir, item, rate, { kind = 0, extra = "" } = {}) {
  return `
    <div class="io-row ${dir} ${["", "fuel", "fertilizer"][kind]} ${extra}">
      <span class="port ${dir}" data-port="${escapeHtml(flowPortKey(item, kind))}"></span>
      ${flowIcon(itemIcon(item))}
      <span class="io-name">${escapeHtml(item)}</span>
      <span class="io-rate">${formatRate(rate)}</span>
    </div>`;
}

function flowRecipeSelect(item) {
  const options = recipesFor(item);
  if (options.length < 2) return "";
  const selected = selectedRecipeFor(item)?.id;
  return `
    <div class="node-row">
      <label>${t("label.recipe")}</label>
      <select data-icon-select data-recipe-picker="${escapeHtml(item)}">
        ${options.map((entry) => `<option value="${escapeHtml(entry.id)}"${flowIconAttr(machineById(entry.machineId)?.icon)} ${entry.id === selected ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}
      </select>
    </div>`;
}

// Primeira opção = seguir o padrão da fábrica; as demais tornam a escolha manual.
function flowFuelOptions(item) {
  const manual = isManualFuel(item);
  const current = selectedFuelFor(item);
  return `
    <option value=""${flowIconAttr(itemIcon(defaultFuelItem()))} ${manual ? "" : "selected"}>${escapeHtml(t("option.default", { name: defaultFuelItem() }))}</option>
    ${fuelItems().map((fuel) => `<option value="${escapeHtml(fuel)}"${flowIconAttr(itemIcon(fuel))} ${manual && fuel === current ? "selected" : ""}>${escapeHtml(fuel)}</option>`).join("")}`;
}

function flowFuelSelect(entry) {
  if (!entry.fuelItem) return "";
  const manual = isManualFuel(entry.item);
  return `
    <div class="node-row ${manual ? "fuel-manual" : ""}">
      <label title="${manual ? t("choice.manual") : t("choice.follows")}">🔥 ${manual ? t("label.manual") : t("label.fuel")}</label>
      <select data-icon-select data-fuel-picker="${escapeHtml(entry.item)}">${flowFuelOptions(entry.item)}</select>
    </div>
    ${canProduceSupply(entry.fuelItem) ? `<div class="fuel-line-row">${flowSupplyLineButton(entry.fuelItem)}</div>` : ""}`;
}

// Liga/desliga a linha de produção de um combustível fabricável.
function flowSupplyLineButton(fuelItem) {
  if (!fuelItem || !canProduceSupply(fuelItem)) return "";
  const produced = isSupplyProduced(fuelItem);
  return `
    <button type="button" class="fuel-line ${produced ? "on" : ""}" data-supply-line="${escapeHtml(fuelItem)}"
      title="${escapeHtml(produced ? t("supply.producedTitle", { item: fuelItem }) : t("supply.addTitle", { item: fuelItem }))}">
      ${produced ? t("supply.own") : t("supply.add")}
    </button>`;
}

// Fertilizante: igual ao combustível (primeira opção = padrão da fábrica).
function flowFertilizerOptions(item) {
  const manual = isManualFertilizer(item);
  const current = selectedFertilizerFor(item);
  return `
    <option value=""${flowIconAttr(itemIcon(defaultFertilizerItem()))} ${manual ? "" : "selected"}>${escapeHtml(t("option.default", { name: defaultFertilizerItem() }))}</option>
    ${fertilizerItems().map((fertilizer) => `<option value="${escapeHtml(fertilizer)}"${flowIconAttr(itemIcon(fertilizer))} ${manual && fertilizer === current ? "selected" : ""}>${escapeHtml(fertilizer)}</option>`).join("")}`;
}

function flowFertilizerSelect(entry) {
  if (!entry.fertilizerItem) return "";
  const manual = isManualFertilizer(entry.item);
  return `
    <div class="node-row ${manual ? "fuel-manual" : ""}">
      <label title="${manual ? t("choice.manual") : t("choice.follows")}">🌱 ${manual ? t("label.manual") : t("label.fertilizer")}</label>
      <select data-icon-select data-fertilizer-picker="${escapeHtml(entry.item)}">${flowFertilizerOptions(entry.item)}</select>
    </div>
    ${canProduceSupply(entry.fertilizerItem) ? `<div class="fuel-line-row">${flowSupplyLineButton(entry.fertilizerItem)}</div>` : ""}`;
}

// Plantio: Nursery (semente fica, gasta fertilizante) ou Seed Plot (gasta a semente).
function flowPlantingOptions(item) {
  const manual = isManualPlanting(item);
  const current = selectedPlantingFor(item);
  const fallback = machineById(defaultPlantingId());
  return `
    <option value=""${flowIconAttr(fallback?.icon)} ${manual ? "" : "selected"}>${escapeHtml(t("option.default", { name: fallback?.name || "" }))}</option>
    ${plantingMachines().map((machine) => `<option value="${escapeHtml(machine.id)}"${flowIconAttr(machine.icon)} ${manual && machine.id === current ? "selected" : ""}>${escapeHtml(machine.name)}</option>`).join("")}`;
}

function flowPlantingSelect(entry) {
  if (!entry.planting) return "";
  const manual = isManualPlanting(entry.item);
  return `
    <div class="node-row ${manual ? "fuel-manual" : ""}">
      <label title="${manual ? t("choice.manual") : t("choice.follows")}">🪴 ${manual ? t("label.manual") : t("label.planting")}</label>
      <select data-icon-select data-planting-picker="${escapeHtml(entry.item)}">${flowPlantingOptions(entry.item)}</select>
    </div>`;
}

// Nursery: o fertilizante define quantas ervas cada máquina entrega. Seed Plot: tempo da receita.
function flowNurseryLine(entry) {
  if (entry.machineId === SEED_PLOT_ID) {
    return `
      <div class="furnace-line nursery-line seed-plot-line" title="${escapeHtml(t("seedPlot.title"))}">
        <span><b>${round(entry.outputPerMinute)}/min</b> ${t("perMachine")}</span>
        <span class="heat">${t("seedPlot.note")}</span>
      </div>`;
  }
  if (!entry.fertilizerItem) return "";
  const fertilizer = resourceByName(entry.fertilizerItem);
  return `
    <div class="furnace-line nursery-line" title="${escapeHtml(t("nursery.title", { item: entry.fertilizerItem, value: fertilizer?.nutrientValue || 0, speed: fertilizer?.nutrientsPerSecond || 0 }))}">
      ${flowIcon(itemIcon(entry.fertilizerItem))}
      <span><b>${round(entry.outputPerMinute)}/min</b> ${t("perMachine")}</span>
      <span class="heat">🌱 ${formatRate(entry.fertilizerRate)}</span>
    </div>`;
}

// Nível 1: fertilizante padrão + todas as máquinas que usam fertilizante.
function flowFactoryFertilizerHtml(plan) {
  const nurseries = plan.machines.filter((entry) => entry.planting || entry.fertilizerItem);
  const used = new Map();
  plan.edges.filter((edge) => edge.fertilizer).forEach((edge) => used.set(edge.from, (used.get(edge.from) || 0) + edge.rate));
  const row = (entry) => {
    const machine = machineById(entry.machineId);
    return `
      <div class="fuel-row ${isManualFertilizer(entry.item) || isManualPlanting(entry.item) ? "manual" : ""}" title="${escapeHtml(machine?.name || entry.machine)} · ${escapeHtml(entry.item)}">
        <div class="fuel-row-head">
          ${flowIcon(machine?.icon)}
          <span>${escapeHtml(entry.item)}</span>
          <em>${t("fert.each", { count: round(entry.machineCount), rate: round(entry.outputPerMinute) })}</em>
        </div>
        <div class="fuel-row-selects">
          ${entry.planting ? `<select data-icon-select data-planting-picker="${escapeHtml(entry.item)}" aria-label="${escapeHtml(t("aria.plantingOf", { item: entry.item }))}" class="${isManualPlanting(entry.item) ? "manual" : ""}">${flowPlantingOptions(entry.item)}</select>` : ""}
          ${entry.fertilizerItem ? `<select data-icon-select data-fertilizer-picker="${escapeHtml(entry.item)}" aria-label="${escapeHtml(t("aria.fertilizerOf", { item: entry.item }))}" class="${isManualFertilizer(entry.item) ? "manual" : ""}">${flowFertilizerOptions(entry.item)}</select>` : `<span class="fuel-note">sem fertilizante</span>`}
        </div>
      </div>`;
  };
  return `
    <div class="factory-fuel">
      <div class="io-title">${t("section.plantFert")}</div>
      <div class="node-row">
        <label>🪴 ${t("label.planting")}</label>
        <select data-icon-select data-default-planting aria-label="${escapeHtml(t("aria.defaultPlanting"))}">
          ${plantingMachines().map((machine) => `<option value="${escapeHtml(machine.id)}"${flowIconAttr(machine.icon)} ${machine.id === defaultPlantingId() ? "selected" : ""}>${escapeHtml(machine.name)}</option>`).join("")}
        </select>
      </div>
      <div class="node-row">
        <label>🌱 ${t("label.fertilizer")}</label>
        <select data-icon-select data-default-fertilizer aria-label="${escapeHtml(t("aria.defaultFertilizer"))}">
          ${fertilizerItems().map((fertilizer) => `<option value="${escapeHtml(fertilizer)}"${flowIconAttr(itemIcon(fertilizer))} ${fertilizer === defaultFertilizerItem() ? "selected" : ""}>${escapeHtml(fertilizer)}</option>`).join("")}
        </select>
      </div>
      ${nurseries.length ? "" : `<p class="fuel-note">${t("fert.noHerbs")}</p>`}
      ${used.size ? `<div class="fuel-group">${t("fert.inUse")}</div>${[...used.entries()].map(([fertilizer, rate]) => `
        <div class="fuel-use">
          ${flowIcon(itemIcon(fertilizer))}
          <span>${escapeHtml(fertilizer)} <em>${formatRate(rate)} · ${flowFuelOrigin(plan, fertilizer)}</em></span>
          ${canProduceSupply(fertilizer) ? flowSupplyLineButton(fertilizer) : `<em class="not-craftable">${t("fuel.notCraftable")}</em>`}
        </div>`).join("")}` : ""}
      ${nurseries.length ? `<div class="fuel-group">${t("fert.herbs", { n: nurseries.length })}</div>${nurseries.map(row).join("")}` : ""}
    </div>`;
}

// Fornalha: igual ao combustível, a primeira opção segue o padrão da fábrica.
function flowFurnaceOptions(item) {
  const manual = isManualFurnace(item);
  const current = selectedFurnaceFor(item);
  return `
    <option value=""${flowIconAttr(machineById(defaultFurnaceId())?.icon)} ${manual ? "" : "selected"}>${escapeHtml(t("option.default", { name: machineById(defaultFurnaceId())?.name || "" }))}</option>
    ${furnaces().map((furnace) => `<option value="${escapeHtml(furnace.id)}"${flowIconAttr(furnace.icon)} ${manual && furnace.id === current ? "selected" : ""}>${escapeHtml(furnace.name)}</option>`).join("")}`;
}

function flowFurnaceSelect(entry) {
  if (!entry.furnaceId) return "";
  const manual = isManualFurnace(entry.item);
  return `
    <div class="node-row ${manual ? "fuel-manual" : ""}">
      <label title="${manual ? t("choice.manualFem") : t("choice.follows")}">🧱 ${manual ? t("label.manual") : t("label.furnace")}</label>
      <select data-icon-select data-furnace-picker="${escapeHtml(entry.item)}">${flowFurnaceOptions(entry.item)}</select>
    </div>`;
}

// A máquina aquecida fica em cima das fornalhas; o calor total define o combustível.
function flowFurnaceLine(entry) {
  if (!entry.furnaceId) return "";
  const furnace = machineById(entry.furnaceId);
  return `
    <div class="furnace-line" title="${escapeHtml(t("furnace.title", { name: furnace?.name || "" }))}">
      ${flowIcon(furnace?.icon)}
      <span>${t("furnace.on")} <b>${entry.furnaceCount}×</b> ${escapeHtml(furnace?.name || "")}</span>
      <span class="heat">🔥 ${round(entry.heat)}/s</span>
    </div>`;
}

// Nível 1: fornalha e combustível padrão + todas as máquinas aquecidas, manuais primeiro.
function flowFactoryFuelHtml(plan) {
  const heated = plan.machines.filter((entry) => entry.furnaceId);
  const isManual = (entry) => isManualFuel(entry.item) || isManualFurnace(entry.item);
  const manual = heated.filter(isManual);
  const byDefault = heated.filter((entry) => !isManual(entry));
  const furnaceTotal = heated.reduce((sum, entry) => sum + entry.furnaceCount, 0);
  const heatTotal = heated.reduce((sum, entry) => sum + entry.heat, 0);
  const row = (entry) => {
    const machine = machineById(entry.machineId);
    return `
      <div class="fuel-row ${isManual(entry) ? "manual" : ""}" title="${escapeHtml(machine?.name || entry.machine)} · ${escapeHtml(entry.item)}">
        <div class="fuel-row-head">
          ${flowIcon(machine?.icon)}
          <span>${escapeHtml(entry.item)}</span>
          <em>${entry.furnaceCount}× · ${formatRate(fuelRateFor(entry.heat, entry.fuelItem))}</em>
        </div>
        <div class="fuel-row-selects">
          <select data-icon-select data-furnace-picker="${escapeHtml(entry.item)}" aria-label="${escapeHtml(t("aria.furnaceOf", { item: entry.item }))}" class="${isManualFurnace(entry.item) ? "manual" : ""}">${flowFurnaceOptions(entry.item)}</select>
          <select data-icon-select data-fuel-picker="${escapeHtml(entry.item)}" aria-label="${escapeHtml(t("aria.fuelOf", { item: entry.item }))}" class="${isManualFuel(entry.item) ? "manual" : ""}">${flowFuelOptions(entry.item)}</select>
        </div>
      </div>`;
  };
  return `
    <div class="factory-fuel">
      <div class="io-title">${t("section.heating")}</div>
      <div class="node-row">
        <label>🧱 ${t("label.furnace")}</label>
        <select data-icon-select data-default-furnace aria-label="${escapeHtml(t("aria.defaultFurnace"))}">
          ${furnaces().map((furnace) => `<option value="${escapeHtml(furnace.id)}"${flowIconAttr(furnace.icon)} ${furnace.id === defaultFurnaceId() ? "selected" : ""}>${escapeHtml(furnace.name)}</option>`).join("")}
        </select>
      </div>
      <div class="node-row">
        <label>🔥 ${t("label.fuel")}</label>
        <select data-icon-select data-default-fuel aria-label="${escapeHtml(t("aria.defaultFuel"))}">
          ${fuelItems().map((fuel) => `<option value="${escapeHtml(fuel)}"${flowIconAttr(itemIcon(fuel))} ${fuel === defaultFuelItem() ? "selected" : ""}>${escapeHtml(fuel)}</option>`).join("")}
        </select>
      </div>
      ${heated.length
        ? `<p class="fuel-note">${t("heat.total", { n: furnaceTotal, heat: round(heatTotal) })}</p>`
        : `<p class="fuel-note">${t("heat.none")}</p>`}
      ${flowFactoryFuelsHtml(plan)}
      ${manual.length ? `<div class="fuel-group">${t("heat.manual", { n: manual.length })}</div>${manual.map(row).join("")}` : ""}
      ${byDefault.length ? `<div class="fuel-group">${t("heat.default", { n: byDefault.length })}</div>${byDefault.map(row).join("")}` : ""}
    </div>`;
}

function flowFuelOrigin(plan, fuel) {
  if (plan.loopWarnings?.includes(fuel)) return `<b class="loop-warning">${t("origin.loopWarning")}</b>`;
  if (!isSupplyProduced(fuel)) return t("origin.fromOutside");
  return plan.loops?.[fuel] ? t("origin.producedLoop", { rate: formatRate(plan.loops[fuel]) }) : t("origin.produced");
}

// Cada combustível em uso: quanto a fábrica queima e se vem de fora ou de uma linha própria.
function flowFactoryFuelsHtml(plan) {
  const used = new Map();
  plan.edges.filter((edge) => edge.fuel).forEach((edge) => used.set(edge.from, (used.get(edge.from) || 0) + edge.rate));
  if (!used.size) return "";
  return `
    <div class="fuel-group">${t("fuel.inUse")}</div>
    ${[...used.entries()].map(([fuel, rate]) => `
      <div class="fuel-use">
        ${flowIcon(itemIcon(fuel))}
        <span>${escapeHtml(fuel)} <em>${formatRate(rate)} · ${flowFuelOrigin(plan, fuel)}</em></span>
        ${canProduceSupply(fuel) ? flowSupplyLineButton(fuel) : `<em class="not-craftable">${t("fuel.notCraftable")}</em>`}
      </div>`).join("")}`;
}

// Insumos (combustível, fertilizante) que a própria fábrica produz para consumir: não chegam de
// fora, então não têm porta, mas aparecem nas entradas com outra cor e o consumo por minuto.
function flowInternalSuppliesHtml(plan) {
  const internal = new Map();
  plan.edges
    .filter((edge) => (edge.fuel || edge.fertilizer) && !edge.rawInput)
    .forEach((edge) => {
      const current = internal.get(edge.from) || { rate: 0, kind: edge.fuel ? "fuel" : "fertilizer" };
      current.rate += edge.rate;
      internal.set(edge.from, current);
    });
  if (!internal.size) return "";
  return `
    <div class="io-title internal">${t("internal.title")}</div>
    ${[...internal.entries()].sort((a, b) => b[1].rate - a[1].rate).map(([item, { rate, kind }]) => `
      <div class="io-row in internal" title="${escapeHtml(t("internal.itemTitle", { item }))}">
        ${flowIcon(itemIcon(item))}
        <span class="io-name">${escapeHtml(item)} <em>${kind === "fuel" ? t("kind.fuel") : t("kind.fertilizer")}</em></span>
        <span class="io-rate">${formatRate(rate)}</span>
      </div>`).join("")}`;
}

// Nível 3: uma máquina física, com o que entra e sai só dela.
function flowUnitHtml(node, attrs) {
  const machine = machineById(node.entry.machineId);
  const ins = flowIncoming(node.id);
  const outs = flowOutgoing(node.id);
  const row = (dir, edge) => `
    <div class="unit-io ${dir} ${["", "fuel", "fertilizer"][dir === "in" ? flowKind(edge) : 0]}">
      <span class="port ${dir}" data-port="${escapeHtml(flowPortKey(edge.item, dir === "in" ? flowKind(edge) : 0))}"></span>
      ${flowIcon(itemIcon(edge.item))}<span>${formatRate(edge.rate)}</span>
    </div>`;
  // Uma porta por item: várias ligações do mesmo item chegam na mesma porta.
  const unique = (list, dir) => [...new Map(list.map((edge) => [flowPortKey(edge.item, dir === "in" ? flowKind(edge) : 0), edge])).values()];
  return `
    <div class="flow-node unit ${node.load < 0.999 ? "partial" : ""} ${attrs.classes}" data-id="${escapeHtml(node.id)}" style="${attrs.style}" title="${escapeHtml(machine?.name || node.entry.machine)} #${node.index} · ${escapeHtml(node.entry.recipe)}">
      <div class="unit-top">
        ${flowIcon(machine?.icon)}
        <strong>${escapeHtml(machine?.name || node.entry.machine)} #${node.index}</strong>
        <span>${round(node.load * 100)}%</span>
      </div>
      <div class="unit-load"><i style="width:${node.load * 100}%"></i></div>
      ${unique(ins, "in").map((edge) => row("in", { ...edge, rate: ins.filter((other) => other.item === edge.item && flowKind(other) === flowKind(edge)).reduce((sum, other) => sum + other.rate, 0) })).join("")}
      ${unique(outs, "out").map((edge) => row("out", { ...edge, rate: outs.filter((other) => other.item === edge.item).reduce((sum, other) => sum + other.rate, 0) })).join("")}
    </div>`;
}

function flowBeltHtml(node, attrs) {
  return `
    <div class="flow-node belt ${attrs.classes}" data-id="${escapeHtml(node.id)}" style="${attrs.style}" title="${escapeHtml(t("belt.title", { i: node.index, n: node.total, rate: formatRate(node.rate), cap: formatRate(state.settings.beltRate) }))}">
      <span class="port in" data-port="${escapeHtml(flowPortKey(node.item, 0))}"></span>
      <span class="port out" data-port="${escapeHtml(flowPortKey(node.item, 0))}"></span>
      ${flowIcon(itemIcon(node.item))}
      <span class="belt-name">${t("belt.name", { i: node.index, n: node.total })}</span>
      <span class="belt-rate">${formatRate(node.rate)}</span>
      <i class="belt-fill" style="width:${Math.min(100, (node.rate / state.settings.beltRate) * 100)}%"></i>
    </div>`;
}

function flowFactoryHtml(node, attrs) {
  const plan = node.plan;
  const byMachine = new Map();
  plan.machines.forEach((entry) => {
    byMachine.set(entry.machineId, (byMachine.get(entry.machineId) || 0) + entry.machineCount);
    if (entry.furnaceId) byMachine.set(entry.furnaceId, (byMachine.get(entry.furnaceId) || 0) + entry.furnaceCount);
  });
  const types = [...byMachine.entries()].sort((a, b) => b[1] - a[1]);
  return `
    <div class="flow-node factory ${attrs.classes}" data-id="factory" style="${attrs.style}" title="${escapeHtml(t("factory.openTitle"))}">
      <div class="node-head">
        <span class="node-icon machine factory-mark" aria-hidden="true"><img src="static/brand/emblem.png" alt="" /></span>
        <div class="node-title">
          <strong>${escapeHtml(state.settings.factoryName || t("factory.name"))}</strong>
          <span>${t("factory.summary", { n: round(node.total), types: types.length })}</span>
        </div>
      </div>
      <div class="factory-grid">
        <div class="io factory-in">
          <div class="io-title">${t("factory.inputs")}</div>
          ${Object.entries(plan.raw).sort((a, b) => b[1] - a[1]).map(([item, rate]) => flowIoRow("in", item, rate)).join("") || `<p class="fuel-note">${t("factory.nothingOutside")}</p>`}
          ${flowInternalSuppliesHtml(plan)}
        </div>
        <div class="io factory-out">
          <div class="io-title out">${t("factory.outputs")}</div>
          ${plan.targetOutputs.map((output) => flowIoRow("out", output.item, output.rate)).join("")}
          ${state.settings.showByproducts ? Object.entries(plan.waste).map(([item, rate]) => flowIoRow("out", item, rate, { extra: "waste" })).join("") : ""}
          <div class="io-title out">${t("factory.machines")}</div>
          <div class="machine-types">
            ${types.map(([id, count]) => {
              const machine = machineById(id);
              return `<span title="${escapeHtml(machine?.name || id)}">${flowIcon(machine?.icon)}×${round(count)}</span>`;
            }).join("")}
          </div>
        </div>
      </div>
      <div class="factory-grid factory-settings">
        ${flowFactoryFuelHtml(plan)}
        ${flowFactoryFertilizerHtml(plan)}
      </div>
      <div class="factory-open">${t("factory.open")}</div>
    </div>`;
}

function flowGoalHtml(node, attrs) {
  return `
    <div class="flow-node output goal ${attrs.classes}" data-id="${escapeHtml(node.id)}" style="${attrs.style}">
      <span class="port in" data-port="${escapeHtml(flowPortKey(node.item, false))}"></span>
      <div class="node-head">
        <span class="node-icon">${flowIcon(itemIcon(node.item))}</span>
        <div class="node-title">
          <strong>${escapeHtml(node.item)}</strong>
          <span>${t("goal.output")}</span>
        </div>
        <button type="button" class="goal-remove" data-remove-output="${escapeHtml(node.outputId)}" title="${escapeHtml(t("goal.removeTitle"))}" aria-label="${escapeHtml(t("goal.removeAria", { item: node.item }))}">✕</button>
      </div>
      <label class="goal-rate">
        <input type="number" min="0.1" step="0.1" value="${escapeHtml(node.rate)}" data-flow-rate="${escapeHtml(node.outputId)}" aria-label="${escapeHtml(t("goal.rateAria", { item: node.item }))}" />
        <span>/min</span>
      </label>
    </div>`;
}

function flowAddHtml(attrs) {
  const chosen = new Set(state.settings.targetOutputs.map((output) => output.item));
  return `
    <div class="flow-node add-output ${attrs.classes}" data-id="add" style="${attrs.style}">
      <strong>${t("add.title")}</strong>
      <input type="search" placeholder="${escapeHtml(t("add.search"))}" data-flow-search aria-label="${escapeHtml(t("add.searchAria"))}" />
      <div class="add-list">
        ${outputItems().map((item) => `
          <button type="button" data-flow-add="${escapeHtml(item)}" class="${chosen.has(item) ? "chosen" : ""}">
            ${flowIcon(itemIcon(item))}<span>${escapeHtml(item)}</span>${chosen.has(item) ? "<em>✓</em>" : ""}
          </button>`).join("")}
      </div>
    </div>`;
}

// Nível 3: cada máquina física desenhada dentro do nó, com a própria carga.
function flowNodeHtml(node, hidden) {
  const lane = flowLaneColor(node);
  const classes = [node.type, flowUi.selected === node.id ? "selected" : "", flowUi.fresh.has(node.id) ? "fresh" : ""].join(" ");
  const style = `--lane:${lane};left:${node.x}px;top:${node.y}px`;

  if (node.type === "factory") return flowFactoryHtml(node, { classes, style });
  if (node.type === "unit") return flowUnitHtml(node, { classes, style });
  if (node.type === "belt") return flowBeltHtml(node, { classes, style });
  if (node.type === "goal") return flowGoalHtml(node, { classes, style });
  if (node.type === "add") return flowAddHtml({ classes, style });

  if (node.type === "item" || node.type === "waste") {
    const belts = Math.ceil(node.rate / state.settings.beltRate);
    return `
      <div class="flow-node item ${classes}" data-id="${escapeHtml(node.id)}" style="${style}">
        <span class="port in" data-port="${escapeHtml(flowPortKey(node.item, false))}"></span>
        ${node.type === "item" ? `<span class="port out" data-port="${escapeHtml(flowPortKey(node.item, false))}"></span>` : ""}
        ${flowIcon(itemIcon(node.item), "item-icon")}
        <strong>${escapeHtml(node.item)}</strong>
        <span class="rate">${formatRate(node.rate)}</span>
        <span class="item-meta">${node.type === "waste" ? t("item.waste") : t("item.belts", { n: belts })}</span>
      </div>`;
  }

  if (node.type === "raw" || node.type === "output") {
    const port = node.type === "raw" ? "out" : "in";
    const burnedHere = node.type === "raw" && flowUi.graph.edges.some((edge) => edge.from === node.id && (edge.fuel || edge.fertilizer));
    return `
      <div class="flow-node ${classes}" data-id="${escapeHtml(node.id)}" style="${style}">
        <span class="port ${port}" data-port="${escapeHtml(flowPortKey(node.item, false))}"></span>
        <div class="node-head">
          <span class="node-icon">${flowIcon(itemIcon(node.item))}</span>
          <div class="node-title">
            <strong>${escapeHtml(node.item)}</strong>
            <span><span class="rate">${formatRate(node.rate)}</span> ${escapeHtml(node.label || (node.type === "raw" ? (fuelItems().includes(node.item) ? t("raw.fuelInput") : t("raw.input")) : t("goal.output")))}</span>
          </div>
        </div>
        ${burnedHere ? flowSupplyLineButton(node.item) : ""}
      </div>`;
  }

  const entry = node.entry;
  const machine = machineById(entry.machineId);
  const inputs = flowIncoming(node.id);
  const hiddenUp = flowUi.collapsed.has(node.id) ? [...flowUpstream(node.id)].filter((id) => hidden.has(id)) : [];
  const hiddenMachines = hiddenUp.filter((id) => flowUi.byId.get(id).type === "process");
  const hiddenRaw = [...new Set(hiddenUp.map((id) => flowUi.byId.get(id)).filter((entry) => entry.type === "raw").map((entry) => entry.item))];
  const canCollapse = inputs.some((edge) => flowUi.byId.get(edge.from).type !== "raw");
  const wastes = flowOutgoing(node.id).filter((edge) => edge.waste);
  const toolbar = `
      <div class="node-toolbar">
        ${canCollapse ? `<button type="button" data-flow-act="collapse">${flowUi.collapsed.has(node.id) ? t("node.expand") : t("node.collapse")}</button>` : ""}
        <button type="button" data-flow-act="details" title="${escapeHtml(t("node.details"))}">ⓘ</button>
      </div>`;
  const collapsedChip = hiddenMachines.length ? `
        <span class="chip collapsed" data-flow-act="collapse" title="${escapeHtml(t("node.expandTitle"))}">
          ${t("node.hidden", { n: hiddenMachines.length })}
          ${hiddenRaw.map((item) => flowIcon(itemIcon(item))).join("")}
        </span>` : "";

  return `
    <div class="flow-node process ${classes}" data-id="${escapeHtml(node.id)}" style="${style}">
      ${toolbar}
      <div class="node-head">
        <span class="node-icon machine">${flowIcon(machine?.icon)}</span>
        <div class="node-title">
          <strong>${escapeHtml(machine?.name || entry.machine)}</strong>
          <span class="node-product">${flowIcon(itemIcon(entry.item))}${escapeHtml(entry.recipe)}</span>
        </div>
        <span class="count-badge" title="${escapeHtml(t("node.countTitle", { n: round(entry.machineCount), whole: Math.ceil(entry.machineCount) }))}">×${round(entry.machineCount)}</span>
      </div>
      <div class="load-line">
        <div class="load"><span style="width:${Math.min(100, entry.load * 100)}%"></span></div>
        <span>${round(entry.load * 100)}%</span>
      </div>
      ${flowFurnaceLine(entry)}
      ${flowNurseryLine(entry)}
      <div class="io">
        ${inputs.length ? `<div class="io-title">${t("factory.inputs")}</div>` : ""}
        ${inputs.map((edge) => flowIoRow("in", edge.item, edge.rate, { kind: flowKind(edge), extra: hidden.has(edge.from) ? "hidden-src" : "" })).join("")}
        <div class="io-title out">${t("factory.outputs")}</div>
        ${flowIoRow("out", entry.item, entry.demand)}
        ${wastes.map((edge) => flowIoRow("out", edge.item, edge.rate, { extra: "waste" })).join("")}
      </div>
      ${flowRecipeSelect(entry.item)}
      ${flowFurnaceSelect(entry)}
      ${flowFuelSelect(entry)}
      ${flowPlantingSelect(entry)}
      ${flowFertilizerSelect(entry)}
      ${collapsedChip}
    </div>`;
}

function flowRenderNodes() {
  const hidden = flowHiddenNodes();
  flowEls.nodes.innerHTML = flowUi.graph.nodes
    .filter((node) => !hidden.has(node.id))
    .map((node) => flowNodeHtml(node, hidden))
    .join("");
  flowDrawEdges();
  flowRenderDetails();
  enhanceIconSelects(flowEls.stage);
}

function flowBoxes() {
  const map = new Map();
  flowEls.nodes.querySelectorAll(".flow-node").forEach((el) => {
    map.set(el.dataset.id, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, el });
  });
  return map;
}

function flowPortPoint(el, dir, key) {
  const port = [...el.querySelectorAll(`.port.${dir}`)].find((entry) => entry.dataset.port === key) || el.querySelector(`.port.${dir}`);
  const rect = port.getBoundingClientRect();
  const worldRect = flowEls.world.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2 - worldRect.left) / flowUi.scale,
    y: (rect.top + rect.height / 2 - worldRect.top) / flowUi.scale
  };
}

function flowDrawEdges() {
  const box = flowBoxes();
  const hot = flowHighlightSet();
  flowEls.edges.innerHTML = flowUi.graph.edges
    .filter((edge) => box.has(edge.from) && box.has(edge.to))
    .map((edge) => {
      const isHot = hot && hot.has(edge.from) && hot.has(edge.to);
      const classes = ["edge", edge.fuel ? "fuel" : "", edge.fertilizer ? "fertilizer" : "", edge.waste ? "waste" : "", edge.loop ? "loop" : "", isHot ? "hot" : "", hot && !isHot ? "dim" : ""].join(" ");
      const lane = flowLaneColor(flowUi.byId.get(edge.to));
      const start = flowPortPoint(box.get(edge.from).el, "out", flowPortKey(edge.item, false));
      const end = flowPortPoint(box.get(edge.to).el, "in", flowPortKey(edge.item, flowKind(edge)));
      const dx = Math.max(60, Math.abs(end.x - start.x) / 2);
      return `<path class="${classes}" style="--lane:${lane}" d="M${start.x},${start.y} C${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}" />`;
    })
    .join("");
  box.forEach((entry, id) => entry.el.classList.toggle("dim", !!hot && !hot.has(id)));
  flowDrawGroups(box, hot);
}

function flowDrawGroups(box, hot) {
  if (flowLayout() !== "clusters" || flowUi.level === 3) {
    flowEls.groups.innerHTML = "";
    return;
  }
  flowEls.groups.innerHTML = flowUi.graph.lanes.map((lane) => {
    const members = flowUi.graph.nodes.filter((node) => node.lane === lane.id && box.has(node.id));
    if (!members.length) return "";
    const x = Math.min(...members.map((node) => box.get(node.id).x)) - FLOW_GROUP_PAD;
    const y = Math.min(...members.map((node) => box.get(node.id).y)) - FLOW_GROUP_PAD - FLOW_GROUP_HEAD;
    const right = Math.max(x + FLOW_GROUP_MIN_WIDTH, Math.max(...members.map((node) => box.get(node.id).x + box.get(node.id).w)) + FLOW_GROUP_PAD);
    const bottom = Math.max(...members.map((node) => box.get(node.id).y + box.get(node.id).h)) + FLOW_GROUP_PAD;
    const machines = flowUi.graph.nodes.filter((node) => node.lane === lane.id && node.type === "process");
    const machineCount = machines.reduce((sum, node) => sum + node.entry.machineCount, 0);
    const collapsed = flowUi.collapsed.has(lane.root);
    const dim = hot && !members.some((node) => hot.has(node.id)) ? "dim" : "";
    return `
      <div class="flow-group ${dim} ${flowIsLocked(lane.id) ? "locked" : ""}" data-lane="${escapeHtml(lane.id)}" title="${escapeHtml(flowIsLocked(lane.id) ? t("group.lockedTitle") : t("group.unlockedTitle"))}" style="--lane:${lane.color};left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px">
        <div class="group-head">
          <strong>${flowUi.buildOrder ? `${flowUi.buildOrder.order.indexOf(lane.id) + 1}. ` : ""}${escapeHtml(flowLaneLabel(lane))}</strong>
          <span>${t("group.summary", { recipes: machines.length, machines: round(machineCount) })}</span>
          <button type="button" class="group-detail" data-flow-detail="${escapeHtml(lane.id)}" title="${escapeHtml(t("group.fullLineTitle"))}">${t("group.fullLine")}</button>
          <button type="button" class="group-lock" data-flow-lock="${escapeHtml(lane.id)}" aria-pressed="${flowIsLocked(lane.id)}" title="${escapeHtml(flowIsLocked(lane.id) ? t("group.lockedLock") : t("group.unlockedLock"))}">${flowIsLocked(lane.id) ? "🔒" : "🔓"}</button>
          ${lane.root ? `<button type="button" data-flow-group="${escapeHtml(lane.root)}">${collapsed ? t("node.expand") : t("node.collapse")}</button>` : ""}
        </div>
      </div>`;
  }).join("");
}

function flowRenderDetails() {
  const node = flowUi.byId.get(flowUi.selected);
  if (!node || node.type !== "process") {
    flowEls.details.classList.remove("open");
    return;
  }
  const entry = node.entry;
  const machine = machineById(entry.machineId);
  const lane = flowUi.graph.lanes.find((item) => item.id === node.lane);
  const wastes = flowOutgoing(node.id).filter((edge) => edge.waste);
  const recipe = selectedRecipeFor(entry.item);
  const ioLine = (item, rate, suffix = "") => `<div>${flowIcon(itemIcon(item))}${escapeHtml(item)}${suffix}<span>${formatRate(rate)}</span></div>`;
  flowEls.details.innerHTML = `
    <header>
      ${flowIcon(machine?.icon)}
      <div><h2>${escapeHtml(machine?.name || entry.machine)}</h2><p>${escapeHtml(t("details.produces", { item: entry.item, lane: lane?.name || "" }))}</p></div>
      <button type="button" class="close" data-flow-act="close" aria-label="${escapeHtml(t("details.close"))}">✕</button>
    </header>
    <h3>${t("details.production")}</h3>
    <div class="stat-grid">
      <div class="stat"><strong>${formatRate(entry.demand)}</strong><span>${t("details.demand")}</span></div>
      <div class="stat"><strong>×${round(entry.machineCount)}</strong><span>${t("details.machines", { n: Math.ceil(entry.machineCount) })}</span></div>
      <div class="stat"><strong>${round(entry.load * 100)}%</strong><span>${t("details.load")}</span></div>
      <div class="stat"><strong>${round(recipe?.seconds || 0)}s</strong><span>${t("details.cycle")}</span></div>
    </div>
    ${recipesFor(entry.item).length > 1 ? `<h3>${t("details.recipe")}</h3>${flowRecipeSelect(entry.item)}` : ""}
    ${entry.fuelItem ? `<h3>${t("details.heating")}</h3>${flowFurnaceLine(entry)}${flowFurnaceSelect(entry)}${flowFuelSelect(entry)}` : ""}
    ${entry.planting || entry.fertilizerItem ? `<h3>${t("details.planting")}</h3>${flowNurseryLine(entry)}${flowPlantingSelect(entry)}${flowFertilizerSelect(entry)}` : ""}
    <h3>${t("details.inputs")}</h3>
    <div class="io-list">${flowIncoming(node.id).map((edge) => ioLine(edge.item, edge.rate, edge.fuel ? " 🔥" : edge.fertilizer ? " 🌱" : "")).join("") || `<p class="note">${t("details.none")}</p>`}</div>
    <h3>${t("details.outputs")}</h3>
    <div class="io-list">
      ${ioLine(entry.item, entry.demand)}
      ${wastes.map((edge) => ioLine(edge.item, edge.rate, t("details.waste"))).join("")}
    </div>`;
  flowEls.details.classList.add("open");
}

// ---------- layout ----------

// Desce para os consumidores reais, atravessando os nós de item.
function flowAnchors(node) {
  return flowOutgoing(node.id).flatMap((edge) => {
    const target = flowUi.byId.get(edge.to);
    return target.type === "item" ? flowOutgoing(target.id).map((next) => flowUi.byId.get(next.to)) : [target];
  });
}

function flowAutoLayout() {
  const graph = flowUi.graph;
  graph.nodes.forEach((node) => {
    node.x = 0;
    node.y = 0;
  });
  flowRenderNodes();
  let box = flowBoxes();

  // Largura de cada coluna = nó mais largo + o nó de item que ele produz.
  const producers = new Set(graph.nodes.filter((node) => node.producer).map((node) => node.producer));
  const colWidth = new Map();
  graph.nodes.filter((node) => !node.producer && box.has(node.id)).forEach((node) => {
    const width = box.get(node.id).w + (producers.has(node.id) ? FLOW_ITEM_GAP + 150 : 0);
    colWidth.set(node.col, Math.max(colWidth.get(node.col) || 0, width));
  });
  const colX = new Map();
  let cursor = 0;
  const sortedCols = [...colWidth.keys()].sort((a, b) => a - b);
  sortedCols.forEach((col, index) => {
    colX.set(col, cursor);
    // Sub-colunas da mesma receita (nível 3) ficam mais juntas.
    const next = sortedCols[index + 1];
    const sameRecipe = next !== undefined && Math.floor(next) === Math.floor(col);
    cursor += colWidth.get(col) + (sameRecipe ? 20 : FLOW_COL_GAP);
  });
  graph.nodes.forEach((node) => {
    if (!node.producer) node.x = colX.get(node.col) || 0;
  });

  // Da direita para a esquerda, cada nó mira a altura média de quem consome sua produção;
  // depois empilha a coluna sem sobreposição. Clusters fazem isso por subcadeia; colunas (e o
  // nível 3, que é um bloco só), no grafo todo.
  const columns = flowLayout() === "columns" || flowUi.level === 3;
  const layoutGroups = columns
    ? [graph.nodes.filter((node) => !node.producer && box.has(node.id))]
    : graph.lanes.map((lane) => graph.nodes.filter((node) => node.lane === lane.id && !node.producer && box.has(node.id)));
  layoutGroups.forEach((members) => {
    const cols = [...new Set(members.map((node) => node.col))].sort((a, b) => b - a);
    const placed = new Set();
    cols.forEach((col) => {
      const column = members.filter((node) => node.col === col);
      column.forEach((node) => {
        const anchors = flowAnchors(node).filter((target) => placed.has(target.id));
        node.desired = anchors.length ? anchors.reduce((sum, target) => sum + target.y, 0) / anchors.length : 0;
      });
      let previous = null;
      column.sort((a, b) => a.desired - b.desired).forEach((node) => {
        node.y = previous ? Math.max(node.desired, previous.y + box.get(previous.id).h + FLOW_ROW_GAP) : node.desired;
        previous = node;
        placed.add(node.id);
      });
      // Nas colunas, recentra a pilha em torno dos consumidores para a árvore não pender para baixo.
      if (columns) {
        const average = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
        const shift = average(column.map((node) => node.desired)) - average(column.map((node) => node.y + box.get(node.id).h / 2)) + 40;
        column.forEach((node) => { node.y += shift; });
      }
    });
  });
  flowRenderNodes();
  flowAlignItemNodes();
  flowRenderNodes();

  // Empilha as subcadeias; a final fica centralizada à direita.
  box = flowBoxes();
  if (columns) {
    flowApplyOffsets();
    flowRenderNodes();
    return;
  }
  const laneMembers = (lane) => graph.nodes.filter((node) => node.lane === lane.id && box.has(node.id));
  // Retângulo da caixa da subcadeia, com cabeçalho e margens (o mesmo de flowDrawGroups).
  const laneBox = (members) => {
    const x = Math.min(...members.map((node) => node.x)) - FLOW_GROUP_PAD;
    const y = Math.min(...members.map((node) => node.y)) - FLOW_GROUP_PAD - FLOW_GROUP_HEAD;
    const right = Math.max(x + FLOW_GROUP_MIN_WIDTH, Math.max(...members.map((node) => node.x + box.get(node.id).w)) + FLOW_GROUP_PAD);
    const bottom = Math.max(...members.map((node) => node.y + box.get(node.id).h)) + FLOW_GROUP_PAD;
    return { x, y, right, bottom };
  };
  const placed = [];
  // Coloca a subcadeia o mais perto possível de desiredTop sem encostar em nenhuma já posta.
  const place = (members, desiredTop) => {
    const area = laneBox(members);
    let shift = desiredTop - area.y;
    for (let guard = 0; guard < 500; guard += 1) {
      const top = area.y + shift;
      const bottom = area.bottom + shift;
      const hit = placed.find((other) => (
        area.x < other.right && area.right > other.x &&
        top < other.bottom + FLOW_GROUP_SPACING && bottom > other.y - FLOW_GROUP_SPACING
      ));
      if (!hit) break;
      shift = hit.bottom + FLOW_GROUP_SPACING - area.y;
    }
    members.forEach((node) => { node.y += shift; });
    placed.push({ x: area.x, right: area.right, y: area.y + shift, bottom: area.bottom + shift });
  };

  // Cada subcadeia sobe até o primeiro espaço livre (blocos em colunas diferentes ficam lado a
  // lado). A final mira o meio do conjunto, mas desce se colidir — várias saídas deixam o bloco
  // final largo, cruzando as colunas das outras subcadeias.
  graph.lanes.filter((lane) => lane.id !== "final").forEach((lane) => {
    const members = laneMembers(lane);
    if (members.length) place(members, 0);
  });
  const finalMembers = laneMembers(graph.lanes[0]);
  if (finalMembers.length) {
    const area = laneBox(finalMembers);
    const stackTop = placed.length ? Math.min(...placed.map((entry) => entry.y)) : 0;
    const stackBottom = placed.length ? Math.max(...placed.map((entry) => entry.bottom)) : 0;
    place(finalMembers, Math.max(stackTop, (stackTop + stackBottom) / 2 - (area.bottom - area.y) / 2));
  }

  flowApplyOffsets();
  flowRenderNodes();
}

// Posições arrastadas pelo usuário continuam valendo.
function flowApplyOffsets() {
  flowUi.graph.nodes.forEach((node) => {
    const offset = flowUi.offsets[node.producer || node.id];
    if (!offset) return;
    node.x += offset.x;
    node.y += offset.y;
  });
}

function flowOverviewLayout() {
  flowUi.graph.nodes.forEach((node) => {
    node.x = 0;
    node.y = 0;
  });
  flowRenderNodes();
  const box = flowBoxes();
  // Colunas lado a lado, cada uma com a largura do seu nó mais largo.
  const columnX = [];
  let cursor = 0;
  [0, 1, 2].forEach((col) => {
    columnX[col] = cursor;
    const widths = flowUi.graph.nodes.filter((node) => node.col === col && box.has(node.id)).map((node) => box.get(node.id).w);
    cursor += (widths.length ? Math.max(...widths) : 0) + 140;
  });
  flowUi.graph.nodes.forEach((node) => { node.x = columnX[node.col]; });
  [0, 1, 2].forEach((col) => {
    const column = flowUi.graph.nodes.filter((node) => node.col === col && box.has(node.id));
    const height = column.reduce((sum, node) => sum + box.get(node.id).h, 0) + 24 * Math.max(0, column.length - 1);
    let y = -height / 2;
    column.forEach((node) => {
      node.y = y;
      y += box.get(node.id).h + 24;
    });
  });
  flowRenderNodes();
}

// Cada nó de item fica na altura da porta de saída da máquina que o produz.
function flowAlignItemNodes() {
  const box = flowBoxes();
  flowUi.graph.nodes.filter((node) => node.producer && box.has(node.id) && box.has(node.producer)).forEach((node) => {
    const producer = box.get(node.producer);
    const own = box.get(node.id);
    const anchorY = flowPortPoint(producer.el, "out", flowPortKey(node.item, false)).y;
    node.x = producer.x + producer.w + FLOW_ITEM_GAP;
    node.y = anchorY - own.h / 2;
    if (node.type === "waste") node.y += box.get(node.id).h + 16;
  });
}

// ---------- viewport ----------

function flowApplyView() {
  flowEls.world.style.transform = `translate(${flowUi.x}px, ${flowUi.y}px) scale(${flowUi.scale})`;
  const zoom = document.querySelector("#statusZoom");
  if (zoom) zoom.textContent = t("status.zoom", { n: Math.round(flowUi.scale * 100) });
}

function flowFit() {
  const boxes = [...flowBoxes().values()];
  if (!boxes.length) return;
  flowFitBounds({
    minX: Math.min(...boxes.map((entry) => entry.x)) - 60,
    minY: Math.min(...boxes.map((entry) => entry.y)) - 60,
    maxX: Math.max(...boxes.map((entry) => entry.x + entry.w)) + 60,
    maxY: Math.max(...boxes.map((entry) => entry.y + entry.h)) + 50
  });
}

// Zoom para um bloco (subcadeia): enquadra a caixa dele.
function flowFitGroup(groupEl) {
  flowFitBounds({
    minX: groupEl.offsetLeft - 30,
    minY: groupEl.offsetTop - 30,
    maxX: groupEl.offsetLeft + groupEl.offsetWidth + 30,
    maxY: groupEl.offsetTop + groupEl.offsetHeight + 30
  });
}

function flowFitBounds({ minX, minY, maxX, maxY }) {
  // Enquadra na área do editor, com uma margem.
  const rect = flowEls.stage.getBoundingClientRect();
  const inset = { top: FLOW_HUD_TOP, bottom: FLOW_HUD_BOTTOM, left: 16, right: 16 };
  const width = rect.width - inset.left - inset.right;
  const height = rect.height - inset.top - inset.bottom;
  flowUi.scale = Math.min(1, Math.max(0.2, Math.min(width / (maxX - minX), height / (maxY - minY))));
  flowUi.x = inset.left + (width - (maxX - minX) * flowUi.scale) / 2 - minX * flowUi.scale;
  flowUi.y = inset.top + (height - (maxY - minY) * flowUi.scale) / 2 - minY * flowUi.scale;
  flowApplyView();
}

function flowZoomAt(factor, cx, cy) {
  const next = Math.min(1.8, Math.max(0.2, flowUi.scale * factor));
  flowUi.x = cx - ((cx - flowUi.x) / flowUi.scale) * next;
  flowUi.y = cy - ((cy - flowUi.y) / flowUi.scale) * next;
  flowUi.scale = next;
  flowApplyView();
}

function flowZoomBy(factor) {
  const rect = flowEls.stage.getBoundingClientRect();
  flowZoomAt(factor, rect.width / 2, rect.height / 2);
}

function flowPanBy(dx, dy) {
  flowUi.x += dx;
  flowUi.y += dy;
  flowApplyView();
}

function flowToast(text) {
  flowEls.toast.textContent = text;
  flowEls.toast.classList.add("show");
  clearTimeout(flowUi.toastTimer);
  flowUi.toastTimer = setTimeout(() => flowEls.toast.classList.remove("show"), 4200);
}

// ---------- entrada principal ----------

function flowLayout() {
  return state.settings.flowLayout === "columns" ? "columns" : "clusters";
}

function flowLevel() {
  const level = Number(state.settings.flowLevel);
  if (level === 3 && flowUi.detailLane) return 3;
  return level === 1 ? 1 : 2;
}

// Abas de bloco: várias podem ficar abertas; cada uma lembra o próprio zoom e posição.
function flowSaveDetailView() {
  if (flowUi.level !== 3) return;
  const tab = flowUi.detailTabs.find((entry) => entry.lane === flowUi.detailLane);
  if (tab) tab.view = { x: flowUi.x, y: flowUi.y, scale: flowUi.scale };
}

// Estado das abas (para as fábricas salvas): aba ativa, abas de linha abertas e a vista de cada uma.
function flowExportTabs() {
  flowSaveDetailView();
  return {
    level: flowUi.level,
    detailLane: flowUi.detailLane,
    tabs: flowUi.detailTabs.map((tab) => ({ lane: tab.lane, name: tab.name, view: tab.view }))
  };
}

function flowImportTabs(ui) {
  flowUi.detailTabs = (ui?.tabs || []).map((tab) => ({ lane: tab.lane, name: tab.name, view: tab.view || null, key: "" }));
  flowUi.detailLane = flowUi.detailTabs.some((tab) => tab.lane === ui?.detailLane) ? ui.detailLane : flowUi.detailTabs[0]?.lane || "";
  return [1, 2, 3].includes(ui?.level) ? ui.level : null;
}

function flowOpenDetail(laneId, name) {
  flowSaveDetailView();
  if (!flowUi.detailTabs.some((tab) => tab.lane === laneId)) flowUi.detailTabs.push({ lane: laneId, name, view: null, key: "" });
  flowUi.detailLane = laneId;
  flowSetLevel(3);
}

function flowCloseDetail(laneId) {
  const index = flowUi.detailTabs.findIndex((tab) => tab.lane === laneId);
  if (index < 0) return;
  flowUi.detailTabs.splice(index, 1);
  if (laneId === flowUi.detailLane) {
    const next = flowUi.detailTabs[index] || flowUi.detailTabs[index - 1];
    flowUi.detailLane = next ? next.lane : "";
    if (!next && Number(state.settings.flowLevel) === 3) state.settings.flowLevel = 2;
  }
  render();
}

// Abas do editor: uma por bloco aberto, com ✕ para fechar.
function flowRenderTabs(level) {
  const tabs = flowUi.detailTabs.map((tab) => `
    <div class="detail-tab ${level === 3 && tab.lane === flowUi.detailLane ? "active" : ""}">
      <button type="button" data-flow-detail-tab="${escapeHtml(tab.lane)}" title="${escapeHtml(t("tab.line", { name: tab.name }))}">▦ ${escapeHtml(t("tab.line", { name: tab.name }))}</button>
      <button type="button" class="detail-close" data-flow-detail-close="${escapeHtml(tab.lane)}" title="${escapeHtml(t("tab.close"))}" aria-label="${escapeHtml(t("tab.closeAria", { name: tab.name }))}">✕</button>
    </div>`).join("");
  document.querySelector("[data-detail-tabs]").innerHTML = tabs;
}

function drawFlow(plan) {
  const level = flowLevel();
  const levelChanged = level !== flowUi.level;
  flowUi.level = level;
  flowEls.stage.dataset.level = level;
  document.querySelectorAll("[data-flow-level]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.flowLevel) === level);
  });
  const layout = flowLayout();
  const layoutChanged = layout !== flowUi.layout;
  flowUi.layout = layout;
  document.querySelector(".flow-layouts").hidden = level !== 2;
  document.querySelectorAll("[data-flow-layout]").forEach((button) => {
    button.classList.toggle("active", button.dataset.flowLayout === layout);
  });
  flowUi.hover = "";
  if (level !== 2) flowUi.buildOrder = null;
  // Linhas (blocos) da fábrica, para a barra lateral em qualquer aba.
  const base = plan.targetOutputs.length ? buildFlowGraph(plan) : null;
  flowUi.lines = base ? { base, ...flowBuildOrder(base) } : null;
  // Abas de blocos que deixaram de existir fecham sozinhas.
  const gone = flowUi.detailTabs.filter((tab) => !base?.lanes.some((lane) => lane.id === tab.lane));
  if (gone.length) {
    flowUi.detailTabs = flowUi.detailTabs.filter((tab) => !gone.includes(tab));
    flowToast(t("toast.blocksGone", { names: gone.map((tab) => tab.name).join(", ") }));
    if (gone.some((tab) => tab.lane === flowUi.detailLane)) {
      flowUi.detailLane = flowUi.detailTabs[0]?.lane || "";
      if (!flowUi.detailLane && level === 3) {
        state.settings.flowLevel = 2;
        drawFlow(plan);
        return;
      }
    }
  }
  flowRenderTabs(level);
  flowRenderLegend();

  if (level === 3) {
    const tab = flowUi.detailTabs.find((entry) => entry.lane === flowUi.detailLane);
    flowUi.graph = buildDetailGraph(base, flowUi.detailLane);
    flowUi.byId = new Map(flowUi.graph.nodes.map((node) => [node.id, node]));
    flowUi.fresh = new Set();
    flowEls.details.classList.remove("open");
    flowAutoLayout();
    const key = flowUi.graph.nodes.map((node) => node.id).join("|");
    if (tab.view && (tab.key === key || !tab.key)) {
      Object.assign(flowUi, tab.view);
      flowApplyView();
    } else {
      flowFit();
    }
    tab.key = key;
    return;
  }

  if (level === 1) {
    flowUi.graph = buildOverviewGraph(plan);
    flowUi.byId = new Map(flowUi.graph.nodes.map((node) => [node.id, node]));
    flowUi.fresh = new Set();
    flowOverviewLayout();
    // Editar a meta mantém a vista; adicionar/remover saídas reajusta.
    const key = flowUi.graph.nodes.map((node) => node.id).join("|");
    if (levelChanged || key !== flowUi.overviewKey) flowFit();
    flowUi.overviewKey = key;
    return;
  }

  const previousMachines = flowUi.lastMachines;
  const previousTotal = (previousMachines || []).reduce((sum, node) => sum + node.entry.machineCount, 0);

  flowUi.graph = buildFlowGraph(plan);
  flowUi.byId = new Map(flowUi.graph.nodes.map((node) => [node.id, node]));
  const machines = flowUi.graph.nodes.filter((node) => node.type === "process");
  flowUi.lastMachines = machines;

  // Trocar produto/saídas recomeça a vista; trocar receita ou combustível só mostra a diferença.
  const outputsKey = JSON.stringify(plan.targetOutputs.map((output) => output.item));
  const newPlan = outputsKey !== flowUi.outputsKey;
  flowUi.outputsKey = outputsKey;
  const compare = previousMachines && !newPlan;
  const previousIds = new Set((previousMachines || []).map((node) => node.id));
  const added = compare ? machines.filter((node) => !previousIds.has(node.id)) : [];
  const removed = compare ? previousMachines.filter((node) => !flowUi.byId.has(node.id)) : [];

  if (newPlan || layoutChanged) {
    flowUi.offsets = {};
    flowUi.unlocked.clear();
  }
  if (newPlan) {
    flowUi.collapsed.clear();
    flowUi.selected = "";
  }
  flowUi.collapsed.forEach((id) => { if (!flowUi.byId.has(id)) flowUi.collapsed.delete(id); });
  Object.keys(flowUi.offsets).forEach((id) => { if (!flowUi.byId.has(id)) delete flowUi.offsets[id]; });
  if (!flowUi.byId.has(flowUi.selected)) flowUi.selected = "";

  flowUi.fresh = new Set(added.map((node) => node.id));
  clearTimeout(flowUi.freshTimer);
  if (added.length) {
    flowUi.freshTimer = setTimeout(() => {
      flowUi.fresh.clear();
      flowEls.nodes.querySelectorAll(".fresh").forEach((el) => el.classList.remove("fresh"));
    }, 2600);
  }

  if (!plan.targetOutputs.length) {
    flowUi.buildOrder = null;
    flowEls.nodes.innerHTML = `<div class="flow-empty">${t("flow.empty")}</div>`;
    flowEls.edges.innerHTML = "";
    flowEls.groups.innerHTML = "";
    flowEls.details.classList.remove("open");
    flowUi.scale = 1;
    flowUi.x = 0;
    flowUi.y = 0;
    flowApplyView();
    return;
  }

  flowUi.buildOrder = flowBuildOrder(flowUi.graph);
  flowAutoLayout();
  if (newPlan || !previousMachines || levelChanged || layoutChanged) flowFit();

  if (added.length || removed.length) {
    const total = machines.reduce((sum, node) => sum + node.entry.machineCount, 0);
    const names = (list) => [...new Set(list.map((node) => node.entry.machine))].slice(0, 3).join(", ");
    const parts = [];
    if (added.length) parts.push(`+${added.length} (${names(added)})`);
    if (removed.length) parts.push(`−${removed.length} (${names(removed)})`);
    flowToast(t("toast.changed", { parts: parts.join(" · "), before: round(previousTotal), after: round(total) }));
  }
}

// Ordem de montagem: um bloco vem depois dos blocos que o abastecem. Ciclos (ex.: um combustível
// que realimenta a própria linha) são ignorados; se sobrar dependência circular, segue a ordem original.
function flowBuildOrder(graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const depends = new Map(graph.lanes.map((lane) => [lane.id, new Set()]));
  graph.edges.forEach((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || edge.loop || from.type === "raw" || from.lane === to.lane) return;
    depends.get(to.lane)?.add(from.lane);
  });
  const order = [];
  const remaining = graph.lanes.map((lane) => lane.id);
  while (remaining.length) {
    const ready = remaining.find((id) => [...depends.get(id)].every((dep) => order.includes(dep) || !depends.has(dep)))
      || remaining.reduce((best, id) => ([...depends.get(id)].filter((dep) => !order.includes(dep)).length
        < [...depends.get(best)].filter((dep) => !order.includes(dep)).length ? id : best));
    order.push(ready);
    remaining.splice(remaining.indexOf(ready), 1);
  }
  return { order, depends };
}

function flowLaneLabel(lane) {
  return `${t(`lane.kind.${{ final: "final", fuel: "fuel", fertilizer: "fertilizer" }[lane.kind] || "chain"}`)} · ${lane.kind === "final" ? t("lane.final") : lane.name}`;
}

function flowRenderLegend() {
  const legend = flowEls.legend;
  const lines = flowUi.lines;
  const show = Boolean(lines && lines.base.lanes.length > 1);
  legend.querySelector("[data-legend-empty]").hidden = show;
  if (!show) {
    legend.querySelector(".legend-list").innerHTML = "";
    return;
  }
  const { base, order, depends } = lines;
  legend.querySelector(".legend-list").innerHTML = order.map((laneId, index) => {
    const lane = base.lanes.find((entry) => entry.id === laneId);
    const machines = base.nodes.filter((node) => node.lane === laneId && node.type === "process");
    const count = machines.reduce((sum, node) => sum + node.entry.machineCount, 0);
    const uses = [...depends.get(laneId)].map((dep) => order.indexOf(dep) + 1).filter((number) => number > 0).sort((a, b) => a - b);
    const open = flowUi.detailTabs.some((tab) => tab.lane === laneId);
    return `
      <li style="--lane:${lane.color}" class="${flowUi.level === 3 && flowUi.detailLane === laneId ? "current" : ""}">
        <div class="legend-row">
          <b>${index + 1}</b>
          <button type="button" class="legend-text" data-legend-detail="${escapeHtml(laneId)}" title="${escapeHtml(t("legend.openTitle"))}">
            <strong>${escapeHtml(flowLaneLabel(lane))}${open ? ` <span class="legend-open" title="${escapeHtml(t("legend.openMark"))}">●</span>` : ""}</strong>
            <em>${t("legend.summary", { recipes: machines.length, machines: round(count) })}${uses.length ? ` · ${t("legend.uses", { list: uses.join(", ") })}` : ""}</em>
          </button>
        </div>
        <div class="legend-actions">
          <button type="button" data-legend-zoom="${escapeHtml(laneId)}" title="${escapeHtml(t("legend.zoomTitle"))}">${t("legend.zoom")}</button>
          <button type="button" data-legend-detail="${escapeHtml(laneId)}" title="${escapeHtml(t("group.fullLineTitle"))}">${t("group.fullLine")}</button>
        </div>
      </li>`;
  }).join("");
}

// Cadeado dos blocos (nível 2, Clusters): por padrão todos ficam bloqueados.
function flowIsLocked(laneId) {
  return flowUi.level === 2 && flowLayout() === "clusters" && Boolean(laneId) && !flowUi.unlocked.has(laneId);
}

function flowToggleLock(laneId) {
  if (flowUi.unlocked.has(laneId)) flowUi.unlocked.delete(laneId);
  else flowUi.unlocked.add(laneId);
  flowDrawEdges();
}

// Zoom num bloco: a caixa dele (Clusters) ou o conjunto dos seus nós (Colunas).
function flowFitLane(laneId) {
  const groupEl = flowEls.groups.querySelector(`[data-lane="${CSS.escape(laneId)}"]`);
  if (groupEl) {
    flowFitGroup(groupEl);
    return;
  }
  const boxes = flowBoxes();
  const members = flowUi.graph.nodes.filter((node) => node.lane === laneId && boxes.has(node.id)).map((node) => boxes.get(node.id));
  if (!members.length) return;
  flowFitBounds({
    minX: Math.min(...members.map((b) => b.x)) - 40,
    minY: Math.min(...members.map((b) => b.y)) - 40,
    maxX: Math.max(...members.map((b) => b.x + b.w)) + 40,
    maxY: Math.max(...members.map((b) => b.y + b.h)) + 40
  });
}

function flowSetLevel(level) {
  flowSaveDetailView();
  state.settings.flowLevel = level;
  render();
}

function flowToggleCollapse(id) {
  if (flowUi.collapsed.has(id)) flowUi.collapsed.delete(id);
  else flowUi.collapsed.add(id);
  flowAutoLayout();
}

// ---------- eventos ----------

flowEls.stage.addEventListener("pointerdown", (event) => {
  // O palco captura o ponteiro (para arrastar), então click/dblclick chegam com target = palco;
  // guardamos aqui onde o clique começou de fato.
  const pressedNode = flowUi.byId.get(event.target.closest(".flow-node")?.dataset.id);
  flowUi.pressed = {
    lane: pressedNode ? pressedNode.lane || "" : event.target.closest(".flow-group")?.dataset.lane || "",
    nodeId: pressedNode?.id || "",
    ignore: Boolean(event.target.closest(".flow-details, button, select, input, textarea, .add-list, .icon-select"))
  };
  if (event.button !== 0 || event.target.closest("select, button, input, .flow-details, .chip.collapsed, .add-list")) return;
  const nodeEl = event.target.closest(".flow-node");
  const node = nodeEl ? flowUi.byId.get(nodeEl.dataset.id) : null;
  // Arrastar um nó de item move a máquina que o produz. Blocos com cadeado fechado não se
  // movem (nem os nós dentro deles): arrastar sobre eles só move a tela.
  const candidate = node?.producer ? flowUi.byId.get(node.producer) : node;
  const dragNode = candidate && !flowIsLocked(candidate.lane) ? candidate : null;
  // Clicar na área vazia (ou no cabeçalho) de um bloco dá zoom; arrastar move o bloco, se aberto.
  const groupLane = !nodeEl ? event.target.closest(".flow-group")?.dataset.lane || "" : "";
  const movableLane = groupLane && !flowIsLocked(groupLane) ? groupLane : "";
  flowUi.drag = {
    node: dragNode,
    groupLane,
    group: movableLane ? flowUi.graph.nodes.filter((entry) => entry.lane === movableLane && flowEls.nodes.querySelector(`[data-id="${CSS.escape(entry.id)}"]`)) : null,
    clicked: node,
    startX: event.clientX,
    startY: event.clientY,
    originX: dragNode ? 0 : flowUi.x,
    originY: dragNode ? 0 : flowUi.y,
    lastX: 0,
    lastY: 0,
    moved: false
  };
  if (!dragNode && !movableLane) flowEls.stage.classList.add("panning");
  flowEls.stage.setPointerCapture(event.pointerId);
});

flowEls.stage.addEventListener("pointermove", (event) => {
  const drag = flowUi.drag;
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (!drag.node && !drag.group) {
    flowUi.x = drag.originX + dx;
    flowUi.y = drag.originY + dy;
    flowApplyView();
    return;
  }
  const stepX = dx / flowUi.scale - drag.lastX;
  const stepY = dy / flowUi.scale - drag.lastY;
  drag.lastX += stepX;
  drag.lastY += stepY;
  // Nós de item seguem a máquina que os produz (no layout e aqui); os demais guardam o deslocamento.
  const moving = drag.group || [drag.node, ...flowUi.graph.nodes.filter((node) => node.producer === drag.node.id)];
  moving.filter((node) => !node.producer).forEach((node) => {
    const offset = flowUi.offsets[node.id] || { x: 0, y: 0 };
    flowUi.offsets[node.id] = { x: offset.x + stepX, y: offset.y + stepY };
  });
  moving.forEach((node) => {
    node.x += stepX;
    node.y += stepY;
    const el = flowEls.nodes.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
  });
  flowDrawEdges();
});

function flowEndDrag() {
  const drag = flowUi.drag;
  flowUi.drag = null;
  flowEls.stage.classList.remove("panning");
  if (drag && !drag.moved && drag.clicked?.type === "factory") {
    flowSetLevel(2);
    return;
  }
  if (drag && !drag.moved && drag.groupLane) {
    flowFitLane(drag.groupLane);
    return;
  }
  if (drag && !drag.moved) {
    const selected = drag.clicked?.type === "process" ? drag.clicked.id : "";
    if (selected !== flowUi.selected) {
      flowUi.selected = selected;
      flowRenderNodes();
    }
  }
}
flowEls.stage.addEventListener("pointerup", flowEndDrag);
flowEls.stage.addEventListener("pointercancel", () => {
  flowUi.drag = null;
  flowEls.stage.classList.remove("panning");
});

flowEls.stage.addEventListener("wheel", (event) => {
  if (event.target.closest(".flow-details, .add-list")) return;
  event.preventDefault();
  const rect = flowEls.stage.getBoundingClientRect();
  flowZoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

// Dois cliques: num bloco (ou num nó dentro dele), dá zoom no bloco; num nó sem bloco (modo
// Colunas), dá zoom no nó; no fundo vazio, ajusta a fábrica inteira.
flowEls.stage.addEventListener("dblclick", () => {
  const pressed = flowUi.pressed || {};
  if (pressed.ignore) return;
  const groupEl = pressed.lane && flowEls.groups.querySelector(`[data-lane="${CSS.escape(pressed.lane)}"]`);
  const nodeEl = pressed.nodeId && flowEls.nodes.querySelector(`[data-id="${CSS.escape(pressed.nodeId)}"]`);
  if (groupEl) flowFitGroup(groupEl);
  else if (nodeEl) flowFitGroup(nodeEl);
  else flowFit();
});

flowEls.nodes.addEventListener("pointerover", (event) => {
  const id = event.target.closest(".flow-node")?.dataset.id || "";
  if (id !== flowUi.hover && !flowUi.drag) {
    flowUi.hover = id;
    flowDrawEdges();
  }
});
flowEls.nodes.addEventListener("pointerleave", () => {
  flowUi.hover = "";
  flowDrawEdges();
});

flowEls.stage.addEventListener("click", (event) => {
  const act = event.target.closest("[data-flow-act]")?.dataset.flowAct;
  const nodeId = event.target.closest(".flow-node")?.dataset.id;
  if (act === "collapse" && nodeId) flowToggleCollapse(nodeId);
  if (act === "details" && nodeId) {
    flowUi.selected = nodeId;
    flowRenderNodes();
  }
  if (act === "close") {
    flowUi.selected = "";
    flowRenderNodes();
  }
  const group = event.target.closest("[data-flow-group]")?.dataset.flowGroup;
  if (group) flowToggleCollapse(group);

  const lock = event.target.closest("[data-flow-lock]")?.dataset.flowLock;
  if (lock) flowToggleLock(lock);

  const detail = event.target.closest("[data-flow-detail]")?.dataset.flowDetail;
  if (detail) {
    const lane = flowUi.graph.lanes.find((entry) => entry.id === detail);
    flowOpenDetail(detail, lane?.name || "");
  }
});

flowEls.stage.addEventListener("input", (event) => {
  if (!("flowSearch" in event.target.dataset)) return;
  const query = event.target.value.trim().toLowerCase();
  event.target.closest(".add-output").querySelectorAll("[data-flow-add]").forEach((button) => {
    button.hidden = !button.dataset.flowAdd.toLowerCase().includes(query);
  });
});

flowEls.stage.addEventListener("change", (event) => {
  const id = event.target.dataset.flowRate;
  if (!id) return;
  const output = state.settings.targetOutputs.find((entry) => entry.id === id);
  const rate = Number(event.target.value);
  if (!output) return;
  if (!Number.isFinite(rate) || rate <= 0) {
    event.target.value = output.rate;
    return;
  }
  output.rate = rate;
  render();
});

document.addEventListener("click", (event) => {
  const closeTab = event.target.closest("[data-flow-detail-close]")?.dataset.flowDetailClose;
  if (closeTab) {
    flowCloseDetail(closeTab);
    return;
  }
  const detailTab = event.target.closest("[data-flow-detail-tab]")?.dataset.flowDetailTab;
  if (detailTab) {
    flowSaveDetailView();
    flowUi.detailLane = detailTab;
    flowSetLevel(3);
    return;
  }
  const level = event.target.closest("[data-flow-level]")?.dataset.flowLevel;
  if (level) flowSetLevel(Number(level));

  const layout = event.target.closest("[data-flow-layout]")?.dataset.flowLayout;
  if (layout) {
    state.settings.flowLayout = layout;
    render();
  }

  const item = event.target.closest("[data-flow-add]")?.dataset.flowAdd;
  if (item) {
    if (state.settings.targetOutputs.some((output) => output.item === item)) {
      flowToast(t("toast.alreadyOutput", { item }));
      return;
    }
    state.settings.targetOutputs.push({ id: outputId(), item, rate: state.settings.targetRate });
    render();
  }
});

flowEls.legend.addEventListener("click", (event) => {
  const zoom = event.target.closest("[data-legend-zoom]")?.dataset.legendZoom;
  if (zoom) {
    if (flowUi.level !== 2) flowSetLevel(2);
    flowFitLane(zoom);
  }
  const detail = event.target.closest("[data-legend-detail]")?.dataset.legendDetail;
  if (detail) {
    const lane = flowUi.lines?.base.lanes.find((entry) => entry.id === detail);
    flowOpenDetail(detail, lane?.name || "");
  }
});
