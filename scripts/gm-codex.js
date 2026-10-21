const MODULE_ID = "gm-codex";
const ROOT_FOLDER_NAME = "GM Codex";
const TREE_FLAG = "treeV2";

const KIND_LABELS = {
  city: "Città",
  faction: "Fazione",
  npc: "PNG",
  quest: "Missione",
  place: "Luogo",
  encounter: "Incontro"
};

const KIND_ICONS = {
  city: "fa-solid fa-city",
  faction: "fa-solid fa-flag",
  npc: "fa-solid fa-user",
  quest: "fa-solid fa-scroll",
  place: "fa-solid fa-location-dot",
  encounter: "fa-solid fa-shield-halved"
};

const QUEST_STATUSES = {
  notStarted: "Non iniziata",
  active: "Attiva",
  completed: "Completata",
  failed: "Fallita"
};

const DEFAULT_GROUPS = [
  ["Ambientazione", "fa-solid fa-book-open"],
  ["Fazioni", "fa-solid fa-flag"],
  ["Personaggi", "fa-solid fa-users"],
  ["Missioni", "fa-solid fa-scroll"],
  ["Luoghi", "fa-solid fa-location-dot"]
];

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHTML(html = "") {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function truncate(text = "", max = 180) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function newId() {
  return foundry.utils.randomID?.(16) ?? crypto.randomUUID();
}

function getPages(entry) {
  return entry?.pages?.contents ?? Array.from(entry?.pages ?? []);
}

function getEntryContent(entry) {
  return getPages(entry)
    .filter(page => page.type === "text")
    .map(page => page.text?.content ?? "")
    .join("\n");
}

function codexEntries() {
  return game.journal.contents.filter(j => Boolean(j.getFlag(MODULE_ID, "kind")));
}

function isShared(entry) {
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  return (entry.ownership?.default ?? 0) >= observer;
}

function decorateTextImages(html = "", entry, page) {
  const container = document.createElement("div");
  container.innerHTML = html;

  for (const image of container.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (!src) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gm-codex-image-open";
    button.dataset.action = "open-image";
    button.dataset.src = src;
    button.dataset.title = image.getAttribute("alt") || page?.name || entry?.name || "Immagine";
    button.dataset.uuid = page?.uuid || entry?.uuid || "";
    button.innerHTML = '<i class="fa-solid fa-image"></i> Apri immagine';

    const anchor = image.closest("a");
    const target = anchor ?? image;
    target.insertAdjacentElement("afterend", button);
  }

  return container.innerHTML;
}

function prepareTextPage(html = "", entry, page) {
  const container = document.createElement("div");
  container.innerHTML = decorateTextImages(html, entry, page);

  const outline = [];
  const pageName = String(page?.name || "").trim().toLocaleLowerCase("it");

  for (const [index, heading] of [...container.querySelectorAll("h1, h2, h3, h4")].entries()) {
    const label = (heading.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) continue;

    // Evita di ripetere nell'indice il titolo della pagina quando compare come primo heading.
    if (!outline.length && pageName && label.toLocaleLowerCase("it") === pageName) continue;

    const id = `gm-codex-heading-${page?.id || "page"}-${index}`;
    heading.id = id;
    heading.classList.add("gm-codex-content-heading");
    outline.push({
      id,
      label,
      level: Number(heading.tagName.slice(1)) || 2
    });
  }

  return { html: container.innerHTML, outline };
}

async function ensureRootFolder() {
  let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === ROOT_FOLDER_NAME && !f.folder);
  if (!folder) {
    folder = await foundry.documents.Folder.create({
      name: ROOT_FOLDER_NAME,
      type: "JournalEntry",
      sorting: "a"
    });
  }
  return folder;
}

function defaultContent(kind, name) {
  const safe = escapeHTML(name);
  switch (kind) {
    case "city":
      return `<h1>${safe}</h1><p><em>Quadro generale.</em></p><h2>Descrizione</h2><p></p><h2>Situazione attuale</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "faction":
      return `<h1>${safe}</h1><h2>Descrizione</h2><p></p><h2>Obiettivi</h2><p></p><h2>Persone importanti</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "npc":
      return `<h1>${safe}</h1><h2>Aspetto</h2><p></p><h2>Personalità</h2><p></p><h2>Obiettivi</h2><p></p><h2>Informazioni riservate</h2><p></p>`;
    case "quest":
      return `<h1>${safe}</h1><h2>Premessa</h2><p></p><h2>Sviluppi</h2><p></p><h2>Indizi</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "place":
      return `<h1>${safe}</h1><h2>Descrizione</h2><p></p><h2>Dettagli utili</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "encounter":
      return `<h1>${safe}</h1><h2>Situazione</h2><p></p><h2>Partecipanti</h2><p></p><h2>Sviluppi possibili</h2><p></p>`;
    default:
      return `<h1>${safe}</h1><p></p>`;
  }
}

async function createCodexEntry({ name, kind, cityId = null, factionId = null, status = null, content = null }) {
  const folder = await ensureRootFolder();
  const flags = { kind };
  if (cityId) flags.cityId = cityId;
  if (factionId) flags.factionId = factionId;
  if (status) flags.status = status;

  const firstPageName = kind === "city" ? "Quadro generale" : "Scheda";

  return foundry.documents.JournalEntry.create({
    name,
    folder: folder.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [MODULE_ID]: flags },
    pages: [{
      name: firstPageName,
      type: "text",
      text: {
        content: content ?? defaultContent(kind, name),
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
      }
    }]
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Tree data                                 */
/* -------------------------------------------------------------------------- */

function stableKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "group";
}

function makeGroup(title, icon = null, children = [], id = null) {
  return { id: id || newId(), type: "group", title, icon: icon || iconForGroup(title), children };
}

function makeDefaultGroup(title, icon = null) {
  return makeGroup(title, icon, [], `builtin-${stableKey(title)}`);
}

function makePageNode(pageId) {
  return { id: `page-${pageId}`, type: "page", pageId };
}

function makeEntryNode(entryId) {
  return { id: `entry-${entryId}`, type: "entry", entryId };
}

function iconForGroup(title = "") {
  const t = title.toLocaleLowerCase("it");
  if (/personagg|png|abitant|persone/.test(t)) return "fa-solid fa-users";
  if (/quest|mission|incaric|avventur/.test(t)) return "fa-solid fa-scroll";
  if (/luog|mapp|quartier|zona|territor/.test(t)) return "fa-solid fa-location-dot";
  if (/fazi|politic|famigli|potere/.test(t)) return "fa-solid fa-flag";
  if (/segre|indiz/.test(t)) return "fa-solid fa-key";
  if (/nota/.test(t)) return "fa-solid fa-note-sticky";
  return "fa-solid fa-folder";
}

function classifyPageTitle(name = "") {
  const t = name.toLocaleLowerCase("it");
  if (/personagg|png|npc|abitanti principali|persone importanti/.test(t)) return "Personaggi";
  if (/quest|mission|incaric/.test(t)) return "Missioni";
  if (/^luoghi?$|mapp|quartier/.test(t)) return "Luoghi";
  if (/fazi|politic/.test(t)) return "Fazioni";
  return "Ambientazione";
}

function groupForKind(kind) {
  if (kind === "faction") return "Fazioni";
  if (kind === "npc") return "Personaggi";
  if (kind === "quest") return "Missioni";
  return "Ambientazione";
}

function walkTree(nodes, callback, parent = null, depth = 0) {
  for (const node of nodes ?? []) {
    callback(node, parent, depth);
    if (node.type === "group") walkTree(node.children ?? [], callback, node, depth + 1);
  }
}

function findNode(nodes, id) {
  let result = null;
  walkTree(nodes, (node, parent, depth) => {
    if (!result && node.id === id) result = { node, parent, depth };
  });
  return result;
}

function findContainer(nodes, id, parentArray = nodes) {
  for (let i = 0; i < parentArray.length; i++) {
    const node = parentArray[i];
    if (node.id === id) return { array: parentArray, index: i, node };
    if (node.type === "group") {
      const found = findContainer(nodes, id, node.children ?? (node.children = []));
      if (found) return found;
    }
  }
  return null;
}

function treeContains(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  return node.type === "group" && (node.children ?? []).some(child => treeContains(child, id));
}

function treeLeafCount(node) {
  if (!node) return 0;
  if (node.type !== "group") return 1;
  return (node.children ?? []).reduce((sum, child) => sum + treeLeafCount(child), 0);
}

function collectTreeRefs(tree) {
  const pages = new Set();
  const entries = new Set();
  walkTree(tree, node => {
    if (node.type === "page" && node.pageId) pages.add(node.pageId);
    if (node.type === "entry" && node.entryId) entries.add(node.entryId);
  });
  return { pages, entries };
}

function ensureTopGroup(tree, title) {
  let group = tree.find(n => n.type === "group" && n.title === title);
  if (!group) {
    const def = DEFAULT_GROUPS.find(([name]) => name === title);
    group = def ? makeDefaultGroup(title, def?.[1]) : makeGroup(title, def?.[1]);
    tree.push(group);
  }
  group.children ??= [];
  return group;
}

function normalizeTree(city, allEntries) {
  const stored = city.getFlag(MODULE_ID, TREE_FLAG);
  let tree = Array.isArray(stored) ? foundry.utils.deepClone(stored) : DEFAULT_GROUPS.map(([title, icon]) => makeDefaultGroup(title, icon));

  const pageIds = new Set(getPages(city).map(p => p.id));
  const linkedEntries = allEntries.filter(e => e.id !== city.id && e.getFlag(MODULE_ID, "cityId") === city.id);
  const linkedIds = new Set(linkedEntries.map(e => e.id));

  const clean = nodes => {
    const out = [];
    for (const node of nodes ?? []) {
      if (!node?.id || !node?.type) continue;
      if (node.type === "page") {
        if (pageIds.has(node.pageId)) out.push(node);
        continue;
      }
      if (node.type === "entry") {
        if (linkedIds.has(node.entryId)) out.push(node);
        continue;
      }
      if (node.type === "group") {
        node.children = clean(node.children ?? []);
        node.icon ||= iconForGroup(node.title);
        out.push(node);
      }
    }
    return out;
  };
  tree = clean(tree);

  const refs = collectTreeRefs(tree);

  for (const page of getPages(city)) {
    if (refs.pages.has(page.id)) continue;
    const group = ensureTopGroup(tree, classifyPageTitle(page.name));
    group.children.push(makePageNode(page.id));
    refs.pages.add(page.id);
  }

  for (const entry of linkedEntries) {
    if (refs.entries.has(entry.id)) continue;
    const group = ensureTopGroup(tree, groupForKind(entry.getFlag(MODULE_ID, "kind")));
    group.children.push(makeEntryNode(entry.id));
    refs.entries.add(entry.id);
  }

  return tree;
}

function moveTreeNode(tree, sourceId, targetId = null, mode = "root") {
  const cloned = foundry.utils.deepClone(tree);
  const sourceInfo = findContainer(cloned, sourceId);
  if (!sourceInfo) return cloned;
  const sourceNode = sourceInfo.node;

  if (targetId && treeContains(sourceNode, targetId)) return cloned;

  sourceInfo.array.splice(sourceInfo.index, 1);

  if (!targetId || mode === "root") {
    cloned.push(sourceNode);
    return cloned;
  }

  const targetInfo = findContainer(cloned, targetId);
  if (!targetInfo) {
    cloned.push(sourceNode);
    return cloned;
  }

  if (mode === "inside" && targetInfo.node.type === "group") {
    targetInfo.node.children ??= [];
    targetInfo.node.children.push(sourceNode);
    return cloned;
  }

  targetInfo.array.splice(targetInfo.index + 1, 0, sourceNode);
  return cloned;
}

function findPathToNode(tree, nodeId) {
  const search = (nodes, path) => {
    for (const node of nodes ?? []) {
      const next = [...path, node];
      if (node.id === nodeId) return next;
      if (node.type === "group") {
        const found = search(node.children ?? [], next);
        if (found) return found;
      }
    }
    return null;
  };
  return search(tree, []) ?? [];
}

/* -------------------------------------------------------------------------- */
/*                                   App                                      */
/* -------------------------------------------------------------------------- */

class GMCodexApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "gm-codex-app",
    classes: ["gm-codex-app"],
    window: {
      title: "GM Codex",
      icon: "fa-solid fa-book-open",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 1180,
      height: 780
    }
  };

  constructor(options = {}) {
    super(options);
    this.selectedCityId = null;
    this.section = "city";
    this.outsideSection = "place";
    this.selectedEntryId = null;
    this.selectedTreeNodeId = null;
    this.selectedEntryPageId = null;
    this.searchTerm = "";
    this.collapsedGroups = new Set();
    this._dragNodeId = null;
  }

  async _renderHTML(_context, _options) {
    const root = document.createElement("div");
    root.className = "gm-codex-shell";
    root.innerHTML = await this._buildHTML();
    return root;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._bindListeners();
    this._bindDragDrop();

    if (this.searchTerm) {
      const search = this.element?.querySelector('[data-action="search"]');
      if (search) {
        search.focus();
        const end = search.value.length;
        search.setSelectionRange?.(end, end);
      }
    }
  }

  _getCities(entries = codexEntries()) {
    return entries
      .filter(e => e.getFlag(MODULE_ID, "kind") === "city")
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }

  _currentCity(cities = this._getCities()) {
    return cities.find(c => c.id === this.selectedCityId) ?? cities[0] ?? null;
  }

  async _buildHTML() {
    const entries = codexEntries();
    const cities = this._getCities(entries);

    if (this.selectedCityId && !cities.some(c => c.id === this.selectedCityId)) this.selectedCityId = null;
    if (!this.selectedCityId && cities.length) this.selectedCityId = cities[0].id;

    const sidebar = this._buildSidebar(cities);
    let main;

    if (this.section === "journals") {
      main = this._buildJournalBrowser(this.searchTerm);
    } else if (this.section === "outside") {
      main = this.searchTerm.trim() ? this._buildOutsideSearch(entries) : this._buildOutside(entries);
    } else if (!cities.length) {
      main = this._buildWelcome();
    } else {
      const city = this._currentCity(cities);
      const tree = normalizeTree(city, entries);
      main = this.searchTerm.trim()
        ? this._buildCitySearch(city, entries, tree)
        : this._buildCityWorkspace(city, entries, tree);
    }

    const placeholder = this.section === "journals"
      ? "Cerca nei Journal Foundry..."
      : this.section === "outside"
        ? "Cerca fuori città..."
        : `Cerca${this._currentCity(cities) ? ` in ${this._currentCity(cities).name}` : " nel Codex"}...`;

    return `
      <aside class="gm-codex-sidebar">
        <div class="gm-codex-brand">
          <i class="fa-solid fa-book-open"></i>
          <div><strong>GM Codex</strong><span>Manuale del GM</span></div>
        </div>
        ${sidebar}
      </aside>

      <main class="gm-codex-main">
        <header class="gm-codex-topbar">
          <div class="gm-codex-search-wrap">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="search" data-action="search" value="${escapeHTML(this.searchTerm)}" placeholder="${escapeHTML(placeholder)}">
            ${this.searchTerm ? '<button type="button" class="icon-btn" data-action="clear-search" title="Pulisci ricerca"><i class="fa-solid fa-xmark"></i></button>' : ""}
          </div>
          <button type="button" class="gm-codex-ghost" data-action="journals" title="Gestisci i Journal di Foundry">
            <i class="fa-solid fa-book"></i> Journal Foundry
          </button>
        </header>
        <section class="gm-codex-content">${main}</section>
      </main>`;
  }

  _buildSidebar(cities) {
    const cityButtons = cities.length
      ? cities.map(city => `
          <button type="button" class="gm-codex-nav ${this.selectedCityId === city.id && this.section === "city" ? "active" : ""}" data-action="select-city" data-id="${city.id}">
            <i class="fa-solid fa-city"></i><span>${escapeHTML(city.name)}</span>
          </button>`).join("")
      : '<div class="gm-codex-empty-mini">Nessuna città</div>';

    return `
      <div class="gm-codex-sidebar-head">
        <span>CITTÀ</span>
        <button type="button" class="icon-btn" data-action="add" data-kind="city" title="Nuova città"><i class="fa-solid fa-plus"></i></button>
      </div>
      <nav class="gm-codex-city-list">${cityButtons}</nav>

      <div class="gm-codex-sidebar-head outside-head"><span>FUORI CITTÀ</span></div>
      <nav>
        <button type="button" class="gm-codex-nav ${this.section === "outside" && this.outsideSection === "place" ? "active" : ""}" data-action="outside" data-kind="place">
          <i class="fa-solid fa-location-dot"></i><span>Luoghi</span>
        </button>
        <button type="button" class="gm-codex-nav ${this.section === "outside" && this.outsideSection === "encounter" ? "active" : ""}" data-action="outside" data-kind="encounter">
          <i class="fa-solid fa-shield-halved"></i><span>Incontri</span>
        </button>
      </nav>

      <div class="gm-codex-sidebar-head outside-head"><span>ARCHIVIO</span></div>
      <nav>
        <button type="button" class="gm-codex-nav ${this.section === "journals" ? "active" : ""}" data-action="journals">
          <i class="fa-solid fa-book"></i><span>Journal Foundry</span>
        </button>
      </nav>`;
  }

  _buildWelcome() {
    return `
      <div class="gm-codex-scroll-view">
        <div class="gm-codex-welcome">
          <i class="fa-solid fa-book-open-reader"></i>
          <h2>Il tuo Codex è vuoto</h2>
          <p>Crea una città oppure apri <strong>Journal Foundry</strong> e importa un Journal esistente come città.</p>
          <div class="gm-codex-welcome-actions">
            <button type="button" class="gm-codex-primary" data-action="add" data-kind="city"><i class="fa-solid fa-plus"></i> Nuova città</button>
            <button type="button" class="gm-codex-secondary" data-action="journals"><i class="fa-solid fa-book"></i> Journal Foundry</button>
          </div>
        </div>
      </div>`;
  }

  _buildCityWorkspace(city, entries, tree) {
    if (this.selectedTreeNodeId && !findNode(tree, this.selectedTreeNodeId)) this.selectedTreeNodeId = null;

    const pageCount = getPages(city).length;
    const linkedCount = entries.filter(e => e.id !== city.id && e.getFlag(MODULE_ID, "cityId") === city.id).length;

    return `
      <div class="gm-codex-city-layout">
        <div class="gm-codex-city-header">
          <div>
            <span class="eyebrow">CITTÀ / AREA</span>
            <h1>${escapeHTML(city.name)}</h1>
            <div class="gm-codex-city-stats">${pageCount} ${pageCount === 1 ? "pagina" : "pagine"} · ${linkedCount} ${linkedCount === 1 ? "scheda collegata" : "schede collegate"}</div>
          </div>
          <div class="gm-codex-city-actions">
            <button type="button" class="gm-codex-primary" data-action="add-group"><i class="fa-solid fa-folder-plus"></i> Capitolo</button>
            <button type="button" class="gm-codex-primary" data-action="add-city-page" data-city-id="${city.id}"><i class="fa-solid fa-file-circle-plus"></i> Pagina</button>
            <button type="button" class="gm-codex-secondary" data-action="quick-create" data-city-id="${city.id}"><i class="fa-solid fa-plus"></i> Scheda</button>
            <button type="button" class="gm-codex-secondary" data-action="open-journal" data-id="${city.id}" title="Apri il Journal originale"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="gm-codex-secondary" data-action="share" data-id="${city.id}" title="${isShared(city) ? "Visibile al gruppo" : "Solo GM"}"><i class="fa-solid ${isShared(city) ? "fa-unlock" : "fa-lock"}"></i></button>
            <button type="button" class="gm-codex-danger compact-btn" data-action="delete" data-id="${city.id}" title="Elimina città"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <div class="gm-codex-city-workspace">
          <aside class="gm-codex-tree-panel">
            <div class="gm-codex-tree-head">
              <button type="button" class="gm-codex-tree-home ${!this.selectedTreeNodeId ? "active" : ""}" data-action="city-home">
                <i class="fa-solid fa-house"></i><span>Panoramica</span>
              </button>
              <span class="gm-codex-tree-help" title="Trascina pagine e capitoli per riordinarli"><i class="fa-solid fa-arrows-up-down-left-right"></i></span>
            </div>
            <div class="gm-codex-tree">
              ${this._renderTreeNodes(city, entries, tree)}
              <div class="gm-codex-tree-root-drop" data-tree-root-drop="true"><i class="fa-solid fa-turn-down"></i> Trascina qui per portare alla radice</div>
            </div>
          </aside>

          <section class="gm-codex-reader">
            ${this._renderSelectedCityNode(city, entries, tree)}
          </section>
        </div>
      </div>`;
  }

  _renderTreeNodes(city, entries, nodes, depth = 0) {
    if (!nodes?.length) return '<div class="gm-codex-tree-empty">Nessuna voce.</div>';

    return nodes.map(node => {
      if (node.type === "group") {
        const collapsed = this.collapsedGroups.has(node.id);
        const active = this.selectedTreeNodeId === node.id ? "active" : "";
        return `
          <div class="gm-codex-tree-branch">
            <div class="gm-codex-tree-row group ${active}" draggable="true" data-tree-node="${node.id}" data-node-type="group" style="--depth:${depth}">
              <button type="button" class="gm-codex-tree-toggle" data-action="toggle-group" data-id="${node.id}" title="${collapsed ? "Espandi" : "Comprimi"}">
                <i class="fa-solid fa-chevron-${collapsed ? "right" : "down"}"></i>
              </button>
              <button type="button" class="gm-codex-tree-label" data-action="select-tree-node" data-id="${node.id}">
                <i class="${escapeHTML(node.icon || iconForGroup(node.title))}"></i>
                <span>${escapeHTML(node.title)}</span>
                <small>${treeLeafCount(node)}</small>
              </button>
              <div class="gm-codex-tree-row-actions">
                <button type="button" data-action="add-group" data-parent-id="${node.id}" title="Nuovo sottocapitolo"><i class="fa-solid fa-folder-plus"></i></button>
                <button type="button" data-action="add-city-page" data-city-id="${city.id}" data-parent-id="${node.id}" title="Nuova pagina qui"><i class="fa-solid fa-file-circle-plus"></i></button>
                <button type="button" data-action="rename-group" data-id="${node.id}" title="Rinomina"><i class="fa-solid fa-pen"></i></button>
              </div>
            </div>
            ${collapsed ? "" : `<div class="gm-codex-tree-children">${this._renderTreeNodes(city, entries, node.children ?? [], depth + 1)}</div>`}
          </div>`;
      }

      if (node.type === "page") {
        const page = city.pages?.get?.(node.pageId) ?? getPages(city).find(p => p.id === node.pageId);
        if (!page) return "";
        const icon = page.type === "image" ? "fa-solid fa-image" : "fa-regular fa-file-lines";
        const active = this.selectedTreeNodeId === node.id ? "active" : "";
        return `
          <div class="gm-codex-tree-row leaf ${active}" draggable="true" data-tree-node="${node.id}" data-node-type="page" style="--depth:${depth}">
            <span class="gm-codex-tree-spacer"></span>
            <button type="button" class="gm-codex-tree-label" data-action="select-tree-node" data-id="${node.id}">
              <i class="${icon}"></i><span>${escapeHTML(page.name || "Pagina")}</span>
            </button>
            <span class="gm-codex-tree-drag"><i class="fa-solid fa-grip-vertical"></i></span>
          </div>`;
      }

      if (node.type === "entry") {
        const entry = game.journal.get(node.entryId);
        if (!entry) return "";
        const kind = entry.getFlag(MODULE_ID, "kind");
        const active = this.selectedTreeNodeId === node.id ? "active" : "";
        return `
          <div class="gm-codex-tree-row leaf linked ${active}" draggable="true" data-tree-node="${node.id}" data-node-type="entry" style="--depth:${depth}">
            <span class="gm-codex-tree-spacer"></span>
            <button type="button" class="gm-codex-tree-label" data-action="select-tree-node" data-id="${node.id}">
              <i class="${KIND_ICONS[kind] ?? "fa-solid fa-link"}"></i><span>${escapeHTML(entry.name)}</span>
            </button>
            <span class="gm-codex-tree-drag"><i class="fa-solid fa-grip-vertical"></i></span>
          </div>`;
      }

      return "";
    }).join("");
  }

  _renderSelectedCityNode(city, entries, tree) {
    if (!this.selectedTreeNodeId) return this._renderCityHome(city, entries, tree);

    const found = findNode(tree, this.selectedTreeNodeId);
    if (!found) return this._renderCityHome(city, entries, tree);
    const node = found.node;

    if (node.type === "group") return this._renderGroupOverview(city, entries, tree, node);
    if (node.type === "page") {
      const page = city.pages?.get?.(node.pageId) ?? getPages(city).find(p => p.id === node.pageId);
      return this._renderCityPage(city, page);
    }
    if (node.type === "entry") {
      const entry = game.journal.get(node.entryId);
      return entry ? this._renderEntryDetail(entry) : this._renderCityHome(city, entries, tree);
    }
    return this._renderCityHome(city, entries, tree);
  }

  _renderCityHome(city, entries, tree) {
    const groups = tree.filter(node => node.type === "group");
    const loose = tree.filter(node => node.type !== "group");

    const cards = groups.map(group => `
      <button type="button" class="gm-codex-home-card" data-action="select-tree-node" data-id="${group.id}">
        <div class="gm-codex-home-card-icon"><i class="${escapeHTML(group.icon || iconForGroup(group.title))}"></i></div>
        <div><strong>${escapeHTML(group.title)}</strong><span>${treeLeafCount(group)} ${treeLeafCount(group) === 1 ? "voce" : "voci"}</span></div>
        <i class="fa-solid fa-chevron-right"></i>
      </button>`).join("");

    const looseCards = loose.length ? `
      <div class="gm-codex-home-loose">
        <h3>Senza capitolo</h3>
        <div class="gm-codex-mini-cards">${loose.map(node => this._renderNodeCard(city, node)).join("")}</div>
      </div>` : "";

    return `
      <div class="gm-codex-reader-scroll">
        <div class="gm-codex-home-hero">
          <span class="eyebrow">MANUALE DEL GM</span>
          <h2>${escapeHTML(city.name)}</h2>
          <p>Apri un capitolo oppure usa l'albero a sinistra. Puoi trascinare pagine e capitoli per costruire la struttura che preferisci.</p>
        </div>
        <div class="gm-codex-home-grid">${cards || '<div class="gm-codex-empty-list"><p>Nessun capitolo.</p></div>'}</div>
        ${looseCards}
      </div>`;
  }

  _renderGroupOverview(city, entries, tree, group) {
    const path = findPathToNode(tree, group.id);
    const breadcrumb = path.slice(0, -1).map(n => escapeHTML(n.title || "")).filter(Boolean).join(" / ");

    return `
      <div class="gm-codex-reader-scroll">
        <div class="gm-codex-reader-head">
          <div>
            ${breadcrumb ? `<span class="eyebrow">${breadcrumb}</span>` : '<span class="eyebrow">CAPITOLO</span>'}
            <h2><i class="${escapeHTML(group.icon || iconForGroup(group.title))}"></i> ${escapeHTML(group.title)}</h2>
            <p>${treeLeafCount(group)} ${treeLeafCount(group) === 1 ? "voce" : "voci"} nel capitolo</p>
          </div>
          <div class="gm-codex-reader-actions">
            <button type="button" class="gm-codex-secondary" data-action="add-group" data-parent-id="${group.id}"><i class="fa-solid fa-folder-plus"></i> Sottocapitolo</button>
            <button type="button" class="gm-codex-secondary" data-action="add-city-page" data-city-id="${city.id}" data-parent-id="${group.id}"><i class="fa-solid fa-file-circle-plus"></i> Pagina</button>
            <button type="button" class="gm-codex-secondary" data-action="rename-group" data-id="${group.id}"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="gm-codex-danger compact-btn" data-action="delete-group" data-id="${group.id}" title="Elimina il capitolo mantenendo le pagine"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <div class="gm-codex-chapter-grid">
          ${(group.children ?? []).length
            ? group.children.map(node => this._renderNodeCard(city, node)).join("")
            : '<div class="gm-codex-empty-chapter"><i class="fa-solid fa-folder-open"></i><p>Capitolo vuoto. Trascina qui una pagina dall’albero oppure creane una nuova.</p></div>'}
        </div>
      </div>`;
  }

  _renderNodeCard(city, node) {
    if (node.type === "group") {
      return `
        <button type="button" class="gm-codex-chapter-card group" data-action="select-tree-node" data-id="${node.id}">
          <i class="${escapeHTML(node.icon || iconForGroup(node.title))}"></i>
          <div><strong>${escapeHTML(node.title)}</strong><span>${treeLeafCount(node)} ${treeLeafCount(node) === 1 ? "voce" : "voci"}</span></div>
          <i class="fa-solid fa-chevron-right"></i>
        </button>`;
    }

    if (node.type === "page") {
      const page = city.pages?.get?.(node.pageId) ?? getPages(city).find(p => p.id === node.pageId);
      if (!page) return "";
      const snippet = page.type === "text" ? truncate(stripHTML(page.text?.content ?? ""), 115) : "Pagina immagine";
      return `
        <button type="button" class="gm-codex-chapter-card" data-action="select-tree-node" data-id="${node.id}">
          <i class="${page.type === "image" ? "fa-solid fa-image" : "fa-regular fa-file-lines"}"></i>
          <div><strong>${escapeHTML(page.name || "Pagina")}</strong><span>${escapeHTML(snippet || "Pagina vuota")}</span></div>
          <i class="fa-solid fa-chevron-right"></i>
        </button>`;
    }

    if (node.type === "entry") {
      const entry = game.journal.get(node.entryId);
      if (!entry) return "";
      const kind = entry.getFlag(MODULE_ID, "kind");
      return `
        <button type="button" class="gm-codex-chapter-card" data-action="select-tree-node" data-id="${node.id}">
          <i class="${KIND_ICONS[kind] ?? "fa-solid fa-link"}"></i>
          <div><strong>${escapeHTML(entry.name)}</strong><span>${escapeHTML(KIND_LABELS[kind] ?? "Scheda")}</span></div>
          <i class="fa-solid fa-chevron-right"></i>
        </button>`;
    }

    return "";
  }

  _renderPageOutline(outline = []) {
    if (outline.length < 2) return "";

    const minLevel = Math.min(...outline.map(item => item.level));
    return `
      <nav class="gm-codex-page-index" aria-label="Indice della pagina">
        <div class="gm-codex-page-index-label"><i class="fa-solid fa-list"></i><span>Indice pagina</span></div>
        <div class="gm-codex-page-index-items">
          ${outline.map(item => `
            <button type="button" class="gm-codex-page-index-link level-${Math.max(0, item.level - minLevel)}" data-action="jump-heading" data-heading-id="${escapeHTML(item.id)}" title="Vai a ${escapeHTML(item.label)}">
              ${escapeHTML(item.label)}
            </button>`).join("")}
        </div>
      </nav>`;
  }

  _renderPageBody(entry, page) {
    if (!page) return '<div class="gm-codex-empty-list"><i class="fa-solid fa-file-circle-question"></i><p>Pagina non disponibile.</p></div>';

    if (page.type === "text") {
      const prepared = prepareTextPage(page.text?.content || "<p><em>Pagina vuota.</em></p>", entry, page);
      return `
        ${this._renderPageOutline(prepared.outline)}
        <section class="gm-codex-page gm-codex-readable">${prepared.html}</section>`;
    }
    if (page.type === "image" && page.src) {
      return `
        <section class="gm-codex-page image-page">
          <img src="${escapeHTML(page.src)}" alt="${escapeHTML(page.name || "Immagine")}">
          <button type="button" class="gm-codex-image-open standalone" data-action="open-image" data-src="${escapeHTML(page.src)}" data-title="${escapeHTML(page.name || "Immagine")}" data-uuid="${escapeHTML(page.uuid || entry.uuid || "")}">
            <i class="fa-solid fa-image"></i> Apri immagine
          </button>
        </section>`;
    }
    return `<section class="gm-codex-page unsupported"><em>Questo tipo di pagina può essere aperto dal Journal originale.</em></section>`;
  }

  _renderCityPage(city, page) {
    if (!page) return '<div class="gm-codex-empty-list"><p>Pagina non disponibile.</p></div>';

    return `
      <div class="gm-codex-reader-scroll">
        <div class="gm-codex-reader-head">
          <div><span class="eyebrow">PAGINA / ${escapeHTML(city.name)}</span><h2>${escapeHTML(page.name || "Pagina")}</h2></div>
          <div class="gm-codex-reader-actions">
            <button type="button" class="gm-codex-secondary" data-action="open-page" data-entry-id="${city.id}" data-page-id="${page.id}"><i class="fa-solid fa-pen"></i> Modifica</button>
            <button type="button" class="gm-codex-danger compact-btn" data-action="delete-city-page" data-entry-id="${city.id}" data-page-id="${page.id}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        ${this._renderPageBody(city, page)}
      </div>`;
  }

  _renderEntryDetail(entry) {
    const kind = entry.getFlag(MODULE_ID, "kind");
    const pages = getPages(entry);
    if (this.selectedEntryPageId && !pages.some(p => p.id === this.selectedEntryPageId)) this.selectedEntryPageId = null;
    const page = pages.find(p => p.id === this.selectedEntryPageId) ?? pages[0] ?? null;
    if (page) this.selectedEntryPageId = page.id;

    const tabs = pages.length > 1 ? `
      <nav class="gm-codex-entry-page-tabs">
        ${pages.map(p => `<button type="button" class="${p.id === page?.id ? "active" : ""}" data-action="select-entry-page" data-page-id="${p.id}">${escapeHTML(p.name || "Pagina")}</button>`).join("")}
      </nav>` : "";

    const status = kind === "quest" ? entry.getFlag(MODULE_ID, "status") : null;

    return `
      <div class="gm-codex-reader-scroll">
        <div class="gm-codex-reader-head">
          <div>
            <span class="eyebrow">${escapeHTML(KIND_LABELS[kind] ?? "SCHEDA")}</span>
            <h2>${escapeHTML(entry.name)}</h2>
            ${status ? `<span class="status status-${escapeHTML(status)}">${escapeHTML(QUEST_STATUSES[status] ?? status)}</span>` : ""}
          </div>
          <div class="gm-codex-reader-actions">
            <button type="button" class="gm-codex-secondary" data-action="open-journal" data-id="${entry.id}"><i class="fa-solid fa-pen-to-square"></i> Modifica</button>
            <button type="button" class="gm-codex-secondary" data-action="show" data-id="${entry.id}"><i class="fa-solid fa-eye"></i> Mostra</button>
            <button type="button" class="gm-codex-secondary" data-action="share" data-id="${entry.id}" title="${isShared(entry) ? "Visibile al gruppo" : "Solo GM"}"><i class="fa-solid ${isShared(entry) ? "fa-unlock" : "fa-lock"}"></i></button>
            ${kind === "quest" ? `<button type="button" class="gm-codex-secondary" data-action="quest-status" data-id="${entry.id}"><i class="fa-solid fa-list-check"></i></button>` : ""}
            <button type="button" class="gm-codex-danger compact-btn" data-action="delete" data-id="${entry.id}" title="Elimina scheda"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        ${tabs}
        ${this._renderPageBody(entry, page)}
      </div>`;
  }

  _buildCitySearch(city, entries, tree) {
    const q = this.searchTerm.trim().toLocaleLowerCase("it");
    const results = [];

    walkTree(tree, node => {
      if (node.type === "group") {
        if (node.title.toLocaleLowerCase("it").includes(q)) {
          results.push({ nodeId: node.id, type: "Capitolo", title: node.title, snippet: `${treeLeafCount(node)} voci` });
        }
        return;
      }

      if (node.type === "page") {
        const page = city.pages?.get?.(node.pageId) ?? getPages(city).find(p => p.id === node.pageId);
        if (!page) return;
        const text = page.type === "text" ? stripHTML(page.text?.content ?? "") : "";
        const haystack = `${page.name} ${text}`.toLocaleLowerCase("it");
        if (haystack.includes(q)) {
          results.push({ nodeId: node.id, type: "Pagina", title: page.name, snippet: truncate(text, 150) });
        }
        return;
      }

      if (node.type === "entry") {
        const entry = game.journal.get(node.entryId);
        if (!entry) return;
        const text = stripHTML(getEntryContent(entry));
        const kind = entry.getFlag(MODULE_ID, "kind");
        const haystack = `${entry.name} ${KIND_LABELS[kind] ?? ""} ${text}`.toLocaleLowerCase("it");
        if (haystack.includes(q)) {
          results.push({ nodeId: node.id, type: KIND_LABELS[kind] ?? "Scheda", title: entry.name, snippet: truncate(text, 150) });
        }
      }
    });

    const cards = results.length ? results.map(result => {
      const path = findPathToNode(tree, result.nodeId)
        .slice(0, -1)
        .map(n => n.title || (n.type === "page" ? city.pages?.get?.(n.pageId)?.name : ""))
        .filter(Boolean)
        .join(" / ");
      return `
        <button type="button" class="gm-codex-search-result" data-action="open-search-result" data-id="${result.nodeId}">
          <div class="gm-codex-search-result-type">${escapeHTML(result.type)}</div>
          <strong>${escapeHTML(result.title || "Senza titolo")}</strong>
          ${path ? `<small>${escapeHTML(path)}</small>` : ""}
          <p>${escapeHTML(result.snippet || "")}</p>
        </button>`;
    }).join("") : '<div class="gm-codex-empty-list"><i class="fa-solid fa-magnifying-glass"></i><p>Nessun risultato in questa città.</p></div>';

    return `
      <div class="gm-codex-scroll-view">
        <div class="gm-codex-section-header">
          <div><span class="eyebrow">RICERCA IN ${escapeHTML(city.name)}</span><h1>“${escapeHTML(this.searchTerm)}”</h1></div>
        </div>
        <div class="gm-codex-list-toolbar"><span>${results.length} ${results.length === 1 ? "risultato" : "risultati"}</span></div>
        <div class="gm-codex-search-results">${cards}</div>
      </div>`;
  }

  _buildOutside(entries) {
    const kind = this.outsideSection;
    const label = kind === "place" ? "Luoghi fuori città" : "Incontri fuori città";
    const items = entries
      .filter(e => e.getFlag(MODULE_ID, "kind") === kind && !e.getFlag(MODULE_ID, "cityId"))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    return `
      <div class="gm-codex-scroll-view">
        <div class="gm-codex-section-header"><div><span class="eyebrow">FUORI CITTÀ</span><h1>${label}</h1></div></div>
        ${this._buildList(items, kind)}
      </div>`;
  }

  _buildOutsideSearch(entries) {
    const q = this.searchTerm.trim().toLocaleLowerCase("it");
    const items = entries
      .filter(e => ["place", "encounter"].includes(e.getFlag(MODULE_ID, "kind")) && !e.getFlag(MODULE_ID, "cityId"))
      .filter(e => `${e.name} ${stripHTML(getEntryContent(e))}`.toLocaleLowerCase("it").includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    return `
      <div class="gm-codex-scroll-view">
        <div class="gm-codex-section-header"><div><span class="eyebrow">RICERCA FUORI CITTÀ</span><h1>“${escapeHTML(this.searchTerm)}”</h1></div></div>
        ${this._buildList(items, this.outsideSection)}
      </div>`;
  }

  _buildList(items, kind) {
    const label = KIND_LABELS[kind] ?? "Elemento";
    const icon = KIND_ICONS[kind] ?? "fa-solid fa-file";
    const cards = items.length
      ? items.map(entry => this._entryCard(entry)).join("")
      : `<div class="gm-codex-empty-list"><i class="${icon}"></i><p>Nessun ${label.toLowerCase()} ancora.</p></div>`;

    return `
      <div class="gm-codex-list-toolbar">
        <span>${items.length} ${items.length === 1 ? "voce" : "voci"}</span>
        <button type="button" class="gm-codex-primary" data-action="add" data-kind="${kind}"><i class="fa-solid fa-plus"></i> Nuovo</button>
      </div>
      <div class="gm-codex-cards">${cards}</div>`;
  }

  _entryCard(entry) {
    const kind = entry.getFlag(MODULE_ID, "kind");
    const raw = stripHTML(getEntryContent(entry));
    const status = kind === "quest" ? entry.getFlag(MODULE_ID, "status") : null;
    const statusHTML = status ? `<span class="status status-${escapeHTML(status)}">${escapeHTML(QUEST_STATUSES[status] ?? status)}</span>` : "";

    return `
      <button type="button" class="gm-codex-card" data-action="outside-detail" data-id="${entry.id}">
        <div class="gm-codex-card-icon"><i class="${KIND_ICONS[kind] ?? "fa-solid fa-file"}"></i></div>
        <div class="gm-codex-card-copy">
          <div class="gm-codex-card-title"><strong>${escapeHTML(entry.name)}</strong>${statusHTML}</div>
          <p>${escapeHTML(truncate(raw.replace(entry.name, "").trim() || "Apri la scheda."))}</p>
        </div>
        <i class="fa-solid fa-chevron-right"></i>
      </button>`;
  }

  _buildJournalBrowser(filterTerm = "") {
    const q = String(filterTerm || "").trim().toLocaleLowerCase("it");
    const journals = game.journal.contents
      .filter(entry => !q || [entry.name, entry.folder?.name, stripHTML(getEntryContent(entry))].filter(Boolean).join(" ").toLocaleLowerCase("it").includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    const rows = journals.length ? journals.map(entry => {
      const kind = entry.getFlag(MODULE_ID, "kind");
      const managed = Boolean(kind);
      const folder = entry.folder?.name
        ? `<span class="gm-codex-journal-folder"><i class="fa-solid fa-folder"></i> ${escapeHTML(entry.folder.name)}</span>`
        : "";
      const badge = managed
        ? `<span class="gm-codex-managed-badge"><i class="fa-solid fa-book-open"></i> ${escapeHTML(KIND_LABELS[kind] ?? kind)}</span>`
        : `<span class="gm-codex-unmanaged-badge">Journal Foundry</span>`;

      return `
        <article class="gm-codex-journal-row">
          <div class="gm-codex-journal-main">
            <div class="gm-codex-journal-name"><strong>${escapeHTML(entry.name)}</strong>${badge}</div>
            <div class="gm-codex-journal-meta">${folder}<span>${getPages(entry).length} ${getPages(entry).length === 1 ? "pagina" : "pagine"}</span></div>
          </div>
          <div class="gm-codex-journal-actions">
            <button type="button" class="gm-codex-secondary compact-btn" data-action="open-journal" data-id="${entry.id}" title="Apri Journal"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
            ${managed
              ? `<button type="button" class="gm-codex-secondary compact-btn" data-action="unimport-journal" data-id="${entry.id}"><i class="fa-solid fa-link-slash"></i> Rimuovi dal Codex</button>`
              : `<button type="button" class="gm-codex-primary compact-btn" data-action="import-journal" data-id="${entry.id}"><i class="fa-solid fa-file-import"></i> Aggiungi al Codex</button>`}
            <button type="button" class="gm-codex-danger compact-btn" data-action="delete-journal" data-id="${entry.id}" title="Elimina definitivamente"><i class="fa-solid fa-trash"></i></button>
          </div>
        </article>`;
    }).join("") : '<div class="gm-codex-empty-list"><i class="fa-solid fa-book"></i><p>Nessun Journal trovato.</p></div>';

    return `
      <div class="gm-codex-scroll-view">
        <div class="gm-codex-section-header gm-codex-journal-header">
          <div>
            <span class="eyebrow">ARCHIVIO FOUNDRY</span>
            <h1>Journal Foundry</h1>
            <p class="gm-codex-section-subtitle">Il Codex usa i Journal esistenti senza duplicarli. Puoi importarli, crearne di nuovi, aprirli o eliminarli.</p>
          </div>
          <button type="button" class="gm-codex-primary" data-action="create-journal"><i class="fa-solid fa-plus"></i> Nuovo Journal</button>
        </div>
        <div class="gm-codex-list-toolbar"><span>${journals.length} Journal</span></div>
        <div class="gm-codex-journal-list">${rows}</div>
      </div>`;
  }

  _buildOutsideDetail(entry) {
    return `
      <div class="gm-codex-scroll-view">
        <button type="button" class="gm-codex-back" data-action="outside-back"><i class="fa-solid fa-arrow-left"></i> Indietro</button>
        ${this._renderEntryDetail(entry)}
      </div>`;
  }

  /* ------------------------------------------------------------------------ */
  /*                                Listeners                                 */
  /* ------------------------------------------------------------------------ */

  _bindListeners() {
    const root = this.element;
    if (!root) return;

    root.querySelectorAll("[data-action]").forEach(el => {
      const action = el.dataset.action;
      if (action === "search") {
        el.addEventListener("input", event => {
          this.searchTerm = event.currentTarget.value;
          clearTimeout(this._searchTimer);
          this._searchTimer = setTimeout(() => this.render(), 160);
        });
        return;
      }
      el.addEventListener("click", event => this._handleAction(event));
    });
  }

  _bindDragDrop() {
    const root = this.element;
    if (!root || this.section !== "city" || this.searchTerm) return;

    root.querySelectorAll("[data-tree-node]").forEach(row => {
      row.addEventListener("dragstart", event => {
        this._dragNodeId = row.dataset.treeNode;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", this._dragNodeId);
        row.classList.add("dragging");
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        root.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
        this._dragNodeId = null;
      });

      row.addEventListener("dragover", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this._dragNodeId || this._dragNodeId === row.dataset.treeNode) return;
        event.dataTransfer.dropEffect = "move";
        root.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
        row.classList.add("drop-target");
      });

      row.addEventListener("drop", async event => {
        event.preventDefault();
        event.stopPropagation();
        row.classList.remove("drop-target");
        const sourceId = this._dragNodeId || event.dataTransfer.getData("text/plain");
        const targetId = row.dataset.treeNode;
        const mode = row.dataset.nodeType === "group" ? "inside" : "after";
        await this._moveNode(sourceId, targetId, mode);
      });
    });

    const rootDrop = root.querySelector("[data-tree-root-drop]");
    if (rootDrop) {
      rootDrop.addEventListener("dragover", event => {
        event.preventDefault();
        event.stopPropagation();
        rootDrop.classList.add("drop-target");
      });
      rootDrop.addEventListener("dragleave", () => rootDrop.classList.remove("drop-target"));
      rootDrop.addEventListener("drop", async event => {
        event.preventDefault();
        event.stopPropagation();
        rootDrop.classList.remove("drop-target");
        const sourceId = this._dragNodeId || event.dataTransfer.getData("text/plain");
        await this._moveNode(sourceId, null, "root");
      });
    }
  }

  async _handleAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;

    switch (action) {
      case "select-city":
        this.selectedCityId = target.dataset.id;
        this.section = "city";
        this.selectedTreeNodeId = null;
        this.selectedEntryPageId = null;
        this.searchTerm = "";
        return this.render({ force: true });

      case "city-home":
        this.selectedTreeNodeId = null;
        return this.render({ force: true });

      case "select-tree-node":
        this.selectedTreeNodeId = target.dataset.id;
        this.selectedEntryPageId = null;
        return this.render({ force: true });

      case "open-search-result":
        this.selectedTreeNodeId = target.dataset.id;
        this.searchTerm = "";
        return this.render({ force: true });

      case "toggle-group":
        if (this.collapsedGroups.has(target.dataset.id)) this.collapsedGroups.delete(target.dataset.id);
        else this.collapsedGroups.add(target.dataset.id);
        return this.render({ force: true });

      case "add-group":
        return this._promptAddGroup(target.dataset.parentId || null);

      case "rename-group":
        return this._promptRenameGroup(target.dataset.id);

      case "delete-group":
        return this._deleteGroup(target.dataset.id);

      case "add-city-page":
        return this._promptAddCityPage(target.dataset.cityId, target.dataset.parentId || null);

      case "delete-city-page":
        return this._deleteCityPage(target.dataset.entryId, target.dataset.pageId);

      case "select-entry-page":
        this.selectedEntryPageId = target.dataset.pageId || null;
        return this.render({ force: true });

      case "jump-heading": {
        const headingId = target.dataset.headingId;
        const heading = headingId ? this.element?.querySelector(`#${headingId}`) : null;
        if (!heading) return;
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        heading.classList.add("gm-codex-heading-flash");
        window.setTimeout(() => heading.classList.remove("gm-codex-heading-flash"), 1200);
        return;
      }

      case "quick-create":
        return this._promptQuickCreate(target.dataset.cityId);

      case "journals":
        this.section = "journals";
        this.selectedEntryId = null;
        this.searchTerm = "";
        return this.render({ force: true });

      case "outside":
        this.section = "outside";
        this.outsideSection = target.dataset.kind;
        this.selectedEntryId = null;
        this.searchTerm = "";
        return this.render({ force: true });

      case "outside-detail":
        this.selectedEntryId = target.dataset.id;
        return this.render({ force: true });

      case "outside-back":
        this.selectedEntryId = null;
        return this.render({ force: true });

      case "clear-search":
        this.searchTerm = "";
        return this.render({ force: true });

      case "open-journal":
        return this._openJournal(target.dataset.id);

      case "open-page":
        return this._openPage(target.dataset.entryId, target.dataset.pageId);

      case "create-journal":
        return this._promptCreateJournal();

      case "import-journal":
        return this._promptImportJournal(target.dataset.id);

      case "unimport-journal":
        return this._unimportJournal(target.dataset.id);

      case "delete-journal":
        return this._deleteFoundryJournal(target.dataset.id);

      case "show":
        return this._showEntry(target.dataset.id);

      case "open-image":
        return this._openImage(target.dataset.src, target.dataset.title, target.dataset.uuid);

      case "share":
        return this._toggleShare(target.dataset.id);

      case "delete":
        return this._deleteEntry(target.dataset.id);

      case "quest-status":
        return this._changeQuestStatus(target.dataset.id);

      case "add":
        return this._promptAdd(target.dataset.kind, null);
    }
  }

  async _saveTree(city, tree) {
    await city.setFlag(MODULE_ID, TREE_FLAG, tree);
  }

  async _moveNode(sourceId, targetId, mode) {
    if (!sourceId) return;
    const city = this._currentCity();
    if (!city) return;
    const tree = normalizeTree(city, codexEntries());

    if (sourceId === targetId) return;
    const source = findNode(tree, sourceId)?.node;
    if (!source) return;
    if (targetId && treeContains(source, targetId)) {
      ui.notifications.warn("Non puoi spostare un capitolo dentro uno dei suoi sottocapitoli.");
      return;
    }

    const moved = moveTreeNode(tree, sourceId, targetId, mode);
    await this._saveTree(city, moved);
    this.selectedTreeNodeId = sourceId;
    this.render({ force: true });
  }

  async _promptAddGroup(parentId = null) {
    const city = this._currentCity();
    if (!city) return;

    let title;
    try {
      title = await foundry.applications.api.DialogV2.prompt({
        window: { title: parentId ? "Nuovo sottocapitolo" : "Nuovo capitolo" },
        content: `<div class="gm-codex-dialog"><label class="gm-codex-dialog-field"><span>Nome</span><input name="title" type="text" autofocus required placeholder="Es. Storia, Segreti, Eventi..."></label></div>`,
        ok: { label: "Crea", icon: "fa-solid fa-folder-plus", callback: (_event, button) => button.form.elements.title.value.trim() },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!title) return;
    const tree = normalizeTree(city, codexEntries());
    const group = makeGroup(title);

    if (parentId) {
      const parent = findNode(tree, parentId)?.node;
      if (parent?.type === "group") {
        parent.children ??= [];
        parent.children.push(group);
      } else tree.push(group);
    } else tree.push(group);

    await this._saveTree(city, tree);
    this.selectedTreeNodeId = group.id;
    this.render({ force: true });
  }

  async _promptRenameGroup(groupId) {
    const city = this._currentCity();
    if (!city) return;
    const tree = normalizeTree(city, codexEntries());
    const group = findNode(tree, groupId)?.node;
    if (!group || group.type !== "group") return;

    let title;
    try {
      title = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Rinomina capitolo" },
        content: `<div class="gm-codex-dialog"><label class="gm-codex-dialog-field"><span>Nome</span><input name="title" type="text" value="${escapeHTML(group.title)}" autofocus required></label></div>`,
        ok: { label: "Salva", icon: "fa-solid fa-floppy-disk", callback: (_event, button) => button.form.elements.title.value.trim() },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!title) return;
    group.title = title;
    group.icon = iconForGroup(title);
    await this._saveTree(city, tree);
    this.render({ force: true });
  }

  async _deleteGroup(groupId) {
    const city = this._currentCity();
    if (!city) return;
    const tree = normalizeTree(city, codexEntries());
    const info = findContainer(tree, groupId);
    if (!info || info.node.type !== "group") return;
    const group = info.node;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Eliminare il capitolo “${group.title}”?` },
      content: `<p>Il capitolo verrà rimosso, ma <strong>le pagine e le schede al suo interno non verranno eliminate</strong>: saranno spostate al livello superiore.</p>`,
      yes: { label: "Elimina capitolo", icon: "fa-solid fa-trash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    info.array.splice(info.index, 1, ...(group.children ?? []));
    await this._saveTree(city, tree);
    if (this.selectedTreeNodeId === groupId) this.selectedTreeNodeId = null;
    this.render({ force: true });
  }

  _openJournal(id) {
    const entry = game.journal.get(id);
    if (entry) entry.sheet?.render(true);
  }

  _openPage(entryId, pageId) {
    const entry = game.journal.get(entryId);
    const page = entry?.pages?.get?.(pageId) ?? getPages(entry).find(p => p.id === pageId);
    if (page) page.sheet?.render(true);
  }

  async _promptAddCityPage(cityId, parentId = null) {
    const city = game.journal.get(cityId);
    if (!city) return;

    let name;
    try {
      name = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Nuova pagina — ${city.name}` },
        content: `<div class="gm-codex-dialog"><label class="gm-codex-dialog-field"><span>Titolo</span><input name="name" type="text" autofocus required placeholder="Es. Storia, La chiesa, Indizi..."></label></div>`,
        ok: { label: "Crea pagina", icon: "fa-solid fa-plus", callback: (_event, button) => button.form.elements.name.value.trim() },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!name) return ui.notifications.warn("Inserisci un titolo.");

    const created = await city.createEmbeddedDocuments("JournalEntryPage", [{
      name,
      type: "text",
      text: {
        content: `<h2>${escapeHTML(name)}</h2><p></p>`,
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
      }
    }]);
    const page = created?.[0];
    if (!page) return;

    const tree = normalizeTree(city, codexEntries());
    let pageNode = null;
    walkTree(tree, node => {
      if (!pageNode && node.type === "page" && node.pageId === page.id) pageNode = node;
    });

    // normalizeTree already adds the new page. Move it into the requested parent, if any.
    if (parentId && pageNode) {
      const moved = moveTreeNode(tree, pageNode.id, parentId, "inside");
      await this._saveTree(city, moved);
      this.selectedTreeNodeId = pageNode.id;
    } else {
      await this._saveTree(city, tree);
      this.selectedTreeNodeId = pageNode?.id ?? null;
    }

    ui.notifications.info(`Pagina “${name}” creata.`);
    this.render({ force: true });
  }

  async _deleteCityPage(entryId, pageId) {
    const entry = game.journal.get(entryId);
    const page = entry?.pages?.get?.(pageId) ?? getPages(entry).find(p => p.id === pageId);
    if (!entry || !page) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Eliminare “${page.name}”?` },
      content: `<p>Vuoi eliminare definitivamente la pagina <strong>${escapeHTML(page.name)}</strong> dal Journal <strong>${escapeHTML(entry.name)}</strong>?</p>`,
      yes: { label: "Elimina pagina", icon: "fa-solid fa-trash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    await entry.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
    this.selectedTreeNodeId = null;
    this.render({ force: true });
  }

  async _promptQuickCreate(cityId) {
    const city = game.journal.get(cityId);
    if (!city) return;

    let kind;
    try {
      kind = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Nuova scheda — ${city.name}` },
        content: `<div class="gm-codex-dialog">
          <label class="gm-codex-dialog-field"><span>Tipo</span>
            <select name="kind">
              <option value="npc">PNG</option>
              <option value="faction">Fazione</option>
              <option value="quest">Missione</option>
            </select>
          </label>
        </div>`,
        ok: { label: "Continua", icon: "fa-solid fa-arrow-right", callback: (_event, button) => button.form.elements.kind.value },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (kind) return this._promptAdd(kind, city.id);
  }

  async _promptCreateJournal() {
    let name;
    try {
      name = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Nuovo Journal Foundry" },
        content: `<div class="gm-codex-dialog">
          <label class="gm-codex-dialog-field"><span>Nome</span><input name="name" type="text" autofocus required></label>
          <p class="gm-codex-dialog-hint">Il Journal viene creato normalmente in Foundry. Potrai poi aggiungerlo al Codex.</p>
        </div>`,
        ok: { label: "Crea", icon: "fa-solid fa-plus", callback: (_event, button) => button.form.elements.name.value.trim() },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!name) return;
    const entry = await foundry.documents.JournalEntry.create({
      name,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      pages: [{
        name: "Pagina 1",
        type: "text",
        text: { content: `<h1>${escapeHTML(name)}</h1><p></p>`, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 }
      }]
    });
    ui.notifications.info(`Journal “${name}” creato.`);
    entry.sheet?.render(true);
    this.render({ force: true });
  }

  async _promptImportJournal(id) {
    const entry = game.journal.get(id);
    if (!entry || entry.getFlag(MODULE_ID, "kind")) return;

    const cities = this._getCities();
    const factions = codexEntries().filter(e => e.getFlag(MODULE_ID, "kind") === "faction").sort((a, b) => a.name.localeCompare(b.name, "it"));

    let result;
    try {
      result = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Aggiungi al Codex — ${entry.name}` },
        content: `<div class="gm-codex-dialog">
          <p class="gm-codex-dialog-hint">Il Journal non viene copiato né spostato: GM Codex userà direttamente questo documento.</p>
          <label class="gm-codex-dialog-field"><span>Tipo</span><select name="kind">
            <option value="city">Città / Area</option>
            <option value="faction">Fazione</option>
            <option value="npc">PNG</option>
            <option value="quest">Missione</option>
            <option value="place">Luogo fuori città</option>
            <option value="encounter">Incontro fuori città</option>
          </select></label>
          <label class="gm-codex-dialog-field"><span>Città collegata <small>(Fazione / PNG / Missione)</small></span>
            <select name="cityId"><option value="">— Nessuna —</option>${cities.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join("")}</select>
          </label>
          <label class="gm-codex-dialog-field"><span>Fazione <small>(solo PNG, opzionale)</small></span>
            <select name="factionId"><option value="">— Nessuna —</option>${factions.map(f => `<option value="${f.id}">${escapeHTML(f.name)}</option>`).join("")}</select>
          </label>
          <label class="gm-codex-dialog-field"><span>Stato <small>(solo Missione)</small></span>
            <select name="status">${Object.entries(QUEST_STATUSES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
          </label>
        </div>`,
        ok: { label: "Aggiungi al Codex", icon: "fa-solid fa-file-import", callback: (_event, button) => ({
          kind: button.form.elements.kind.value,
          cityId: button.form.elements.cityId.value || null,
          factionId: button.form.elements.factionId.value || null,
          status: button.form.elements.status.value || null
        }) },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!result) return;
    if (["faction", "npc", "quest"].includes(result.kind) && !result.cityId) {
      return ui.notifications.warn("Per Fazioni, PNG e Missioni scegli una città collegata.");
    }

    await entry.setFlag(MODULE_ID, "kind", result.kind);
    if (result.cityId) await entry.setFlag(MODULE_ID, "cityId", result.cityId);
    if (result.kind === "npc" && result.factionId) await entry.setFlag(MODULE_ID, "factionId", result.factionId);
    if (result.kind === "quest") await entry.setFlag(MODULE_ID, "status", result.status || "notStarted");

    ui.notifications.info(`“${entry.name}” aggiunto al GM Codex.`);

    if (result.kind === "city") {
      this.selectedCityId = entry.id;
      this.selectedTreeNodeId = null;
      this.section = "city";
      this.searchTerm = "";
    }
    this.render({ force: true });
  }

  async _clearCodexFlags(entry) {
    for (const key of ["kind", "cityId", "factionId", "status", "demo", TREE_FLAG]) {
      if (entry.getFlag(MODULE_ID, key) !== undefined) await entry.unsetFlag(MODULE_ID, key);
    }
  }

  async _unimportJournal(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    const kind = entry.getFlag(MODULE_ID, "kind");
    if (!kind) return;

    const linked = kind === "city"
      ? codexEntries().filter(e => e.id !== entry.id && e.getFlag(MODULE_ID, "cityId") === entry.id)
      : [];

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Rimuovere “${entry.name}” dal Codex?` },
      content: `<p>Il Journal rimarrà in Foundry: verrà rimossa solo la classificazione GM Codex.</p>${linked.length ? `<p>${linked.length} schede collegate verranno anch'esse rimosse dal Codex, senza cancellare i Journal.</p>` : ""}`,
      yes: { label: "Rimuovi dal Codex", icon: "fa-solid fa-link-slash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    if (kind === "city") for (const child of linked) await this._clearCodexFlags(child);
    if (kind === "faction") {
      const npcs = codexEntries().filter(e => e.getFlag(MODULE_ID, "factionId") === entry.id);
      for (const npc of npcs) await npc.unsetFlag(MODULE_ID, "factionId");
    }

    await this._clearCodexFlags(entry);
    if (this.selectedCityId === entry.id) this.selectedCityId = null;
    this.section = "journals";
    this.render({ force: true });
  }

  async _deleteFoundryJournal(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    if (entry.getFlag(MODULE_ID, "kind")) return this._deleteEntry(id);

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Eliminare “${entry.name}”?` },
      content: `<p>Vuoi eliminare definitivamente il Journal Foundry <strong>${escapeHTML(entry.name)}</strong>?</p><p>Questa operazione non può essere annullata.</p>`,
      yes: { label: "Elimina Journal", icon: "fa-solid fa-trash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    await entry.delete();
    ui.notifications.info(`Journal “${entry.name}” eliminato.`);
    this.render({ force: true });
  }

  async _deleteEntry(id) {
    const entry = game.journal.get(id);
    if (!entry) return;

    const kind = entry.getFlag(MODULE_ID, "kind");
    const linked = kind === "city"
      ? codexEntries().filter(e => e.id !== entry.id && e.getFlag(MODULE_ID, "cityId") === entry.id)
      : [];

    const linkedWarning = linked.length
      ? `<p><strong>${linked.length}</strong> schede collegate verranno rimosse dal Codex, ma i loro Journal resteranno in Foundry.</p>`
      : "";

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Eliminare “${entry.name}”?` },
      content: `<p>Vuoi eliminare definitivamente <strong>${escapeHTML(entry.name)}</strong>?</p>${linkedWarning}<p>Il Journal corrispondente verrà eliminato e l'operazione non può essere annullata.</p>`,
      yes: { label: "Elimina", icon: "fa-solid fa-trash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    if (linked.length) {
      for (const child of linked) await this._clearCodexFlags(child);
    }

    if (kind === "faction") {
      const npcs = codexEntries().filter(e => e.getFlag(MODULE_ID, "factionId") === entry.id);
      for (const npc of npcs) await npc.unsetFlag(MODULE_ID, "factionId");
    }

    await entry.delete();

    if (this.selectedCityId === entry.id) this.selectedCityId = null;
    this.selectedTreeNodeId = null;
    this.selectedEntryId = null;

    ui.notifications.info(`“${entry.name}” eliminato.`);
    this.render({ force: true });
  }

  async _showEntry(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    await entry.show(true);
    ui.notifications.info(`“${entry.name}” mostrato ai giocatori.`);
  }

  async _openImage(src, title = "Immagine", uuid = "") {
    if (!src) return;
    const ImagePopout = foundry.applications.apps.ImagePopout;
    const popout = new ImagePopout({
      src,
      uuid: uuid || undefined,
      window: { title: title || "Immagine" }
    });
    await popout.render(true);
  }

  async _toggleShare(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    const ownership = foundry.utils.deepClone(entry.ownership ?? {});
    ownership.default = isShared(entry)
      ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
      : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    await entry.update({ ownership });
    ui.notifications.info(isShared(entry) ? `“${entry.name}” è ora visibile al gruppo.` : `“${entry.name}” è tornato privato per il GM.`);
    this.render({ force: true });
  }

  async _promptAdd(kind, cityId) {
    const factions = kind === "npc" && cityId
      ? codexEntries().filter(e => e.getFlag(MODULE_ID, "kind") === "faction" && e.getFlag(MODULE_ID, "cityId") === cityId)
      : [];

    const factionSelect = factions.length ? `
      <label class="gm-codex-dialog-field"><span>Fazione (opzionale)</span><select name="factionId"><option value="">— Nessuna —</option>${factions.map(f => `<option value="${f.id}">${escapeHTML(f.name)}</option>`).join("")}</select></label>` : "";

    const statusSelect = kind === "quest" ? `
      <label class="gm-codex-dialog-field"><span>Stato</span><select name="status">${Object.entries(QUEST_STATUSES).map(([value, label]) => `<option value="${value}" ${value === "notStarted" ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : "";

    let result;
    try {
      result = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Nuovo: ${KIND_LABELS[kind] ?? "Elemento"}` },
        content: `<div class="gm-codex-dialog">
          <label class="gm-codex-dialog-field"><span>Nome</span><input name="name" type="text" autofocus required></label>
          ${factionSelect}${statusSelect}
        </div>`,
        ok: {
          label: "Crea",
          icon: "fa-solid fa-plus",
          callback: (_event, button) => ({
            name: button.form.elements.name.value.trim(),
            factionId: button.form.elements.factionId?.value || null,
            status: button.form.elements.status?.value || null
          })
        },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!result?.name) return;

    const created = await createCodexEntry({
      name: result.name,
      kind,
      cityId,
      factionId: result.factionId,
      status: result.status
    });

    if (kind === "city") {
      this.selectedCityId = created.id;
      this.selectedTreeNodeId = null;
      this.section = "city";
    } else if (kind === "place" || kind === "encounter") {
      this.section = "outside";
      this.outsideSection = kind;
      this.selectedEntryId = created.id;
    } else {
      this.selectedTreeNodeId = null;
      this.section = "city";
      if (cityId) this.selectedCityId = cityId;
    }

    this.render({ force: true });
  }

  async _changeQuestStatus(id) {
    const entry = game.journal.get(id);
    if (!entry) return;

    let status;
    try {
      status = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Stato missione: ${entry.name}` },
        content: `<select name="status">${Object.entries(QUEST_STATUSES).map(([value, label]) => `<option value="${value}" ${entry.getFlag(MODULE_ID, "status") === value ? "selected" : ""}>${label}</option>`).join("")}</select>`,
        ok: { label: "Salva", callback: (_event, button) => button.form.elements.status.value },
        rejectClose: false,
        modal: true
      });
    } catch { return; }

    if (!status) return;
    await entry.setFlag(MODULE_ID, "status", status);
    this.render({ force: true });
  }

  openCity(cityId) {
    this.selectedCityId = cityId;
    this.selectedTreeNodeId = null;
    this.selectedEntryId = null;
    this.searchTerm = "";
    this.section = "city";
    return this.render({ force: true });
  }

  openJournalManager() {
    this.selectedEntryId = null;
    this.searchTerm = "";
    this.section = "journals";
    return this.render({ force: true });
  }

  // Override build for outside detail after base routing.
  async render(options = {}, _options = {}) {
    return super.render(options, _options);
  }
}

/* Patch the content router for outside entry detail without duplicating app state. */
const _originalBuildHTML = GMCodexApp.prototype._buildHTML;
GMCodexApp.prototype._buildHTML = async function() {
  if (this.section === "outside" && this.selectedEntryId && !this.searchTerm) {
    const entries = codexEntries();
    const cities = this._getCities(entries);
    if (this.selectedCityId && !cities.some(c => c.id === this.selectedCityId)) this.selectedCityId = null;
    if (!this.selectedCityId && cities.length) this.selectedCityId = cities[0].id;

    const sidebar = this._buildSidebar(cities);
    const entry = game.journal.get(this.selectedEntryId);
    const main = entry ? this._buildOutsideDetail(entry) : this._buildOutside(entries);

    return `
      <aside class="gm-codex-sidebar">
        <div class="gm-codex-brand"><i class="fa-solid fa-book-open"></i><div><strong>GM Codex</strong><span>Manuale del GM</span></div></div>
        ${sidebar}
      </aside>
      <main class="gm-codex-main">
        <header class="gm-codex-topbar">
          <div class="gm-codex-search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-action="search" value="" placeholder="Cerca fuori città..."></div>
          <button type="button" class="gm-codex-ghost" data-action="journals"><i class="fa-solid fa-book"></i> Journal Foundry</button>
        </header>
        <section class="gm-codex-content">${main}</section>
      </main>`;
  }
  return _originalBuildHTML.call(this);
};

let codexApp;

function getCodexApp() {
  if (!codexApp) codexApp = new GMCodexApp();
  return codexApp;
}

function openCodex() {
  if (!game.user.isGM) return ui.notifications.warn("GM Codex è disponibile al Game Master.");
  return getCodexApp().render({ force: true });
}

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: openCodex,
    createEntry: createCodexEntry
  };
  console.log(`${MODULE_ID} | Ready`);
});

/* -------------------------------------------------------------------------- */
/*                           Dedicated sidebar tab                            */
/* -------------------------------------------------------------------------- */

class GMCodexSidebarTab extends foundry.applications.sidebar.AbstractSidebarTab {
  static tabName = "gmcodex";

  static DEFAULT_OPTIONS = {
    id: "gm-codex-sidebar-tab",
    classes: ["gm-codex-sidebar-tab"],
    window: { title: "GM Codex" }
  };

  get tabName() { return "gmcodex"; }

  async _renderHTML(_context, _options) {
    const root = document.createElement("section");
    root.className = "gm-codex-sidebar-launcher";
    const cities = codexEntries()
      .filter(e => e.getFlag(MODULE_ID, "kind") === "city")
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    root.innerHTML = `
      <div class="gm-codex-sidebar-launcher-head">
        <i class="fa-solid fa-book-open"></i>
        <div><strong>GM Codex</strong><span>Manuale del GM</span></div>
      </div>
      <button type="button" class="gm-codex-sidebar-open" data-action="open-codex"><i class="fa-solid fa-up-right-from-square"></i> Apri GM Codex</button>

      <div class="gm-codex-sidebar-launcher-label">CITTÀ / AREE</div>
      <div class="gm-codex-sidebar-launcher-cities">
        ${cities.length
          ? cities.map(city => `<button type="button" data-action="open-city" data-id="${city.id}"><i class="fa-solid fa-city"></i><span>${escapeHTML(city.name)}</span></button>`).join("")
          : "<p>Nessuna città nel Codex.</p>"}
      </div>

      <div class="gm-codex-sidebar-launcher-label">ARCHIVIO</div>
      <button type="button" class="gm-codex-sidebar-archive" data-action="open-journals"><i class="fa-solid fa-book"></i> Journal Foundry</button>`;

    return root;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element?.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", event => {
      const target = event.currentTarget;
      if (target.dataset.action === "open-codex") return openCodex();
      if (target.dataset.action === "open-city") return getCodexApp().openCity(target.dataset.id);
      if (target.dataset.action === "open-journals") return getCodexApp().openJournalManager();
    }));
  }
}

Hooks.once("init", () => {
  CONFIG.ui.gmcodex = GMCodexSidebarTab;
  CONFIG.ui.sidebar.TABS.gmcodex = {
    icon: "fa-solid fa-book-open",
    tooltip: "GM Codex",
    gmOnly: true
  };
});

for (const hook of [
  "createJournalEntry",
  "updateJournalEntry",
  "deleteJournalEntry",
  "createJournalEntryPage",
  "updateJournalEntryPage",
  "deleteJournalEntryPage"
]) {
  Hooks.on(hook, () => {
    if (codexApp?.rendered) codexApp.render();
    if (ui.sidebar?.rendered) ui.sidebar.render();
  });
}
