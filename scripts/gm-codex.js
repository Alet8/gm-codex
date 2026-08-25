const MODULE_ID = "gm-codex";
const ROOT_FOLDER_NAME = "GM Codex";

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
  return (div.textContent || div.innerText || "").trim();
}

function truncate(text = "", max = 180) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function codexEntries() {
  return game.journal.contents.filter(j => Boolean(j.getFlag(MODULE_ID, "kind")));
}

function getEntryContent(entry) {
  const pages = entry?.pages?.contents ?? Array.from(entry?.pages ?? []);
  return pages
    .filter(page => page.type === "text")
    .map(page => page.text?.content ?? "")
    .join("\n");
}

function decorateTextImages(html = "", entry, page) {
  const container = document.createElement("div");
  container.innerHTML = html;

  for (const image of container.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (!src) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gm-codex-image-share";
    button.dataset.action = "show-image";
    button.dataset.src = src;
    button.dataset.title = image.getAttribute("alt") || page?.name || entry?.name || "Immagine";
    button.dataset.uuid = page?.uuid || entry?.uuid || "";
    button.innerHTML = '<i class="fa-solid fa-eye"></i> Mostra ai giocatori';

    const anchor = image.closest("a");
    const target = anchor ?? image;
    target.insertAdjacentElement("afterend", button);
  }

  return container.innerHTML;
}

function isShared(entry) {
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  return (entry.ownership?.default ?? 0) >= observer;
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
      return `<h1>${safe}</h1><p><em>Panoramica della città.</em></p><h2>Descrizione</h2><p></p><h2>Situazione attuale</h2><p></p><h2>Luoghi importanti</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "faction":
      return `<h1>${safe}</h1><p><em>Fazione.</em></p><h2>Descrizione</h2><p></p><h2>Obiettivi</h2><p></p><h2>Persone importanti</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "npc":
      return `<h1>${safe}</h1><p><em>Personaggio non giocante.</em></p><h2>Aspetto</h2><p></p><h2>Personalità</h2><p></p><h2>Obiettivi</h2><p></p><h2>Informazioni riservate</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "quest":
      return `<h1>${safe}</h1><p><em>Missione.</em></p><h2>Premessa</h2><p></p><h2>Sviluppi</h2><p></p><h2>Indizi</h2><p></p><h2>PNG coinvolti</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "place":
      return `<h1>${safe}</h1><p><em>Luogo fuori città.</em></p><h2>Descrizione</h2><p></p><h2>Dettagli utili</h2><p></p><h2>Note del GM</h2><p></p>`;
    case "encounter":
      return `<h1>${safe}</h1><p><em>Incontro fuori città.</em></p><h2>Situazione</h2><p></p><h2>Partecipanti</h2><p></p><h2>Sviluppi possibili</h2><p></p><h2>Note del GM</h2><p></p>`;
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

  return foundry.documents.JournalEntry.create({
    name,
    folder: folder.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [MODULE_ID]: flags },
    pages: [{
      name: "Scheda",
      type: "text",
      text: {
        content: content ?? defaultContent(kind, name),
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
      }
    }]
  });
}

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
      width: 980,
      height: 700
    }
  };

  constructor(options = {}) {
    super(options);
    this.selectedCityId = null;
    this.section = "overview";
    this.outsideSection = "place";
    this.selectedEntryId = null;
    this.selectedCityPageId = null;
    this.searchTerm = "";
  }

  async _renderHTML(_context, _options) {
    const root = document.createElement("div");
    root.className = "gm-codex-shell";
    root.innerHTML = await this.#buildHTML();
    return root;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#bindListeners();
    if (this.searchTerm) {
      const search = this.element?.querySelector('[data-action="search"]');
      if (search) {
        search.focus();
        const end = search.value.length;
        search.setSelectionRange?.(end, end);
      }
    }
  }

  async #buildHTML() {
    const entries = codexEntries();
    const cities = entries
      .filter(e => e.getFlag(MODULE_ID, "kind") === "city")
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    if (this.selectedCityId && !cities.some(c => c.id === this.selectedCityId)) {
      this.selectedCityId = null;
    }
    if (!this.selectedCityId && cities.length) this.selectedCityId = cities[0].id;

    const sidebar = this.#buildSidebar(cities);
    const main = this.searchTerm.trim()
      ? this.#buildSearchResults(entries)
      : await this.#buildMain(entries, cities);

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
            <input type="search" data-action="search" value="${escapeHTML(this.searchTerm)}" placeholder="Cerca città, PNG, missioni, testo...">
            ${this.searchTerm ? '<button type="button" class="icon-btn" data-action="clear-search" title="Pulisci ricerca"><i class="fa-solid fa-xmark"></i></button>' : ""}
          </div>
          <button type="button" class="gm-codex-ghost" data-action="demo" title="Crea alcuni dati demo di Vercelli"><i class="fa-solid fa-flask"></i> Demo</button>
        </header>
        <section class="gm-codex-content">${main}</section>
      </main>`;
  }

  #buildSidebar(cities) {
    const cityButtons = cities.length
      ? cities.map(city => `
          <button type="button" class="gm-codex-nav ${this.selectedCityId === city.id && this.section !== "outside" ? "active" : ""}" data-action="select-city" data-id="${city.id}">
            <i class="fa-solid fa-city"></i><span>${escapeHTML(city.name)}</span>
          </button>`).join("")
      : '<div class="gm-codex-empty-mini">Nessuna città</div>';

    return `
      <div class="gm-codex-sidebar-head"><span>CITTÀ</span><button type="button" class="icon-btn" data-action="add" data-kind="city" title="Nuova città"><i class="fa-solid fa-plus"></i></button></div>
      <nav class="gm-codex-city-list">${cityButtons}</nav>
      <div class="gm-codex-sidebar-head outside-head"><span>FUORI CITTÀ</span></div>
      <nav>
        <button type="button" class="gm-codex-nav ${this.section === "outside" && this.outsideSection === "place" ? "active" : ""}" data-action="outside" data-kind="place"><i class="fa-solid fa-location-dot"></i><span>Luoghi</span></button>
        <button type="button" class="gm-codex-nav ${this.section === "outside" && this.outsideSection === "encounter" ? "active" : ""}" data-action="outside" data-kind="encounter"><i class="fa-solid fa-shield-halved"></i><span>Incontri</span></button>
      </nav>`;
  }

  async #buildMain(entries, cities) {
    if (this.selectedEntryId) {
      const entry = entries.find(e => e.id === this.selectedEntryId);
      if (entry) return this.#buildDetail(entry);
      this.selectedEntryId = null;
    }

    if (this.section === "outside") return this.#buildOutside(entries);

    if (!cities.length) {
      return `
        <div class="gm-codex-welcome">
          <i class="fa-solid fa-book-open-reader"></i>
          <h2>Il tuo Codex è vuoto</h2>
          <p>Crea la prima città oppure usa il pulsante <strong>Demo</strong> per provare subito l'interfaccia.</p>
          <button type="button" class="gm-codex-primary" data-action="add" data-kind="city"><i class="fa-solid fa-plus"></i> Crea la prima città</button>
        </div>`;
    }

    const city = cities.find(c => c.id === this.selectedCityId) ?? cities[0];
    const tabs = [
      ["overview", "Pagine città", "fa-solid fa-book-open"],
      ["faction", "Fazioni", "fa-solid fa-flag"],
      ["npc", "PNG", "fa-solid fa-user"],
      ["quest", "Missioni", "fa-solid fa-scroll"]
    ];

    const tabHTML = tabs.map(([key, label, icon]) => `
      <button type="button" data-action="section" data-section="${key}" class="gm-codex-tab ${this.section === key ? "active" : ""}">
        <i class="${icon}"></i>${label}
      </button>`).join("");

    let body = "";
    if (this.section === "overview") {
      body = this.#renderCityOverview(city);
    } else {
      const items = entries
        .filter(e => e.getFlag(MODULE_ID, "kind") === this.section && e.getFlag(MODULE_ID, "cityId") === city.id)
        .sort((a, b) => a.name.localeCompare(b.name, "it"));
      body = this.#buildList(items, this.section, city.id);
    }

    return `
      <div class="gm-codex-section-header">
        <div><span class="eyebrow">CITTÀ</span><h1>${escapeHTML(city.name)}</h1></div>
      </div>
      <nav class="gm-codex-tabs">${tabHTML}</nav>
      <div class="gm-codex-section-body">${body}</div>`;
  }

  #renderPage(entry, page) {
    if (!page) return '<div class="gm-codex-empty-list"><i class="fa-solid fa-file-circle-question"></i><p>Nessuna pagina disponibile.</p></div>';

    const pageTitle = escapeHTML(page.name || "Pagina");
    const pageLabel = entry.getFlag(MODULE_ID, "kind") === "city" ? "PAGINA DELLA CITTÀ" : "PAGINA DELLA SCHEDA";
    let content = "";

    if (page.type === "text") {
      content = `<section class="gm-codex-page gm-codex-readable" data-page-id="${page.id}">${decorateTextImages(page.text?.content || "<p><em>Pagina vuota.</em></p>", entry, page)}</section>`;
    } else if (page.type === "image" && page.src) {
      content = `
        <section class="gm-codex-page image-page" data-page-id="${page.id}">
          <img src="${escapeHTML(page.src)}" alt="${pageTitle}">
          <button type="button" class="gm-codex-image-share standalone" data-action="show-image" data-src="${escapeHTML(page.src)}" data-title="${pageTitle}" data-uuid="${escapeHTML(page.uuid || entry.uuid || "")}"><i class="fa-solid fa-eye"></i> Mostra ai giocatori</button>
        </section>`;
    } else {
      content = `<section class="gm-codex-page unsupported" data-page-id="${page.id}"><em>Pagina “${pageTitle}” apribile dal Journal originale.</em></section>`;
    }

    return `
      <div class="gm-codex-city-page-head">
        <div><span class="eyebrow">${pageLabel}</span><h2>${pageTitle}</h2></div>
      </div>
      ${content}`;
  }

  #renderPages(entry) {
    const pages = entry.pages?.contents ?? Array.from(entry.pages ?? []);
    return `<div class="gm-codex-pages gm-codex-pages-scroll">${pages.map(page => this.#renderPage(entry, page)).join("") || '<p><em>Nessuna pagina.</em></p>'}</div>`;
  }

  #renderCityOverview(city) {
    const pages = city.pages?.contents ?? Array.from(city.pages ?? []);
    if (this.selectedCityPageId && !pages.some(page => page.id === this.selectedCityPageId)) this.selectedCityPageId = null;
    const selectedPage = pages.find(page => page.id === this.selectedCityPageId) ?? pages[0] ?? null;
    if (selectedPage) this.selectedCityPageId = selectedPage.id;

    const pageNav = pages.length
      ? pages.map(page => {
          const icon = page.type === "image" ? "fa-solid fa-image" : page.type === "text" ? "fa-solid fa-file-lines" : "fa-solid fa-file";
          const active = selectedPage?.id === page.id ? "active" : "";
          return `<button type="button" class="gm-codex-city-page-tab ${active}" data-action="select-city-page" data-page-id="${page.id}"><i class="${icon}"></i><span>${escapeHTML(page.name || "Pagina")}</span></button>`;
        }).join("")
      : '<div class="gm-codex-empty-mini">Nessuna pagina nel Journal della città.</div>';

    return `
      <div class="gm-codex-detail-actions compact">
        <button type="button" class="gm-codex-primary" data-action="open-journal" data-id="${city.id}"><i class="fa-solid fa-pen-to-square"></i> Modifica</button>
        <button type="button" class="gm-codex-secondary" data-action="show" data-id="${city.id}"><i class="fa-solid fa-eye"></i> Mostra città</button>
        <button type="button" class="gm-codex-secondary" data-action="share" data-id="${city.id}"><i class="fa-solid ${isShared(city) ? "fa-unlock" : "fa-lock"}"></i> ${isShared(city) ? "Visibile al gruppo" : "Solo GM"}</button>
        <button type="button" class="gm-codex-danger" data-action="delete" data-id="${city.id}"><i class="fa-solid fa-trash"></i> Elimina</button>
      </div>
      <div class="gm-codex-city-pages-index">
        <div class="gm-codex-city-pages-label"><i class="fa-solid fa-layer-group"></i> Pagine della città</div>
        <nav class="gm-codex-city-page-tabs">${pageNav}</nav>
      </div>
      <div class="gm-codex-selected-city-page">${this.#renderPage(city, selectedPage)}</div>`;
  }

  #buildList(items, kind, cityId = null) {
    const label = KIND_LABELS[kind] ?? "Elemento";
    const icon = KIND_ICONS[kind] ?? "fa-solid fa-file";
    const cards = items.length
      ? items.map(entry => this.#entryCard(entry)).join("")
      : `<div class="gm-codex-empty-list"><i class="${icon}"></i><p>Nessun ${label.toLowerCase()} ancora.</p></div>`;

    return `
      <div class="gm-codex-list-toolbar">
        <span>${items.length} ${items.length === 1 ? "voce" : "voci"}</span>
        <button type="button" class="gm-codex-primary" data-action="add" data-kind="${kind}" ${cityId ? `data-city-id="${cityId}"` : ""}><i class="fa-solid fa-plus"></i> Nuovo</button>
      </div>
      <div class="gm-codex-cards">${cards}</div>`;
  }

  #entryCard(entry) {
    const kind = entry.getFlag(MODULE_ID, "kind");
    const raw = stripHTML(getEntryContent(entry));
    const status = kind === "quest" ? entry.getFlag(MODULE_ID, "status") : null;
    const statusHTML = status ? `<span class="status status-${escapeHTML(status)}">${escapeHTML(QUEST_STATUSES[status] ?? status)}</span>` : "";
    return `
      <button type="button" class="gm-codex-card" data-action="detail" data-id="${entry.id}">
        <div class="gm-codex-card-icon"><i class="${KIND_ICONS[kind] ?? "fa-solid fa-file"}"></i></div>
        <div class="gm-codex-card-copy">
          <div class="gm-codex-card-title"><strong>${escapeHTML(entry.name)}</strong>${statusHTML}</div>
          <p>${escapeHTML(truncate(raw.replace(entry.name, "").trim() || "Apri la scheda per aggiungere contenuti."))}</p>
        </div>
        <div class="gm-codex-card-meta"><i class="fa-solid ${isShared(entry) ? "fa-unlock" : "fa-lock"}" title="${isShared(entry) ? "Visibile al gruppo" : "Solo GM"}"></i><i class="fa-solid fa-chevron-right"></i></div>
      </button>`;
  }

  #buildOutside(entries) {
    const kind = this.outsideSection;
    const label = kind === "place" ? "Luoghi fuori città" : "Incontri fuori città";
    const items = entries
      .filter(e => e.getFlag(MODULE_ID, "kind") === kind && !e.getFlag(MODULE_ID, "cityId"))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    return `
      <div class="gm-codex-section-header"><div><span class="eyebrow">FUORI CITTÀ</span><h1>${label}</h1></div></div>
      <div class="gm-codex-section-body">${this.#buildList(items, kind)}</div>`;
  }

  #buildSearchResults(entries) {
    const q = this.searchTerm.toLocaleLowerCase("it").trim();
    const matches = entries.filter(entry => {
      const meta = [
        entry.name,
        KIND_LABELS[entry.getFlag(MODULE_ID, "kind")],
        QUEST_STATUSES[entry.getFlag(MODULE_ID, "status")],
        stripHTML(getEntryContent(entry))
      ].filter(Boolean).join(" ").toLocaleLowerCase("it");
      return meta.includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name, "it"));

    return `
      <div class="gm-codex-section-header"><div><span class="eyebrow">RICERCA</span><h1>“${escapeHTML(this.searchTerm)}”</h1></div></div>
      <div class="gm-codex-list-toolbar"><span>${matches.length} ${matches.length === 1 ? "risultato" : "risultati"}</span></div>
      <div class="gm-codex-cards">${matches.length ? matches.map(e => this.#entryCard(e)).join("") : '<div class="gm-codex-empty-list"><i class="fa-solid fa-magnifying-glass"></i><p>Nessun risultato.</p></div>'}</div>`;
  }

  #buildDetail(entry) {
    const kind = entry.getFlag(MODULE_ID, "kind");
    const status = kind === "quest" ? entry.getFlag(MODULE_ID, "status") : null;
    return `
      <div class="gm-codex-detail-head">
        <button type="button" class="gm-codex-back" data-action="back"><i class="fa-solid fa-arrow-left"></i> Indietro</button>
        <div class="gm-codex-detail-title"><span class="eyebrow">${escapeHTML(KIND_LABELS[kind] ?? "SCHEDA")}</span><h1>${escapeHTML(entry.name)}</h1>${status ? `<span class="status status-${escapeHTML(status)}">${escapeHTML(QUEST_STATUSES[status] ?? status)}</span>` : ""}</div>
      </div>
      <div class="gm-codex-detail-actions">
        <button type="button" class="gm-codex-primary" data-action="open-journal" data-id="${entry.id}"><i class="fa-solid fa-pen-to-square"></i> Modifica scheda</button>
        <button type="button" class="gm-codex-secondary" data-action="show" data-id="${entry.id}"><i class="fa-solid fa-eye"></i> Mostra ora</button>
        <button type="button" class="gm-codex-secondary" data-action="share" data-id="${entry.id}"><i class="fa-solid ${isShared(entry) ? "fa-unlock" : "fa-lock"}"></i> ${isShared(entry) ? "Visibile al gruppo" : "Solo GM"}</button>
        ${kind === "quest" ? `<button type="button" class="gm-codex-secondary" data-action="quest-status" data-id="${entry.id}"><i class="fa-solid fa-list-check"></i> Stato</button>` : ""}
        <button type="button" class="gm-codex-danger" data-action="delete" data-id="${entry.id}"><i class="fa-solid fa-trash"></i> Elimina</button>
      </div>
      ${this.#renderPages(entry)}`;
  }

  #bindListeners() {
    const root = this.element;
    if (!root) return;

    root.querySelectorAll("[data-action]").forEach(el => {
      const action = el.dataset.action;
      if (action === "search") {
        el.addEventListener("input", event => {
          this.searchTerm = event.currentTarget.value;
          clearTimeout(this._searchTimer);
          this._searchTimer = setTimeout(() => this.render(), 180);
        });
        return;
      }
      el.addEventListener("click", event => this.#handleAction(event));
    });
  }

  async #handleAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;

    switch (action) {
      case "select-city":
        this.selectedCityId = target.dataset.id;
        this.section = "overview";
        this.selectedEntryId = null;
        this.selectedCityPageId = null;
        this.searchTerm = "";
        return this.render();
      case "section":
        this.section = target.dataset.section;
        this.selectedEntryId = null;
        return this.render();
      case "select-city-page":
        this.selectedCityPageId = target.dataset.pageId || null;
        return this.render();
      case "outside":
        this.section = "outside";
        this.outsideSection = target.dataset.kind;
        this.selectedEntryId = null;
        this.searchTerm = "";
        return this.render();
      case "detail":
        this.selectedEntryId = target.dataset.id;
        return this.render();
      case "back":
        this.selectedEntryId = null;
        return this.render();
      case "clear-search":
        this.searchTerm = "";
        return this.render();
      case "open-journal":
        return this.#openJournal(target.dataset.id);
      case "show":
        return this.#showEntry(target.dataset.id);
      case "show-image":
        return this.#showImage(target.dataset.src, target.dataset.title, target.dataset.uuid);
      case "share":
        return this.#toggleShare(target.dataset.id);
      case "delete":
        return this.#deleteEntry(target.dataset.id);
      case "quest-status":
        return this.#changeQuestStatus(target.dataset.id);
      case "add":
        return this.#promptAdd(target.dataset.kind, target.dataset.cityId || null);
      case "demo":
        return this.#createDemo();
    }
  }

  #openJournal(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    entry.sheet?.render(true);
  }

  async #showEntry(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    await entry.show(true);
    ui.notifications.info(`“${entry.name}” mostrato ai giocatori.`);
  }

  async #showImage(src, title = "Immagine", uuid = "") {
    if (!src) return;
    const ImagePopout = foundry.applications.apps.ImagePopout;
    const popout = new ImagePopout({
      src,
      uuid: uuid || undefined,
      window: { title: title || "Immagine" }
    });
    await popout.render(true);
    popout.shareImage();
    ui.notifications.info(`Immagine “${title || "Immagine"}” mostrata ai giocatori.`);
  }

  async #toggleShare(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    const ownership = foundry.utils.deepClone(entry.ownership ?? {});
    ownership.default = isShared(entry)
      ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
      : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    await entry.update({ ownership });
    ui.notifications.info(isShared(entry) ? `“${entry.name}” è ora visibile al gruppo.` : `“${entry.name}” è tornato privato per il GM.`);
    this.render();
  }

  async #deleteEntry(id) {
    if (!game.user.isGM) return;
    const entry = game.journal.get(id);
    if (!entry) return;

    const kind = entry.getFlag(MODULE_ID, "kind");
    const linked = kind === "city"
      ? codexEntries().filter(e => e.id !== entry.id && e.getFlag(MODULE_ID, "cityId") === entry.id)
      : [];

    const linkedWarning = linked.length
      ? `<p><strong>Attenzione:</strong> questa città contiene anche <strong>${linked.length}</strong> ${linked.length === 1 ? "scheda collegata" : "schede collegate"} (fazioni, PNG o missioni). Eliminando la città verranno eliminate anche queste schede, per evitare contenuti orfani.</p>`
      : "";

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Eliminare “${entry.name}”?` },
      content: `<p>Vuoi eliminare definitivamente <strong>${escapeHTML(entry.name)}</strong> dal GM Codex?</p>${linkedWarning}<p>Questa operazione elimina i relativi Journal di Foundry e non può essere annullata.</p>`,
      yes: { label: "Elimina", icon: "fa-solid fa-trash" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    if (linked.length) {
      await JournalEntry.deleteDocuments(linked.map(e => e.id));
    }

    if (kind === "faction") {
      const linkedNpcs = codexEntries().filter(e => e.getFlag(MODULE_ID, "factionId") === entry.id);
      for (const npc of linkedNpcs) await npc.unsetFlag(MODULE_ID, "factionId");
    }

    await entry.delete();

    if (this.selectedEntryId === entry.id) this.selectedEntryId = null;
    if (kind === "city" && this.selectedCityId === entry.id) {
      this.selectedCityId = null;
      this.selectedCityPageId = null;
    }

    ui.notifications.info(`“${entry.name}” eliminato dal GM Codex.`);
    this.render();
  }

  async #promptAdd(kind, cityId) {
    if (!game.user.isGM) return;
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
        content: `<div class="gm-codex-dialog"><label class="gm-codex-dialog-field"><span>Nome</span><input name="name" type="text" autofocus required></label>${factionSelect}${statusSelect}</div>`,
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
    } catch {
      return;
    }
    if (!result?.name) return ui.notifications.warn("Inserisci un nome.");

    const created = await createCodexEntry({
      name: result.name,
      kind,
      cityId,
      factionId: result.factionId,
      status: result.status
    });

    if (kind === "city") {
      this.selectedCityId = created.id;
      this.selectedCityPageId = null;
      this.section = "overview";
    } else if (kind === "place" || kind === "encounter") {
      this.section = "outside";
      this.outsideSection = kind;
    } else {
      this.section = kind;
    }
    this.selectedEntryId = created.id;
    this.render();
  }

  async #changeQuestStatus(id) {
    const entry = game.journal.get(id);
    if (!entry) return;
    let status;
    try {
      status = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Stato missione: ${entry.name}` },
        content: `<select name="status">${Object.entries(QUEST_STATUSES).map(([value, label]) => `<option value="${value}" ${entry.getFlag(MODULE_ID, "status") === value ? "selected" : ""}>${label}</option>`).join("")}</select>`,
        ok: {
          label: "Salva",
          callback: (_event, button) => button.form.elements.status.value
        },
        rejectClose: false,
        modal: true
      });
    } catch {
      return;
    }
    if (!status) return;
    await entry.setFlag(MODULE_ID, "status", status);
    this.render();
  }

  async #createDemo() {
    const existingDemo = codexEntries().find(e => e.getFlag(MODULE_ID, "demo") === true);
    if (existingDemo) return ui.notifications.info("I dati demo sono già presenti.");

    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Creare dati demo?" },
      content: "<p>Verranno creati alcuni Journal di prova per mostrare città, fazioni, PNG, missioni e incontri. Potrai modificarli o eliminarli normalmente dalla sezione Journal.</p>",
      yes: { label: "Crea demo" },
      no: { label: "Annulla" },
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;

    const city = await createCodexEntry({
      name: "Vercelli 1279",
      kind: "city",
      content: "<h1>Vercelli 1279</h1><p>Città comunale dell'Italia settentrionale. Questa è una scheda dimostrativa: premi <strong>Modifica</strong> per sostituire il testo, aggiungere immagini e creare nuove pagine.</p><h2>Situazione attuale</h2><p>Le famiglie cittadine competono per influenza, denaro e controllo degli atti notarili.</p><h2>Note del GM</h2><p>Questa pagina è privata finché non decidi di condividerla.</p>"
    });
    await city.setFlag(MODULE_ID, "demo", true);

    const faction = await createCodexEntry({
      name: "Famiglia Bicchieri",
      kind: "faction",
      cityId: city.id,
      content: "<h1>Famiglia Bicchieri</h1><p>Fazione dimostrativa collegata a Vercelli.</p><h2>Obiettivi</h2><p>Ampliare la propria influenza politica ed economica.</p>"
    });
    await faction.setFlag(MODULE_ID, "demo", true);

    const npc = await createCodexEntry({
      name: "Donna Adelaide Bicchieri",
      kind: "npc",
      cityId: city.id,
      factionId: faction.id,
      content: "<h1>Donna Adelaide Bicchieri</h1><p>PNG dimostrativo.</p><h2>Personalità</h2><p>Misurata, autorevole e abituata a ottenere risultati attraverso intermediari.</p><h2>Note del GM</h2><p>Aggiungi qui segreti, immagini, collegamenti e appunti di sessione.</p>"
    });
    await npc.setFlag(MODULE_ID, "demo", true);

    const quest = await createCodexEntry({
      name: "Il Podere delle Tre Noci",
      kind: "quest",
      cityId: city.id,
      status: "active",
      content: "<h1>Il Podere delle Tre Noci</h1><p>Missione dimostrativa.</p><h2>Premessa</h2><p>Un atto notarile e una tenuta contesa collegano più interessi cittadini.</p><h2>Indizi</h2><p>Usa questa sezione per gli indizi già scoperti o ancora nascosti.</p>"
    });
    await quest.setFlag(MODULE_ID, "demo", true);

    const encounter = await createCodexEntry({
      name: "Sgherri sulla strada",
      kind: "encounter",
      content: "<h1>Sgherri sulla strada</h1><p>Incontro dimostrativo fuori città.</p><h2>Situazione</h2><p>Un piccolo gruppo di uomini armati blocca il passaggio e cerca qualcuno.</p><h2>Note del GM</h2><p>Puoi aggiungere qui statistiche, link agli Actor e immagini.</p>"
    });
    await encounter.setFlag(MODULE_ID, "demo", true);

    this.selectedCityId = city.id;
    this.selectedCityPageId = null;
    this.section = "overview";
    this.selectedEntryId = null;
    this.searchTerm = "";
    ui.notifications.info("Dati demo creati.");
    this.render();
  }
}

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

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const group = controls.notes ?? controls.tokens;
  if (!group?.tools) return;

  group.tools.gmCodex = {
    name: "gmCodex",
    title: "Apri GM Codex",
    icon: "fa-solid fa-book-open",
    order: Object.keys(group.tools).length,
    button: true,
    visible: true,
    onChange: () => openCodex()
  };
});

for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hook, () => {
    if (codexApp?.rendered) codexApp.render();
  });
}
