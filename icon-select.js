// Select com ícones. O <select> nativo não desenha imagens nas opções, então cada
// <select data-icon-select> ganha um botão + lista própria; o select continua escondido
// como dono do valor, e escolher uma opção dispara "change" nele (os handlers de sempre).
// Ícone de cada opção: atributo data-icon na <option>.

const iconSelectPopup = document.createElement("div");
iconSelectPopup.className = "icon-select-popup";
iconSelectPopup.setAttribute("role", "listbox");
iconSelectPopup.hidden = true;
document.body.append(iconSelectPopup);

let iconSelectOpen = null; // { select, button }

function iconSelectOptionHtml(option) {
  const icon = option?.dataset.icon;
  return `
    ${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : `<span class="icon-select-blank"></span>`}
    <span class="icon-select-label">${escapeHtml(option?.textContent.trim() || "")}</span>`;
}

function enhanceIconSelects(root = document) {
  if (iconSelectOpen && !iconSelectOpen.button.isConnected) closeIconSelect();
  root.querySelectorAll("select[data-icon-select]:not([data-enhanced])").forEach((select) => {
    select.dataset.enhanced = "true";
    select.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `icon-select ${select.className}`;
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    if (select.getAttribute("aria-label")) button.setAttribute("aria-label", select.getAttribute("aria-label"));
    button.innerHTML = `${iconSelectOptionHtml(select.selectedOptions[0])}<span class="icon-select-caret" aria-hidden="true">▾</span>`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (iconSelectOpen?.select === select) closeIconSelect();
      else openIconSelect(select, button);
    });
    select.after(button);
  });
}

function openIconSelect(select, button) {
  closeIconSelect();
  iconSelectOpen = { select, button };
  button.setAttribute("aria-expanded", "true");
  iconSelectPopup.innerHTML = [...select.options].map((option, index) => `
    <button type="button" role="option" data-index="${index}" aria-selected="${option.selected}" class="${option.selected ? "selected" : ""}">
      ${iconSelectOptionHtml(option)}
    </button>`).join("");
  iconSelectPopup.hidden = false;

  // Abre abaixo do botão; se não couber, abre acima.
  const rect = button.getBoundingClientRect();
  const width = Math.max(rect.width, 200);
  iconSelectPopup.style.width = `${width}px`;
  iconSelectPopup.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
  const height = iconSelectPopup.offsetHeight;
  const below = window.innerHeight - rect.bottom - 8;
  iconSelectPopup.style.top = `${below >= height || below >= rect.top ? rect.bottom + 4 : rect.top - height - 4}px`;
  iconSelectPopup.querySelector(".selected")?.focus();
  iconSelectPopup.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function closeIconSelect() {
  if (!iconSelectOpen) return;
  iconSelectOpen.button.setAttribute("aria-expanded", "false");
  iconSelectOpen = null;
  iconSelectPopup.hidden = true;
  iconSelectPopup.innerHTML = "";
}

iconSelectPopup.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-index]");
  if (!choice || !iconSelectOpen) return;
  const { select } = iconSelectOpen;
  closeIconSelect();
  const option = select.options[Number(choice.dataset.index)];
  if (option.selected) return;
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
});

iconSelectPopup.addEventListener("keydown", (event) => {
  const items = [...iconSelectPopup.querySelectorAll("[data-index]")];
  const index = items.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }
  if (event.key === "Escape") {
    const button = iconSelectOpen?.button;
    closeIconSelect();
    button?.focus();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (iconSelectOpen && !iconSelectPopup.contains(event.target) && !iconSelectOpen.button.contains(event.target)) closeIconSelect();
});
document.addEventListener("wheel", (event) => {
  if (iconSelectOpen && !iconSelectPopup.contains(event.target)) closeIconSelect();
}, { passive: true });
window.addEventListener("resize", closeIconSelect);
