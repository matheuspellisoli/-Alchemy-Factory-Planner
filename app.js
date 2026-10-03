let state = {
  resources: [],
  machines: [],
  recipes: [],
  selectedRecipes: {},
  selectedFuels: {},
  selectedFurnaces: {},
  selectedFertilizers: {},
  selectedPlantings: {},
  settings: {
    targetRate: 12,
    targetOutputs: [],
    beltRate: 60,
    speed: 100,
    roundMachines: true,
    showByproducts: true,
    flowLayout: "clusters",
    defaultFuel: "",
    defaultFurnace: "",
    supplyLines: {},
    defaultFertilizer: "",
    defaultPlanting: "",
    factoryName: ""
  }
};

let lastPlan = null;
const renderedTabs = new Set();
let pendingRenderFrame = 0;
const els = {
  drawerPanels: document.querySelector("#drawerPanels"),
  beltRate: document.querySelector("#beltRate"),
  speed: document.querySelector("#speed"),
  speedValue: document.querySelector("#speedValue"),
  roundMachines: document.querySelector("#roundMachines"),
  showByproducts: document.querySelector("#showByproducts"),
  resetPlan: document.querySelector("#resetPlan"),
  exportData: document.querySelector("#exportData"),
  exportCode: document.querySelector("#exportCode"),
  importCode: document.querySelector("#importCode"),
  planCodeDialog: document.querySelector("#planCodeDialog"),
  planCodeTitle: document.querySelector("#planCodeTitle"),
  planCodeHint: document.querySelector("#planCodeHint"),
  planCodeText: document.querySelector("#planCodeText"),
  planCodeError: document.querySelector("#planCodeError"),
  planCodeCopy: document.querySelector("#planCodeCopy"),
  planCodeImport: document.querySelector("#planCodeImport"),
  planCodeClose: document.querySelector("#planCodeClose"),
  planTitle: document.querySelector("#planTitle"),
  planSubtitle: document.querySelector("#planSubtitle"),
  machineCount: document.querySelector("#machineCount"),
  rawCount: document.querySelector("#rawCount"),
  beltCount: document.querySelector("#beltCount"),
  machinesBody: document.querySelector("#machinesBody"),
  rawList: document.querySelector("#rawList"),
  wasteList: document.querySelector("#wasteList"),
  resourceCatalog: document.querySelector("#resourceCatalog"),
  machineCatalog: document.querySelector("#machineCatalog"),
  recipeList: document.querySelector("#recipeList")
};

async function loadData() {
  if (window.AFC_DATABASE) {
    state = normalizeState(window.AFC_DATABASE);
    // O app abre vazio, no nível de saídas, para o usuário escolher o que produzir.
    state.settings.targetOutputs = [];
    state.settings.flowLevel = 1;
    // Se o link trouxer uma fábrica (?fabrica=AFP1…), ela é carregada no lugar da vazia.
    const code = readUrlPlanCode();
    if (code) {
      try {
        const key = planCodeKey(code);
        currentSavedId = (loadSavedFactories() || []).find((entry) => planCodeKey(entry.code) === key)?.id || "";
        const outputs = importPlanCode(code);
        flowToast(`Fábrica carregada do link: ${outputs} saída${outputs === 1 ? "" : "s"}.`);
        return;
      } catch (error) {
        flowToast(`O link tem um código de fábrica inválido: ${error.message}`);
      }
    }
    render();
    return;
  }

  throw new Error("Não foi possível carregar static/data/database.js.");
}

function normalizeState(data) {
  return {
    resources: Array.isArray(data.resources) ? data.resources : [],
    machines: Array.isArray(data.machines) ? data.machines : [],
    recipes: Array.isArray(data.recipes) ? data.recipes : [],
    selectedRecipes: data.selectedRecipes && typeof data.selectedRecipes === "object" ? data.selectedRecipes : {},
    selectedFuels: data.selectedFuels && typeof data.selectedFuels === "object" ? data.selectedFuels : {},
    selectedFurnaces: data.selectedFurnaces && typeof data.selectedFurnaces === "object" ? data.selectedFurnaces : {},
    selectedFertilizers: data.selectedFertilizers && typeof data.selectedFertilizers === "object" ? data.selectedFertilizers : {},
    selectedPlantings: data.selectedPlantings && typeof data.selectedPlantings === "object" ? data.selectedPlantings : {},
    settings: {
      ...state.settings,
      ...(data.settings || {})
    },
    source: data.source
  };
}

function commitSettings() {
  syncSettingsFromInputs(true);
  render();
}

function outputItems() {
  return [...new Set(state.recipes.flatMap((entry) => Object.keys(entry.outputs)))].sort((a, b) => a.localeCompare(b));
}

function normalizeTargetOutputs() {
  const items = outputItems();
  const outputs = Array.isArray(state.settings.targetOutputs) ? state.settings.targetOutputs : [];
  const normalized = outputs
    .map((entry) => ({
      id: entry.id || outputId(),
      item: items.includes(entry.item) ? entry.item : "",
      rate: Number(entry.rate)
    }))
    .filter((entry) => entry.item && Number.isFinite(entry.rate) && entry.rate > 0);
  const combined = new Map();
  normalized.forEach((entry) => {
    const existing = combined.get(entry.item);
    if (existing) {
      existing.rate += entry.rate;
    } else {
      combined.set(entry.item, entry);
    }
  });
  state.settings.targetOutputs = [...combined.values()];
}

function outputId() {
  return `out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function machineById(id) {
  return state.machines.find((entry) => entry.id === id);
}

function resourceByName(name) {
  return state.resources.find((entry) => entry.name === name);
}

function iconUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : path;
}

function iconHtml(path, label, className = "") {
  const url = iconUrl(path);
  if (!url) return `<span class="entity-fallback ${className}">${escapeHtml(String(label || "?").slice(0, 1))}</span>`;
  return `<img class="entity-icon ${className}" src="${escapeHtml(url)}" alt="" loading="lazy" />`;
}

function itemLabel(name, className = "") {
  const resource = resourceByName(name);
  return `<span class="entity-label ${className}">${iconHtml(resource?.icon, name)}<span>${escapeHtml(name)}</span></span>`;
}

function machineLabel(machine, fallback = "Máquina removida") {
  if (!machine) return `<span class="entity-label">${iconHtml("", fallback)}<span>${escapeHtml(fallback)}</span></span>`;
  return `<span class="entity-label">${iconHtml(machine.icon, machine.name)}<span>${escapeHtml(machine.name)}</span></span>`;
}

function itemIcon(item) {
  return resourceByName(item)?.icon || "";
}

function recipesFor(item) {
  return state.recipes.filter((entry) => entry.outputs[item] > 0);
}

function selectedRecipeFor(item) {
  const options = recipesFor(item);
  if (!options.length) return null;
  return options.find((entry) => entry.id === state.selectedRecipes[item]) || options[0];
}

function resourceCategories(resource) {
  return Array.isArray(resource?.category) ? resource.category : [resource?.category].filter(Boolean);
}

function fuelItems() {
  return state.resources
    .filter((resource) => resourceCategories(resource).includes("fuel"))
    .map((resource) => resource.name)
    .sort((a, b) => a.localeCompare(b));
}

const heatedMachineIds = new Set([
  "mac-iron-smelter",
  "mac-crucible",
  "mac-stackable-crucible",
  "mac-paradox-crucible",
  "mac-kiln",
  "mac-athanor",
  "mac-advanced-athanor"
]);

// Máquinas com heatSpeed consomem calor e ficam em cima de uma fornalha (categoria "Heating"),
// uma fornalha por máquina física. A fornalha queima o combustível.
function isHeatingMachine(machineId) {
  const machine = machineById(machineId);
  return heatedMachineIds.has(machineId) || (Boolean(machine?.heatSpeed) && machine.category !== "Heating");
}

function furnaces() {
  return state.machines.filter((machine) => machine.category === "Heating");
}

function defaultFurnaceId() {
  const ids = furnaces().map((machine) => machine.id);
  if (ids.includes(state.settings.defaultFurnace)) return state.settings.defaultFurnace;
  return ids.includes("mac-stone-furnace") ? "mac-stone-furnace" : ids[0] || "";
}

function isManualFurnace(item) {
  return furnaces().some((machine) => machine.id === state.selectedFurnaces[item]);
}

function selectedFurnaceFor(item) {
  return isManualFurnace(item) ? state.selectedFurnaces[item] : defaultFurnaceId();
}

// Combustível padrão da fábrica; máquinas com escolha manual (selectedFuels) não o seguem.
function defaultFuelItem() {
  const fuels = fuelItems();
  if (fuels.includes(state.settings.defaultFuel)) return state.settings.defaultFuel;
  return fuels.includes("Coal") ? "Coal" : fuels[0] || "";
}

function isManualFuel(item) {
  return fuelItems().includes(state.selectedFuels[item]);
}

function selectedFuelFor(item) {
  return isManualFuel(item) ? state.selectedFuels[item] : defaultFuelItem();
}

// Insumos (combustível, fertilizante) vêm de fora por padrão; se forem fabricáveis, o usuário
// pode ligar uma linha própria.
function canProduceSupply(supplyItem) {
  return recipesFor(supplyItem).length > 0;
}

function isSupplyProduced(supplyItem) {
  return Boolean(state.settings.supplyLines?.[supplyItem]) && canProduceSupply(supplyItem);
}

// Fertilizante: o Nursery cresce ervas na velocidade em que o fertilizante entrega nutriente
// (nutrientsPerSecond); cada erva consome requiredNutrients, e cada fertilizante vale
// nutrientValue. Fórmula da calculadora de ervas do Alchemy Factory Codex.
function fertilizerItems() {
  return state.resources
    .filter((resource) => resource.nutrientValue)
    .sort((a, b) => a.nutrientValue - b.nutrientValue)
    .map((resource) => resource.name);
}

function defaultFertilizerItem() {
  const fertilizers = fertilizerItems();
  if (fertilizers.includes(state.settings.defaultFertilizer)) return state.settings.defaultFertilizer;
  return fertilizers.includes("Basic Fertilizer") ? "Basic Fertilizer" : fertilizers[0] || "";
}

function isManualFertilizer(item) {
  return fertilizerItems().includes(state.selectedFertilizers[item]);
}

function selectedFertilizerFor(item) {
  return isManualFertilizer(item) ? state.selectedFertilizers[item] : defaultFertilizerItem();
}

function needsFertilizer(item) {
  return Boolean(resourceByName(item)?.requiredNutrients) && fertilizerItems().length > 0;
}

// Forma de plantar: Nursery ou Seed Plot. Padrão da fábrica + escolha manual por erva.
const NURSERY_ID = "mac-nursery";
const SEED_PLOT_ID = "mac-seed-plot";

function isSeed(item) {
  return resourceCategories(resourceByName(item)).includes("seeds");
}

function plantingMachines() {
  return [NURSERY_ID, SEED_PLOT_ID].map(machineById).filter(Boolean);
}

// Só receitas de Nursery que plantam uma semente podem ir para o Seed Plot.
function canChoosePlanting(recipeEntry) {
  return recipeEntry.machineId === NURSERY_ID && Object.keys(recipeEntry.inputs).some(isSeed) && plantingMachines().length > 1;
}

function defaultPlantingId() {
  return plantingMachines().some((machine) => machine.id === state.settings.defaultPlanting) ? state.settings.defaultPlanting : NURSERY_ID;
}

function isManualPlanting(item) {
  return plantingMachines().some((machine) => machine.id === state.selectedPlantings[item]);
}

function selectedPlantingFor(item) {
  return isManualPlanting(item) ? state.selectedPlantings[item] : defaultPlantingId();
}

// Ervas/min por Nursery e fertilizante por erva, limitados pela esteira (beltRate).
function nurseryRateFor(item, fertilizerItem, speedFactor) {
  const fertilizer = resourceByName(fertilizerItem);
  let required = resourceByName(item)?.requiredNutrients || 0;
  let flow = fertilizer?.nutrientsPerSecond || 0;
  if (!required || !flow) return null;
  const belt = state.settings.beltRate;
  let herbCap = belt;
  if (required >= 30000) {
    flow = 20000;
    required *= 2;
    herbCap = belt * (required >= 300000 ? 0.01 : 0.99);
  }
  const fertilizerPerHerb = required / fertilizer.nutrientValue;
  let herbsPerMin = Math.min(((60 * flow) / required) * speedFactor, herbCap);
  if (fertilizerPerHerb * herbsPerMin > belt * 4.5) herbsPerMin = (belt * 4.5) / fertilizerPerHerb;
  return { herbsPerMin, fertilizerPerHerb };
}

// Calor por segundo (máquinas rodando + fornalhas embaixo) convertido em combustível por minuto.
function heatFor(machineId, furnaceId, exactMachines, furnaceCount, speedFactor) {
  const machineHeat = (machineById(machineId)?.heatSpeed || 0) * exactMachines;
  const furnaceHeat = (machineById(furnaceId)?.heatSpeed || 0) * furnaceCount;
  return (machineHeat + furnaceHeat) * speedFactor;
}

function fuelRateFor(heatPerSecond, fuelItem) {
  const heatValue = resourceByName(fuelItem)?.heatValue;
  return heatValue ? (heatPerSecond * 60) / heatValue : 0;
}

function rateFor(recipeEntry, item) {
  const machine = machineById(recipeEntry.machineId);
  const machineSpeed = machine?.speed || 1;
  return (((recipeEntry.outputs[item] || 0) * 60) / recipeEntry.seconds) * machineSpeed;
}

function addTo(map, key, amount) {
  map[key] = (map[key] || 0) + amount;
}

// Ciclos (ex.: a linha de Charcoal Powder precisa de Charcoal, cujo Crucible queima Charcoal
// Powder) são fechados por iteração: o que o ciclo consome volta como demanda extra da própria
// linha até estabilizar. Se o ciclo consome mais do que produz, não converge, e o consumo do
// ciclo passa a vir de fora (plan.loopWarnings).
function buildPlan(targetOutputs) {
  let feedback = {};
  for (let pass = 0; pass < 200; pass += 1) {
    const plan = buildPlanPass(targetOutputs, feedback);
    const items = new Set([...Object.keys(plan.loops), ...Object.keys(feedback)]);
    const change = Math.max(0, ...[...items].map((item) => Math.abs((plan.loops[item] || 0) - (feedback[item] || 0))));
    if (change < 1e-6) return { ...plan, loopWarnings: [] };
    if (Object.values(plan.loops).some((rate) => rate > 1e7)) break;
    feedback = plan.loops;
  }

  const plan = buildPlanPass(targetOutputs, {});
  Object.entries(plan.loops).forEach(([item, rate]) => addTo(plan.raw, item, rate));
  plan.edges.forEach((edge) => {
    if (!edge.loop) return;
    edge.loop = false;
    edge.rawInput = true;
  });
  return { ...plan, loopWarnings: Object.keys(plan.loops) };
}

function buildPlanPass(targetOutputs, feedback) {
  const outputs = (Array.isArray(targetOutputs) ? targetOutputs : [])
    .filter((entry) => entry.item && Number(entry.rate) > 0)
    .map((entry) => ({ ...entry, rate: Number(entry.rate) }));
  const targetItem = outputs[0]?.item || "";
  const targetRate = outputs[0]?.rate || 0;
  const machines = [];
  const raw = {};
  const loops = {};
  const waste = {};
  const edges = [];
  const visited = new Set();
  const speedFactor = Number(state.settings.speed) / 100;

  function produce(item, demand, path = []) {
    const recipeEntry = selectedRecipeFor(item);
    if (!recipeEntry) {
      addTo(raw, item, demand);
      return;
    }
    if (path.includes(item)) {
      addTo(loops, item, demand);
      return;
    }

    // Ervas podem ser plantadas em Nursery (semente fica, gasta fertilizante) ou Seed Plot
    // (gasta a semente, sem fertilizante, no tempo da receita).
    const planting = canChoosePlanting(recipeEntry) ? selectedPlantingFor(item) : "";
    const machineId = planting || recipeEntry.machineId;
    const machine = machineById(machineId);
    const seedPlot = machineId === SEED_PLOT_ID;
    // Nursery: a velocidade vem do fertilizante, não do tempo da receita.
    const fertilizerItem = needsFertilizer(item) && !seedPlot ? selectedFertilizerFor(item) : "";
    const nursery = fertilizerItem ? nurseryRateFor(item, fertilizerItem, speedFactor) : null;
    const outputPerMinute = nursery ? nursery.herbsPerMin : rateFor(recipeEntry, item) * speedFactor;
    // Tudo aqui é exato (trabalho real); o arredondamento para máquinas inteiras
    // acontece uma vez só, no fim, sobre o total de cada receita.
    const machineCount = demand / outputPerMinute;
    const cycles = demand / recipeEntry.outputs[item]; // receitas completas por minuto
    const fertilizerRate = nursery ? demand * nursery.fertilizerPerHerb : 0;
    const nodeId = `${recipeEntry.id}:${item}${planting ? `@${planting}` : ""}`;
    const heated = isHeatingMachine(machineId);
    const fuelItem = heated ? selectedFuelFor(item) : "";
    const furnaceId = heated ? selectedFurnaceFor(item) : "";
    // Fornalhas queimam na proporção do trabalho das máquinas que aquecem.
    const heat = heated ? heatFor(machineId, furnaceId, machineCount, machineCount, speedFactor) : 0;

    if (!visited.has(nodeId)) {
      machines.push({
        id: nodeId,
        item,
        recipe: recipeEntry.name,
        machineId,
        machine: machine?.name || "Máquina removida",
        planting,
        demand,
        outputPerMinute,
        exactMachines: machineCount,
        fuelItem,
        furnaceId,
        heat,
        fertilizerItem: nursery ? fertilizerItem : "",
        fertilizerRate,
        inputs: recipeEntry.inputs,
        outputs: recipeEntry.outputs
      });
      visited.add(nodeId);
    } else {
      const existing = machines.find((entry) => entry.id === nodeId);
      existing.demand += demand;
      existing.exactMachines += machineCount;
      existing.heat += heat;
      existing.fertilizerRate += fertilizerRate;
    }

    Object.entries(recipeEntry.outputs).forEach(([outItem, qty]) => {
      if (outItem !== item) {
        addTo(waste, outItem, qty * cycles);
      }
    });

    Object.entries(recipeEntry.inputs).forEach(([inputItem, qty]) => {
      // No Nursery a semente fica plantada: não é consumida.
      if (nursery && isSeed(inputItem)) return;
      const inputRate = qty * cycles;
      const nextPath = [...path, item];
      const cyclic = nextPath.includes(inputItem) && Boolean(selectedRecipeFor(inputItem));
      edges.push({ from: inputItem, to: item, rate: inputRate, rawInput: false, loop: cyclic });
      produce(inputItem, inputRate, nextPath);
    });

    if (fuelItem) supply(fuelItem, fuelRateFor(heat, fuelItem), { fuel: true });
    if (nursery) supply(fertilizerItem, fertilizerRate, { fertilizer: true });

    // Insumo consumido pela máquina: vem de fora ou da linha própria (se o usuário ligou).
    function supply(supplyItem, rate, kind) {
      const nextPath = [...path, item];
      const external = !isSupplyProduced(supplyItem);
      edges.push({ from: supplyItem, to: item, rate, rawInput: external, loop: !external && nextPath.includes(supplyItem), ...kind });
      if (external) {
        addTo(raw, supplyItem, rate);
      } else {
        produce(supplyItem, rate, nextPath);
      }
    }
  }

  outputs.forEach((output) => produce(output.item, output.rate));
  Object.entries(feedback).forEach(([item, rate]) => produce(item, rate));

  machines.forEach((entry) => {
    entry.machineCount = state.settings.roundMachines ? Math.ceil(entry.exactMachines - 1e-9) : entry.exactMachines;
    entry.load = entry.machineCount ? entry.exactMachines / entry.machineCount : 0;
    entry.actualRate = entry.outputPerMinute * entry.machineCount;
    entry.furnaceCount = entry.furnaceId ? Math.ceil(entry.exactMachines - 1e-9) : 0;
  });
  return { targetItem, targetRate, targetOutputs: outputs, machines, raw, loops, waste, edges };
}

function formatRate(value) {
  return `${round(value)}/min`;
}

function round(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function readPositiveInput(input, minimum, current, commit = false) {
  const raw = input.value.trim();
  const value = Number(raw);
  if (raw && Number.isFinite(value) && value >= minimum) return value;
  if (commit) {
    input.value = current;
  }
  return current;
}

function syncSettingsFromInputs(commitNumbers = false) {
  state.settings.beltRate = readPositiveInput(els.beltRate, 1, state.settings.beltRate, commitNumbers);
  state.settings.speed = Number(els.speed.value);
  state.settings.roundMachines = els.roundMachines.checked;
  state.settings.showByproducts = els.showByproducts.checked;
}

function syncInputsFromState() {
  if (document.activeElement !== els.beltRate) els.beltRate.value = state.settings.beltRate;
  els.speed.value = state.settings.speed;
  els.speedValue.textContent = `${state.settings.speed}%`;
  els.roundMachines.checked = state.settings.roundMachines;
  els.showByproducts.checked = state.settings.showByproducts;
}

function renderTabContent(tabId) {
  if (tabId === "resources" && !renderedTabs.has(tabId)) {
    renderResourceCatalog();
    renderedTabs.add(tabId);
  }
  if (tabId === "machines" && !renderedTabs.has(tabId)) {
    renderMachineCatalog();
    renderedTabs.add(tabId);
  }
  if (tabId === "recipes" && !renderedTabs.has(tabId)) {
    renderRecipes();
    renderedTabs.add(tabId);
  }
}

function renderMachines(plan) {
  els.machinesBody.innerHTML = plan.machines
    .sort((a, b) => b.machineCount - a.machineCount)
    .map((entry) => `
      <tr>
        <td>${itemLabel(entry.item)}</td>
        <td>${escapeHtml(entry.recipe)}</td>
        <td>${machineLabel(machineById(entry.machineId), entry.machine)}${entry.fuelItem ? `<br /><span>Sobre ${entry.furnaceCount}× ${machineLabel(machineById(entry.furnaceId))} · ${itemLabel(entry.fuelItem)} ${formatRate(fuelRateFor(entry.heat, entry.fuelItem))}</span>` : ""}${entry.fertilizerItem ? `<br /><span>Fertilizante: ${itemLabel(entry.fertilizerItem)} ${formatRate(entry.fertilizerRate)}</span>` : ""}</td>
        <td>${formatRate(entry.demand)}</td>
        <td>${round(entry.machineCount)}</td>
        <td>
          ${round(entry.load * 100)}%
          <div class="loadbar"><span style="width:${Math.min(100, entry.load * 100)}%"></span></div>
        </td>
      </tr>
    `).join("");
}

function renderResources(plan) {
  const rawEntries = Object.entries(plan.raw).sort((a, b) => b[1] - a[1]);
  const wasteEntries = state.settings.showByproducts ? Object.entries(plan.waste).sort((a, b) => b[1] - a[1]) : [];
  els.rawList.innerHTML = rawEntries.length ? rawEntries.map(resourceRow).join("") : `<div class="empty">Sem entrada externa.</div>`;
  els.wasteList.innerHTML = wasteEntries.length ? wasteEntries.map(resourceRow).join("") : `<div class="empty">Sem sobra calculada.</div>`;
}

function resourceRow([item, amount]) {
  const belts = Math.ceil(amount / state.settings.beltRate);
  return `<div class="pill-row"><strong>${itemLabel(item)}</strong><span>${formatRate(amount)} · ${belts} linha${belts === 1 ? "" : "s"}</span></div>`;
}

function renderResourceCatalog() {
  els.resourceCatalog.innerHTML = state.resources
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `
      <div class="catalog-card">
        ${iconHtml(entry.icon, entry.name, "catalog-icon")}
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${resourceTypeLabel(entry.type)}${entry.category ? ` · ${categoryLabel(entry.category)}` : ""}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</span>
        </div>
      </div>
    `).join("");
}

function renderMachineCatalog() {
  els.machineCatalog.innerHTML = state.machines
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `
      <div class="catalog-card">
        ${iconHtml(entry.icon, entry.name, "catalog-icon")}
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.category || "Geral")} · velocidade ${round(entry.speed || 1)}x${entry.heatSpeed ? ` · calor ${round(entry.heatSpeed)}` : ""}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</span>
        </div>
      </div>
    `).join("");
}

function renderRecipes() {
  els.recipeList.innerHTML = state.recipes.map((entry) => {
    const machine = machineById(entry.machineId);
    return `
      <div class="recipe-card">
        <div>
          <strong>${itemLabel(Object.keys(entry.outputs)[0] || entry.name)} ${escapeHtml(entry.name)}</strong>
          <span>${machineLabel(machine)} · ${round(entry.seconds)}s · ${formatIoHtml(entry.inputs)} => ${formatIoHtml(entry.outputs)}${entry.category ? ` · ${escapeHtml(entry.category)}` : ""}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</span>
        </div>
      </div>
    `;
  }).join("");
}

function resourceTypeLabel(type) {
  return {
    raw: "Matéria-prima",
    intermediate: "Intermediário",
    product: "Produto",
    byproduct: "Sobra"
  }[type] || "Recurso";
}

function categoryLabel(category) {
  const categories = Array.isArray(category) ? category : [category];
  return categories.map((entry) => String(entry).replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ");
}

function formatIo(items) {
  const entries = Object.entries(items || {});
  if (!entries.length) return "nada";
  return entries.map(([item, amount]) => `${round(amount)} ${item}`).join(", ");
}

function formatIoHtml(items) {
  const entries = Object.entries(items || {});
  if (!entries.length) return "nada";
  return entries.map(([item, amount]) => `<span class="io-chip">${iconHtml(resourceByName(item)?.icon, item)}${round(amount)} ${escapeHtml(item)}</span>`).join("");
}

function renderMetrics(plan) {
  const rawEntries = Object.values(plan.raw);
  const totalMachines = plan.machines.reduce((sum, entry) => sum + entry.machineCount, 0);
  const totalBelts = rawEntries.reduce((sum, amount) => sum + Math.ceil(amount / state.settings.beltRate), 0);

  const outputCount = plan.targetOutputs.length;
  // O nome é do usuário; sem nome, o campo mostra o título automático como placeholder.
  const autoTitle = outputCount > 1 ? "Fábrica completa" : plan.targetItem || "Sem produto";
  els.planTitle.placeholder = autoTitle;
  if (document.activeElement !== els.planTitle) els.planTitle.value = state.settings.factoryName || "";
  document.title = `${state.settings.factoryName || autoTitle} · Alchemy Factory Planner`;
  els.planSubtitle.textContent = outputCount
    ? `${outputCount} saída${outputCount === 1 ? "" : "s"} com ${state.settings.speed}% de velocidade`
    : "Adicione uma saída para começar";
  document.querySelector("#statusBelt").textContent = `esteira ${state.settings.beltRate}/min · velocidade ${state.settings.speed}%`;
  els.machineCount.textContent = round(totalMachines);
  els.rawCount.textContent = rawEntries.length;
  els.beltCount.textContent = totalBelts;
  document.querySelector("#machineLabel").textContent = totalMachines === 1 ? "máquina" : "máquinas";
  document.querySelector("#rawLabel").textContent = rawEntries.length === 1 ? "entrada" : "entradas";
  document.querySelector("#beltLabel").textContent = totalBelts === 1 ? "linha" : "linhas";
}

function render() {
  syncInputsFromState();
  normalizeTargetOutputs();
  syncSettingsFromInputs();
  const plan = buildPlan(state.settings.targetOutputs);
  lastPlan = plan;
  renderMetrics(plan);
  renderMachines(plan);
  renderResources(plan);
  renderTabContent(document.querySelector(".tab.active")?.dataset.tab);
  drawFlow(plan);
  writeUrlPlanCode();
  renderSavedFactories();
}

// ---------- fábricas salvas (localStorage) ----------
// Cada fábrica salva guarda o código AFP1 (o mesmo do ⬆ Exportar). O armazenamento pode estar
// bloqueado (janela anônima, permissões): aí a lista avisa e o resto do app segue normal.
const savedFactoriesKey = "alchemy-factory-planner:saved-factories";
let currentSavedId = "";

function loadSavedFactories() {
  try {
    const list = JSON.parse(localStorage.getItem(savedFactoriesKey) || "[]");
    return Array.isArray(list) ? list.filter((entry) => entry && entry.id && entry.code) : [];
  } catch {
    return null;
  }
}

function storeSavedFactories(list) {
  try {
    localStorage.setItem(savedFactoriesKey, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Compara fábricas ignorando a aba e o layout abertos (não são mudanças da fábrica).
function planCodeKey(code) {
  try {
    const snapshot = decodePlanCode(code);
    delete snapshot.settings.flowLevel;
    delete snapshot.settings.flowLayout;
    return JSON.stringify(snapshot);
  } catch {
    return code;
  }
}

function currentFactoryName() {
  return state.settings.factoryName || els.planTitle.placeholder || "Fábrica sem nome";
}

function saveCurrentFactory() {
  const list = loadSavedFactories();
  if (!list) {
    flowToast("Não foi possível salvar: o armazenamento do navegador está bloqueado.");
    return;
  }
  if (!state.settings.targetOutputs.length) {
    flowToast("Adicione ao menos uma saída antes de salvar.");
    return;
  }
  const entry = {
    id: currentSavedId && list.some((item) => item.id === currentSavedId) ? currentSavedId : `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: currentFactoryName(),
    code: encodePlanCode({ syncInputs: false }),
    outputs: state.settings.targetOutputs.map((output) => `${output.item} ${round(output.rate)}/min`),
    ui: flowExportTabs(),
    updatedAt: new Date().toISOString()
  };
  const index = list.findIndex((item) => item.id === entry.id);
  if (index >= 0) list[index] = entry;
  else list.unshift(entry);
  if (!storeSavedFactories(list)) {
    flowToast("Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.");
    return;
  }
  currentSavedId = entry.id;
  flowToast(`Fábrica salva: ${entry.name}.`);
  renderSavedFactories();
}

// Ao sair de uma fábrica salva (abrir outra, + Nova, fechar a página), as abas abertas dela
// ficam lembradas na própria entrada — sem mudar o conteúdo nem a data de salvamento.
function rememberCurrentTabs() {
  if (!currentSavedId) return;
  const list = loadSavedFactories();
  const entry = list?.find((item) => item.id === currentSavedId);
  if (!entry) return;
  entry.ui = flowExportTabs();
  storeSavedFactories(list);
}

window.addEventListener("pagehide", rememberCurrentTabs);

function openSavedFactory(id) {
  if (id !== currentSavedId) rememberCurrentTabs();
  const entry = (loadSavedFactories() || []).find((item) => item.id === id);
  if (!entry) return;
  try {
    currentSavedId = entry.id;
    // Abas da fábrica salva (as da fábrica anterior são descartadas).
    const level = flowImportTabs(entry.ui);
    importPlanCode(entry.code);
    if (level && level !== state.settings.flowLevel) {
      state.settings.flowLevel = level;
      render();
    }
    flowToast(`Fábrica aberta: ${entry.name}.`);
  } catch (error) {
    currentSavedId = "";
    flowToast(`Não foi possível abrir ${entry.name}: ${error.message}`);
  }
}

function deleteSavedFactory(id) {
  const list = loadSavedFactories() || [];
  const entry = list.find((item) => item.id === id);
  if (!entry || !window.confirm(`Excluir a fábrica salva "${entry.name}"?`)) return;
  storeSavedFactories(list.filter((item) => item.id !== id));
  if (currentSavedId === id) currentSavedId = "";
  renderSavedFactories();
}

function newFactory() {
  rememberCurrentTabs();
  currentSavedId = "";
  flowImportTabs(null);
  state.settings = { ...state.settings, ...defaultPlanSettings() };
  choiceKeys.forEach((key) => { state[key] = {}; });
  render();
}

function renderSavedFactories() {
  const listEl = document.querySelector("[data-saved-list]");
  const status = document.querySelector("[data-saved-status]");
  const list = loadSavedFactories();
  if (!list) {
    status.textContent = "O armazenamento do navegador está bloqueado; não dá para salvar fábricas aqui.";
    status.hidden = false;
    listEl.innerHTML = "";
    return;
  }
  const currentKey = state.settings.targetOutputs.length ? planCodeKey(encodePlanCode({ syncInputs: false })) : "";
  status.hidden = list.length > 0;
  status.textContent = "Nenhuma fábrica salva ainda. Monte uma e clique em 💾 Salvar.";
  listEl.innerHTML = list.map((entry) => {
    const current = entry.id === currentSavedId;
    const dirty = current && planCodeKey(entry.code) !== currentKey;
    const date = new Date(entry.updatedAt);
    return `
      <li class="${current ? "current" : ""}">
        <button type="button" class="saved-open" data-saved-open="${escapeHtml(entry.id)}" title="Abrir esta fábrica">
          <strong>${escapeHtml(entry.name)}${dirty ? ` <span class="saved-dirty" title="Há mudanças que ainda não foram salvas">● não salvo</span>` : ""}</strong>
          <em>${escapeHtml((entry.outputs || []).join(" · "))}</em>
          <em>salva em ${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</em>
        </button>
        <button type="button" class="saved-delete" data-saved-delete="${escapeHtml(entry.id)}" title="Excluir" aria-label="Excluir ${escapeHtml(entry.name)}">🗑</button>
      </li>`;
  }).join("");
}

document.querySelector("#savedFactories").addEventListener("click", (event) => {
  if (event.target.closest("[data-saved-save]")) saveCurrentFactory();
  if (event.target.closest("[data-saved-new]")) newFactory();
  const open = event.target.closest("[data-saved-open]")?.dataset.savedOpen;
  if (open) openSavedFactory(open);
  const remove = event.target.closest("[data-saved-delete]")?.dataset.savedDelete;
  if (remove) deleteSavedFactory(remove);
});

// ---------- código da fábrica na URL ----------
// A cada mudança, o endereço ganha ?fabrica=<código AFP1>, o mesmo do ⬆ Exportar; abrir o link
// recria a fábrica. Se o navegador não deixar mudar a query (ex.: file://), usa #fabrica=.
const urlPlanParam = "fabrica";

function readUrlPlanCode() {
  // O #fabrica= é sempre o mais recente (é usado quando a query não pode ser alterada).
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get(urlPlanParam);
  const fromQuery = new URLSearchParams(window.location.search).get(urlPlanParam);
  return fromHash || fromQuery || "";
}

function writeUrlPlanCode() {
  const code = state.settings.targetOutputs.length ? encodePlanCode({ syncInputs: false }) : "";
  if (code === readUrlPlanCode()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(urlPlanParam);
  url.hash = "";
  if (code) url.searchParams.set(urlPlanParam, code);
  try {
    history.replaceState(null, "", url);
    return;
  } catch {
    // Páginas file:// no Chrome não podem mudar a query: grava só o #fabrica= (sem tocar na query).
  }
  try {
    const fallback = new URL(window.location.href);
    fallback.hash = new URLSearchParams({ [urlPlanParam]: code }).toString();
    history.replaceState(null, "", fallback);
  } catch {
    window.location.hash = new URLSearchParams({ [urlPlanParam]: code }).toString();
  }
}

function scheduleRender() {
  if (pendingRenderFrame) return;
  pendingRenderFrame = requestAnimationFrame(() => {
    pendingRenderFrame = 0;
    render();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("input", (event) => {
  if (["beltRate", "speed", "roundMachines", "showByproducts"].includes(event.target.id)) {
    syncSettingsFromInputs();
    els.speedValue.textContent = `${state.settings.speed}%`;
    scheduleRender();
  }
});

// Nome da fábrica: atualiza enquanto digita; ao sair do campo, redesenha o nó Fábrica.
els.planTitle.addEventListener("input", () => {
  state.settings.factoryName = els.planTitle.value.trim();
  document.title = `${state.settings.factoryName || els.planTitle.placeholder} · Alchemy Factory Planner`;
  writeUrlPlanCode();
  renderSavedFactories();
});
els.planTitle.addEventListener("change", () => render());
els.planTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.planTitle.blur();
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "beltRate") {
    syncSettingsFromInputs(true);
    render();
    return;
  }

  if (event.target.dataset.recipePicker) {
    state.selectedRecipes[event.target.dataset.recipePicker] = event.target.value;
    commitSettings();
    return;
  }

  // Valor vazio = voltar a seguir o combustível padrão da fábrica.
  if (event.target.dataset.fuelPicker) {
    if (event.target.value) {
      state.selectedFuels[event.target.dataset.fuelPicker] = event.target.value;
    } else {
      delete state.selectedFuels[event.target.dataset.fuelPicker];
    }
    commitSettings();
    return;
  }

  if ("defaultFuel" in event.target.dataset) {
    state.settings.defaultFuel = event.target.value;
    commitSettings();
    return;
  }

  // Plantio: mesmo esquema (vazio = padrão da fábrica).
  if (event.target.dataset.plantingPicker) {
    if (event.target.value) {
      state.selectedPlantings[event.target.dataset.plantingPicker] = event.target.value;
    } else {
      delete state.selectedPlantings[event.target.dataset.plantingPicker];
    }
    commitSettings();
    return;
  }

  if ("defaultPlanting" in event.target.dataset) {
    state.settings.defaultPlanting = event.target.value;
    commitSettings();
    return;
  }

  // Fertilizante: mesmo esquema do combustível (vazio = padrão da fábrica).
  if (event.target.dataset.fertilizerPicker) {
    if (event.target.value) {
      state.selectedFertilizers[event.target.dataset.fertilizerPicker] = event.target.value;
    } else {
      delete state.selectedFertilizers[event.target.dataset.fertilizerPicker];
    }
    commitSettings();
    return;
  }

  if ("defaultFertilizer" in event.target.dataset) {
    state.settings.defaultFertilizer = event.target.value;
    commitSettings();
    return;
  }

  // Fornalha: mesmo esquema do combustível (vazio = padrão da fábrica).
  if (event.target.dataset.furnacePicker) {
    if (event.target.value) {
      state.selectedFurnaces[event.target.dataset.furnacePicker] = event.target.value;
    } else {
      delete state.selectedFurnaces[event.target.dataset.furnacePicker];
    }
    commitSettings();
    return;
  }

  if ("defaultFurnace" in event.target.dataset) {
    state.settings.defaultFurnace = event.target.value;
    commitSettings();
    return;
  }

});

// Abas viram uma gaveta sobre o fluxo; clicar de novo na aba aberta fecha.
// Painel de baixo (como o terminal do VS Code): as abas ficam sempre à vista; o conteúdo abre
// ao escolher uma aba e fecha ao clicar nela de novo, no ✕ ou no ▤ da barra de atividades.
function openDrawer(tabId) {
  const open = Boolean(tabId);
  document.querySelectorAll(".tab").forEach((entry) => {
    const active = entry.dataset.tab === tabId;
    entry.classList.toggle("active", active);
    entry.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  els.drawerPanels.hidden = !open;
  document.querySelector("[data-panel-close]").hidden = !open;
  document.querySelector("[data-activity-panel]").classList.toggle("active", open);
  if (open) renderTabContent(tabId);
}

document.querySelector("[data-panel-close]").addEventListener("click", () => openDrawer(""));
document.querySelector("[data-activity-panel]").addEventListener("click", () => {
  openDrawer(els.drawerPanels.hidden ? document.querySelector(".tab.active")?.dataset.tab || "plan" : "");
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => openDrawer(tab.classList.contains("active") ? "" : tab.dataset.tab));
});

// Barra de atividades (como no VS Code): cada ícone mostra uma visão na barra lateral; clicar
// de novo no ícone ativo recolhe a barra lateral.
let activeActivity = ""; // vazio: a primeira chamada abre a barra lateral (não recolhe)

function setActivity(name) {
  const workbench = document.querySelector("#workbench");
  const collapse = name === activeActivity && !workbench.classList.contains("sidebar-hidden");
  workbench.classList.toggle("sidebar-hidden", collapse);
  activeActivity = name;
  document.querySelectorAll("[data-activity]").forEach((button) => {
    button.classList.toggle("active", !collapse && button.dataset.activity === name);
  });
  document.querySelectorAll(".sidebar-view").forEach((view) => { view.hidden = view.dataset.view !== name; });
}

document.querySelectorAll("[data-activity]").forEach((button) => {
  button.addEventListener("click", () => setActivity(button.dataset.activity));
});
setActivity("factories");

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") openDrawer("");
});

document.addEventListener("click", (event) => {
  const supplyLine = event.target.closest("[data-supply-line]")?.dataset.supplyLine;
  if (supplyLine) {
    state.settings.supplyLines = { ...state.settings.supplyLines, [supplyLine]: !isSupplyProduced(supplyLine) };
    commitSettings();
    return;
  }

  if (event.target.dataset.removeOutput) {
    state.settings.targetOutputs = state.settings.targetOutputs.filter((output) => output.id !== event.target.dataset.removeOutput);
    commitSettings();
    return;
  }

  const action = event.target.dataset.canvasAction;
  const panStep = 88;
  const actions = {
    "zoom-in": () => flowZoomBy(1.14),
    "zoom-out": () => flowZoomBy(0.88),
    "pan-up": () => flowPanBy(0, panStep),
    "pan-down": () => flowPanBy(0, -panStep),
    "pan-left": () => flowPanBy(panStep, 0),
    "pan-right": () => flowPanBy(-panStep, 0),
    "reset-view": flowFit
  };
  actions[action]?.();
});

// Valores de uma fábrica vazia (usados pelo Resetar e como base de um código importado).
function defaultPlanSettings() {
  return {
    targetRate: 12,
    targetOutputs: [],
    flowLevel: 1,
    beltRate: 60,
    speed: 100,
    roundMachines: true,
    showByproducts: true,
    flowLayout: "clusters",
    defaultFuel: "",
    defaultFurnace: "",
    supplyLines: {},
    defaultFertilizer: "",
    defaultPlanting: "",
    factoryName: ""
  };
}

const choiceKeys = ["selectedRecipes", "selectedFuels", "selectedFurnaces", "selectedFertilizers", "selectedPlantings"];

els.resetPlan.addEventListener("click", () => {
  state.settings = { ...state.settings, ...defaultPlanSettings() };
  choiceKeys.forEach((key) => { state[key] = {}; });
  render();
});

// ---------- código da fábrica (texto base64) ----------
// Só as escolhas do usuário entram no código; o banco de itens fica de fora.
const planCodePrefix = "AFP1.";

function encodePlanCode({ syncInputs = true } = {}) {
  if (syncInputs) syncSettingsFromInputs(true);
  const settings = Object.fromEntries(Object.keys(defaultPlanSettings())
    .filter((key) => key !== "targetRate")
    .map((key) => [key, state.settings[key]]));
  settings.targetOutputs = state.settings.targetOutputs.map((output) => ({ item: output.item, rate: output.rate }));
  const snapshot = { settings, ...Object.fromEntries(choiceKeys.map((key) => [key, state[key]])) };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return planCodePrefix + btoa(binary);
}

// Lança erro com mensagem amigável se o código não for válido.
function decodePlanCode(code) {
  const text = String(code || "").replace(/\s+/g, "");
  if (!text) throw new Error("Cole um código de fábrica.");
  const payload = text.startsWith(planCodePrefix) ? text.slice(planCodePrefix.length) : text;
  let snapshot;
  try {
    const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
    snapshot = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Código inválido: não é um código de fábrica em base64.");
  }
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.settings !== "object") {
    throw new Error("Código inválido: faltam os dados da fábrica.");
  }
  return snapshot;
}

function importPlanCode(code) {
  const snapshot = decodePlanCode(code);
  const imported = snapshot.settings || {};
  state.settings = {
    ...state.settings,
    ...defaultPlanSettings(),
    ...imported,
    targetOutputs: (Array.isArray(imported.targetOutputs) ? imported.targetOutputs : [])
      .map((output) => ({ id: outputId(), item: output.item, rate: Number(output.rate) }))
  };
  choiceKeys.forEach((key) => {
    state[key] = snapshot[key] && typeof snapshot[key] === "object" ? { ...snapshot[key] } : {};
  });
  normalizeTargetOutputs();
  render();
  return state.settings.targetOutputs.length;
}

function openPlanCodeDialog(mode) {
  const exporting = mode === "export";
  els.planCodeDialog.dataset.mode = mode;
  els.planCodeTitle.textContent = exporting ? "Exportar fábrica" : "Importar fábrica";
  els.planCodeHint.textContent = exporting
    ? "Copie este código para guardar ou compartilhar a fábrica."
    : "Cole um código de fábrica (começa com AFP1.) e clique em Importar.";
  els.planCodeText.value = exporting ? encodePlanCode() : "";
  els.planCodeText.readOnly = exporting;
  els.planCodeError.textContent = "";
  els.planCodeCopy.hidden = !exporting;
  els.planCodeImport.hidden = exporting;
  els.planCodeDialog.showModal();
  els.planCodeText.focus();
  if (exporting) els.planCodeText.select();
}

els.exportCode.addEventListener("click", () => openPlanCodeDialog("export"));
els.importCode.addEventListener("click", () => openPlanCodeDialog("import"));
els.planCodeClose.addEventListener("click", () => els.planCodeDialog.close());

els.planCodeCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.planCodeText.value);
    els.planCodeCopy.textContent = "Copiado!";
  } catch {
    els.planCodeText.select();
    els.planCodeCopy.textContent = "Use Ctrl+C";
  }
  setTimeout(() => { els.planCodeCopy.textContent = "Copiar"; }, 1400);
});

els.planCodeImport.addEventListener("click", () => {
  try {
    const outputs = importPlanCode(els.planCodeText.value);
    els.planCodeDialog.close();
    flowToast(`Fábrica importada: ${outputs} saída${outputs === 1 ? "" : "s"}.`);
  } catch (error) {
    els.planCodeError.textContent = error.message;
  }
});

els.exportData.addEventListener("click", () => {
  syncSettingsFromInputs(true);
  const blob = new Blob([JSON.stringify({ ...state, lastPlan }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const slug = (state.settings.factoryName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  link.download = `${slug || "alchemy-factory-plan"}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

loadData().catch((error) => {
  els.planTitle.value = "Erro ao carregar";
  els.planSubtitle.textContent = error.message;
});
