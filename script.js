const STORAGE_KEY = "general-jus-stream-sessions";
const SETTINGS_KEY = "general-jus-calendar-settings";
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const MAX_IMAGE_SIZE = 1180;
const MAX_IMAGE_DATA_LENGTH = 560000;
const IMAGE_QUALITY = 0.86;

const dayOptions = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const themeAccents = {
  twitch: "#8d2cff",
  void: "#b026ff",
  royal: "#6f35ff",
};
const layoutProfiles = [
  { max: 3, density: "roomy", layout: "single", columns: 1 },
  { max: 5, density: "normal", layout: "single", columns: 1 },
  { max: 7, density: "compact", layout: "single", columns: 1 },
  { max: 10, density: "dense", layout: "grid", columns: 2 },
  { max: Infinity, density: "ultra", layout: "grid", columns: 2 },
];

const elements = {
  form: document.querySelector("#sessionForm"),
  editingId: document.querySelector("#editingId"),
  date: document.querySelector("#dateInput"),
  dayPicker: document.querySelector("#dayPicker"),
  dayButtons: [...document.querySelectorAll(".day-button")],
  time: document.querySelector("#timeInput"),
  game: document.querySelector("#gameInput"),
  title: document.querySelector("#titleInput"),
  imageInput: document.querySelector("#imageInput"),
  imageDropZone: document.querySelector("#imageDropZone"),
  imageUploadPreview: document.querySelector("#imageUploadPreview"),
  imageUploadLabel: document.querySelector("#imageUploadLabel"),
  imageUploadHint: document.querySelector("#imageUploadHint"),
  removeImage: document.querySelector("#removeImageBtn"),
  submit: document.querySelector("#submitSessionBtn"),
  cancelEdit: document.querySelector("#cancelEditBtn"),
  sortSessions: document.querySelector("#sortSessionsBtn"),
  clearSessions: document.querySelector("#clearSessionsBtn"),
  sessionList: document.querySelector("#sessionList"),
  sessionCount: document.querySelector("#sessionCount"),
  preview: document.querySelector("#calendarPreview"),
  previewList: document.querySelector("#previewList"),
  generateButtons: [
    document.querySelector("#generateImageBtn"),
    document.querySelector("#generateImageSideBtn"),
    document.querySelector("#exportNavBtn"),
  ],
  focusPreview: document.querySelector("#focusPreviewBtn"),
  accentColor: document.querySelector("#accentColorInput"),
  theme: document.querySelector("#themeSelect"),
  timezone: document.querySelector("#timezoneToggle"),
};

let sessions = [];
let selectedDay = "Ven";
let draggedSessionId = null;
let toastTimer = null;
let storageWarningShown = false;
let selectedImage = "";
let imageProcessing = false;

init();

function init() {
  loadSettings();
  loadSessions();
  seedFormDefaults();
  bindEvents();
  render();
}

function bindEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.cancelEdit.addEventListener("click", resetEditingState);
  elements.sortSessions?.addEventListener("click", sortSessionsByDate);
  elements.clearSessions?.addEventListener("click", clearSessions);

  elements.date.addEventListener("change", () => {
    if (!elements.date.value) return;

    const day = getDayFromDate(elements.date.value);
    if (day) {
      selectDay(day);
    } else {
      showToast("La date choisie n'est pas valide.");
    }
  });

  elements.dayPicker.addEventListener("click", (event) => {
    const button = event.target.closest(".day-button");
    if (!button) return;
    if (isValidDayValue(button.dataset.day)) {
      selectDay(button.dataset.day);
    }
  });

  elements.sessionList.addEventListener("click", handleSessionAction);
  elements.sessionList.addEventListener("dragstart", handleDragStart);
  elements.sessionList.addEventListener("dragover", handleDragOver);
  elements.sessionList.addEventListener("drop", handleDrop);
  elements.sessionList.addEventListener("dragend", handleDragEnd);
  elements.sessionList.addEventListener("keydown", handleSessionKeyboard);

  elements.imageDropZone.addEventListener("click", () => elements.imageInput.click());
  elements.imageDropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    elements.imageInput.click();
  });
  elements.imageInput.addEventListener("change", () => {
    handleImageFile(elements.imageInput.files?.[0]);
  });
  elements.removeImage.addEventListener("click", () => {
    setSelectedImage("");
    showToast("Image retirée de la session.");
  });

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    elements.imageDropZone.addEventListener(eventName, handleImageDrag);
  });
  elements.imageDropZone.addEventListener("drop", (event) => {
    handleImageFile(event.dataTransfer.files?.[0]);
  });

  elements.generateButtons.forEach((button) => {
    button?.addEventListener("click", generateImage);
  });

  elements.focusPreview.addEventListener("click", () => {
    document.body.classList.toggle("preview-focus");
  });

  elements.accentColor.addEventListener("input", () => {
    setAccent(elements.accentColor.value);
    saveSettings();
  });

  elements.theme.addEventListener("change", () => {
    const color = themeAccents[elements.theme.value] || themeAccents.twitch;
    elements.accentColor.value = color;
    setAccent(color);
    saveSettings();
  });

  elements.timezone.addEventListener("change", () => {
    saveSettings();
    renderPreview();
  });
}

function seedFormDefaults() {
  const today = new Date();
  elements.date.value = toInputDate(today);
  elements.time.value = "20:00";
  selectDay(dayLabels[today.getDay()]);
}

function handleFormSubmit(event) {
  event.preventDefault();

  const payload = getFormPayload();
  if (!payload) {
    return;
  }

  const existingId = elements.editingId.value;

  if (existingId) {
    const sessionIndex = sessions.findIndex((session) => session.id === existingId);
    if (sessionIndex < 0) {
      resetEditingState();
      showToast("Cette session n'existe plus. Vous pouvez l'ajouter à nouveau.");
      return;
    }

    sessions[sessionIndex] = { ...sessions[sessionIndex], ...payload };
    showToast("Session mise à jour.");
  } else {
    sessions.push({
      id: createId(),
      ...payload,
      createdAt: Date.now(),
    });
    showToast("Session ajoutée au planning.");
  }

  saveSessions();
  render();
  resetFormAfterSubmit();
}

function handleSessionAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest(".session-card");
  const session = sessions.find((item) => item.id === card?.dataset.id);
  if (!session) return;

  if (button.dataset.action === "edit") {
    startEditing(session);
    return;
  }

  if (button.dataset.action === "delete") {
    const shouldDelete = window.confirm(`Supprimer la session "${session.game}" ?`);
    if (!shouldDelete) return;

    sessions = sessions.filter((item) => item.id !== session.id);
    if (elements.editingId.value === session.id) resetEditingState();
    saveSessions();
    render();
    showToast("Session supprimée.");
    return;
  }

  if (button.dataset.action === "up") {
    moveSession(session.id, -1);
    return;
  }

  if (button.dataset.action === "down") {
    moveSession(session.id, 1);
  }
}

function handleSessionKeyboard(event) {
  if (event.target.closest("button, input, select, textarea")) return;
  const card = event.target.closest(".session-card");
  if (!card) return;

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSession(card.dataset.id, -1);
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSession(card.dataset.id, 1);
  }
}

function sortSessionsByDate() {
  if (sessions.length < 2) return;

  sessions = [...sessions].sort(compareSessionsByDate);
  saveSessions();
  render();
  showToast("Sessions triées par date.");
}

function clearSessions() {
  if (!sessions.length) return;

  const shouldClear = window.confirm("Supprimer toutes les sessions du planning ?");
  if (!shouldClear) return;

  sessions = [];
  resetEditingState();
  saveSessions();
  render();
  showToast("Planning vidé.");
}

function startEditing(session) {
  elements.editingId.value = session.id;
  elements.date.value = session.date;
  elements.time.value = session.time;
  elements.game.value = session.game;
  elements.title.value = session.title || "";
  setSelectedImage(session.image || "");
  selectDay(session.day);

  elements.submit.querySelector("span").textContent = "Mettre à jour la session";
  elements.submit.querySelector("[aria-hidden='true']").textContent = "✓";
  elements.cancelEdit.classList.remove("is-hidden");
  elements.game.focus();
  elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetFormAfterSubmit() {
  elements.editingId.value = "";
  elements.game.value = "";
  elements.title.value = "";
  setSelectedImage("");
  elements.submit.querySelector("span").textContent = "Ajouter la session";
  elements.submit.querySelector("[aria-hidden='true']").textContent = "＋";
  elements.cancelEdit.classList.add("is-hidden");
  elements.game.focus();
}

function resetEditingState() {
  elements.editingId.value = "";
  elements.game.value = "";
  elements.title.value = "";
  setSelectedImage("");
  elements.submit.querySelector("span").textContent = "Ajouter la session";
  elements.submit.querySelector("[aria-hidden='true']").textContent = "＋";
  elements.cancelEdit.classList.add("is-hidden");
}

function getFormPayload() {
  const date = elements.date.value;
  const time = elements.time.value;
  const game = sanitizeText(elements.game.value, 42);
  const title = sanitizeText(elements.title.value, 64);

  if (imageProcessing) {
    showToast("L'image est encore en cours d'optimisation.");
    return null;
  }

  if (!isValidDateValue(date)) {
    showToast("Choisissez une date valide.");
    elements.date.focus();
    return null;
  }

  const dateDay = getDayFromDate(date);
  if (!isValidDayValue(dateDay)) {
    showToast("Choisissez un jour valide.");
    elements.dayButtons[0]?.focus();
    return null;
  }

  if (!isValidTimeValue(time)) {
    showToast("Choisissez une heure valide.");
    elements.time.focus();
    return null;
  }

  if (!game) {
    showToast("Indiquez le jeu ou la catégorie du stream.");
    elements.game.focus();
    return null;
  }

  selectDay(dateDay);

  return {
    date,
    day: dateDay,
    time,
    game,
    title,
    image: selectedImage,
  };
}

function handleImageDrag(event) {
  event.preventDefault();
  event.stopPropagation();

  const isDragging = event.type === "dragenter" || event.type === "dragover";
  elements.imageDropZone.classList.toggle("is-dragging", isDragging);
}

async function handleImageFile(file) {
  elements.imageDropZone.classList.remove("is-dragging");
  elements.imageInput.value = "";

  if (!file) return;

  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    showToast("Utilisez une image PNG, JPG ou WebP.");
    return;
  }

  imageProcessing = true;
  elements.imageUploadLabel.textContent = "Optimisation...";
  elements.imageUploadHint.textContent = "Compression de l'image en cours";

  try {
    const imageData = await compressImage(file);
    setSelectedImage(imageData);
    showToast("Image ajoutée à la session.");
  } catch {
    setSelectedImage("");
    showToast("Impossible de lire cette image.");
  } finally {
    imageProcessing = false;
  }
}

function setSelectedImage(imageData) {
  selectedImage = isValidImageData(imageData) ? imageData : "";

  elements.imageDropZone.classList.toggle("has-image", Boolean(selectedImage));
  elements.removeImage.classList.toggle("is-hidden", !selectedImage);
  elements.imageUploadPreview.style.backgroundImage = selectedImage ? `url("${selectedImage}")` : "";
  elements.imageUploadLabel.textContent = selectedImage ? "Image prête" : "Ajouter une image";
  elements.imageUploadHint.textContent = selectedImage
    ? "Elle remplacera le cadre visuel du jeu"
    : "Cliquer ou déposer";
}

function moveSession(id, direction) {
  const currentIndex = sessions.findIndex((session) => session.id === id);
  const nextIndex = currentIndex + direction;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sessions.length) {
    return;
  }

  const [session] = sessions.splice(currentIndex, 1);
  sessions.splice(nextIndex, 0, session);
  saveSessions();
  render();
  showToast("Ordre des sessions mis à jour.");
}

function handleDragStart(event) {
  const card = event.target.closest(".session-card");
  if (!card) return;

  draggedSessionId = card.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedSessionId);
  requestAnimationFrame(() => card.classList.add("is-dragging"));
}

function handleDragOver(event) {
  if (!draggedSessionId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleDrop(event) {
  event.preventDefault();
  const targetCard = event.target.closest(".session-card");
  const draggedIndex = sessions.findIndex((session) => session.id === draggedSessionId);
  if (draggedIndex < 0) return;

  let insertIndex = sessions.length;

  if (targetCard) {
    const targetIndex = sessions.findIndex((session) => session.id === targetCard.dataset.id);
    if (targetIndex < 0 || targetIndex === draggedIndex) return;

    const targetBox = targetCard.getBoundingClientRect();
    const dropAfterMiddle = event.clientY > targetBox.top + targetBox.height / 2;
    insertIndex = targetIndex + (dropAfterMiddle ? 1 : 0);
  }

  const [draggedSession] = sessions.splice(draggedIndex, 1);
  if (draggedIndex < insertIndex) insertIndex -= 1;
  sessions.splice(insertIndex, 0, draggedSession);

  draggedSessionId = null;
  saveSessions();
  render();
  showToast("Ordre des sessions mis à jour.");
}

function handleDragEnd() {
  draggedSessionId = null;
  document.querySelectorAll(".session-card.is-dragging").forEach((card) => {
    card.classList.remove("is-dragging");
  });
}

function render() {
  renderSessionList();
  renderPreview();
}

function renderSessionList() {
  elements.sessionCount.textContent = `(${sessions.length})`;
  if (elements.sortSessions) elements.sortSessions.disabled = sessions.length < 2;
  if (elements.clearSessions) elements.clearSessions.disabled = sessions.length < 1;

  if (!sessions.length) {
    elements.sessionList.innerHTML = `
      <div class="empty-state">
        Ajoutez votre première session pour construire le calendrier.
      </div>
    `;
    return;
  }

  elements.sessionList.innerHTML = sessions.map(renderSessionCard).join("");
}

function renderSessionCard(session, index) {
  const dateLabel = formatFullDate(session);
  const subtitle = session.title ? `${session.game} • ${session.title}` : session.game;
  const isFirst = index === 0;
  const isLast = index === sessions.length - 1;

  return `
    <article class="session-card" draggable="true" tabindex="0" data-id="${escapeHtml(session.id)}">
      <span class="drag-handle" aria-hidden="true">⁝⁝</span>
      ${renderGameVisual(session)}
      <div>
        <h3>${escapeHtml(dateLabel)}</h3>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="session-meta">
        <span class="session-time">${escapeHtml(session.time)}</span>
        <span class="session-actions">
          <button class="mini-action" type="button" data-action="up" ${isFirst ? "disabled" : ""} aria-label="Monter ${escapeHtml(session.game)}">↑</button>
          <button class="mini-action" type="button" data-action="down" ${isLast ? "disabled" : ""} aria-label="Descendre ${escapeHtml(session.game)}">↓</button>
          <button class="mini-action" type="button" data-action="edit" aria-label="Modifier ${escapeHtml(session.game)}">✎</button>
          <button class="danger-action" type="button" data-action="delete" aria-label="Supprimer ${escapeHtml(session.game)}">⌫</button>
        </span>
      </div>
    </article>
  `;
}

function renderPreview() {
  applyPreviewLayout(elements.preview, sessions.length);

  if (!sessions.length) {
    elements.previewList.innerHTML = `
      <div class="empty-preview">
        Ajoutez une session pour générer le planning
      </div>
    `;
    return;
  }

  elements.previewList.innerHTML = sessions.map(renderPreviewSession).join("");
}

function renderPreviewSession(session) {
  const dateParts = getDateParts(session.date);
  const subtitle = session.title || "";
  const timezone = elements.timezone.checked ? "<small>Heure du Québec</small>" : "";
  const textClass = getTextLengthClass(session.game, subtitle);

  return `
    <article class="preview-stream ${textClass}">
      <div class="preview-date">
        <span class="preview-day">${escapeHtml(session.day)}</span>
        <span class="preview-number">${escapeHtml(dateParts.day)}</span>
        <span class="preview-month">${escapeHtml(dateParts.month)}</span>
      </div>
      ${renderGameVisual(session, "preview-visual")}
      <div class="preview-game">
        <h3 title="${escapeHtml(session.game)}">${escapeHtml(session.game)}</h3>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <div class="preview-hour">
        <div>
          <strong>${escapeHtml(session.time)}</strong>
          ${timezone}
        </div>
      </div>
    </article>
  `;
}

function renderGameVisual(session, extraClass = "") {
  const classes = ["game-visual", extraClass, session.image ? "has-image" : ""]
    .filter(Boolean)
    .join(" ");
  const fallback = getPosterTheme(session.game);
  const style = `--poster-a: ${fallback.a}; --poster-b: ${fallback.b}`;

  if (!session.image) {
    return `
      <span class="${classes}" style="${style}" aria-label="Visuel par défaut pour ${escapeHtml(session.game)}">
        <span class="game-visual-placeholder" aria-hidden="true"></span>
      </span>
    `;
  }

  return `
    <span class="${classes}" style="${style}" aria-label="Image du jeu ${escapeHtml(session.game)}">
      <img src="${escapeHtml(session.image)}" alt="" loading="lazy" decoding="async" />
    </span>
  `;
}

async function generateImage() {
  if (!sessions.length) {
    showToast("Ajoutez au moins une session avant de générer l'image.");
    elements.game.focus();
    return;
  }

  const buttons = elements.generateButtons.filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = "Génération...";
  });

  let exportHost = null;

  try {
    await waitForFonts();

    exportHost = document.createElement("div");
    const exportNode = elements.preview.cloneNode(true);
    exportHost.className = "export-host";
    exportNode.classList.add("export-render");
    exportNode.removeAttribute("id");
    exportNode.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    exportNode.querySelectorAll("img[loading]").forEach((image) => image.removeAttribute("loading"));
    exportNode.setAttribute("aria-hidden", "true");
    applyPreviewLayout(exportNode, sessions.length);
    exportHost.appendChild(exportNode);
    document.body.appendChild(exportHost);

    await nextFrame();
    await withTimeout(waitForImages(exportNode), 1800);
    fitPreviewText(exportNode);
    await nextFrame();

    const canvas = window.html2canvas
      ? await renderWithHtml2Canvas(exportNode)
      : await renderWithSvgFallback(exportNode);

    downloadCanvas(canvas);
    showToast(`Image PNG exportée en ${EXPORT_WIDTH}x${EXPORT_HEIGHT}.`);
  } catch {
    showToast("Impossible de générer l'image. Vérifiez les images et réessayez.");
  } finally {
    exportHost?.remove();
    buttons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    });
  }
}

function renderWithHtml2Canvas(exportNode) {
  return html2canvas(exportNode, {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    scale: 1,
    backgroundColor: null,
    useCORS: true,
    logging: false,
    windowWidth: EXPORT_WIDTH,
    windowHeight: EXPORT_HEIGHT,
    scrollX: 0,
    scrollY: 0,
  });
}

function renderWithSvgFallback(exportNode) {
  return new Promise((resolve, reject) => {
    const clone = exportNode.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

    const html = `
      <div xmlns="http://www.w3.org/1999/xhtml">
        <style>${collectInlineStyles()}</style>
        ${new XMLSerializer().serializeToString(clone)}
      </div>
    `;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${EXPORT_HEIGHT}" viewBox="0 0 ${EXPORT_WIDTH} ${EXPORT_HEIGHT}">
        <foreignObject width="100%" height="100%">${html}</foreignObject>
      </svg>
    `;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rendu SVG indisponible"));
    });

    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      URL.revokeObjectURL(url);

      if (!context) {
        reject(new Error("Canvas indisponible"));
        return;
      }

      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      context.drawImage(image, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      resolve(canvas);
    });

    image.src = url;
  });
}

function collectInlineStyles() {
  return [...document.styleSheets]
    .map((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function downloadCanvas(canvas) {
  const link = document.createElement("a");
  link.download = `planning-le-general-jus-${toInputDate(new Date())}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function selectDay(day) {
  if (!isValidDayValue(day)) return;

  selectedDay = day;
  elements.dayButtons.forEach((button) => {
    const isSelected = button.dataset.day === day;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
  });
}

function loadSessions() {
  const storedSessions = readStorage(STORAGE_KEY, []);
  const seenIds = new Set();
  let storageChanged = false;

  sessions = Array.isArray(storedSessions)
    ? storedSessions
        .map(normalizeSession)
        .filter(Boolean)
        .map((session) => {
          if (seenIds.has(session.id)) {
            session.id = createId();
            storageChanged = true;
          }
          seenIds.add(session.id);
          return session;
        })
    : [];

  if (Array.isArray(storedSessions) && (storageChanged || sessions.length !== storedSessions.length)) {
    saveSessions();
  }
}

function saveSessions() {
  writeStorage(STORAGE_KEY, sessions);
}

function loadSettings() {
  const storedSettings = readStorage(SETTINGS_KEY, {});
  const settings =
    storedSettings && typeof storedSettings === "object" && !Array.isArray(storedSettings)
      ? storedSettings
      : {};
  const theme = Object.prototype.hasOwnProperty.call(themeAccents, settings.theme)
    ? settings.theme
    : "twitch";
  const accent = isValidHexColor(settings.accent) ? settings.accent : themeAccents[theme];

  elements.theme.value = theme;
  elements.accentColor.value = accent;
  elements.timezone.checked =
    typeof settings.includeTimezone === "boolean" ? settings.includeTimezone : true;
  setAccent(elements.accentColor.value);
}

function saveSettings() {
  writeStorage(
    SETTINGS_KEY,
    {
      theme: elements.theme.value,
      accent: elements.accentColor.value,
      includeTimezone: elements.timezone.checked,
    }
  );
}

function readStorage(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (!storageWarningShown) {
      storageWarningShown = true;
      showToast("Sauvegarde locale indisponible dans ce navigateur.");
    }
    return false;
  }
}

function normalizeSession(session, index) {
  if (!session || typeof session !== "object") return null;

  const date = typeof session.date === "string" ? session.date : "";
  const time = typeof session.time === "string" ? session.time : "";
  const game = sanitizeText(session.game, 42);
  const title = sanitizeText(session.title, 64);
  const image = isValidImageData(session.image) ? session.image : "";

  if (!isValidDateValue(date) || !isValidTimeValue(time) || !game) {
    return null;
  }

  const day = getDayFromDate(date) || "Lun";
  const createdAt = Number.isFinite(session.createdAt) ? session.createdAt : Date.now() + index;

  return {
    id: sanitizeText(session.id, 80) || createId(),
    date,
    day,
    time,
    game,
    title,
    image,
    createdAt,
  };
}

function setAccent(hex) {
  if (!isValidHexColor(hex)) return;

  const rgb = hexToRgb(hex);
  const bright = mixHex(hex, "#ffffff", 0.22);
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-2", bright);
  document.documentElement.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
}

function getDayFromDate(value) {
  if (!isValidDateValue(value)) return null;

  const date = new Date(`${value}T12:00:00`);
  return dayLabels[date.getDay()];
}

function isValidDayValue(value) {
  return dayOptions.includes(value);
}

function isValidDateValue(value) {
  const dateValue = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;

  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(`${dateValue}T12:00:00`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value));
}

function isValidImageData(value) {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(String(value));
}

function getDateParts(value) {
  if (!isValidDateValue(value)) {
    return { day: "--", month: "---" };
  }

  const date = new Date(`${value}T12:00:00`);
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

function formatFullDate(session) {
  if (!isValidDateValue(session.date)) return "Date invalide";

  const date = new Date(`${session.date}T12:00:00`);
  const formatted = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${getLongDay(session.day)} ${capitalize(formatted)}`;
}

function getLongDay(shortDay) {
  return {
    Lun: "Lundi",
    Mar: "Mardi",
    Mer: "Mercredi",
    Jeu: "Jeudi",
    Ven: "Vendredi",
    Sam: "Samedi",
    Dim: "Dimanche",
  }[shortDay] || shortDay;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applyPreviewLayout(root, count) {
  const profile = getLayoutProfile(count);
  const sessionCount = Math.max(count, 1);
  const rows = Math.ceil(sessionCount / profile.columns);

  root.dataset.density = profile.density;
  root.dataset.layout = profile.layout;
  root.style.setProperty("--session-count", String(sessionCount));
  root.style.setProperty("--session-columns", String(profile.columns));
  root.style.setProperty("--session-rows", String(rows));
}

function getLayoutProfile(count) {
  return layoutProfiles.find((profile) => count <= profile.max) || layoutProfiles[layoutProfiles.length - 1];
}

function getTextLengthClass(game, title) {
  const length = `${game} ${title}`.trim().length;
  if (length > 74) return "text-xlong";
  if (length > 52) return "text-long";
  if (length > 34) return "text-medium";
  return "text-short";
}

function compareSessionsByDate(a, b) {
  const aKey = `${a.date}T${a.time}`;
  const bKey = `${b.date}T${b.time}`;
  return aKey.localeCompare(bKey) || a.createdAt - b.createdAt;
}

function createId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", reject);
    reader.addEventListener("load", () => {
      const image = new Image();

      image.addEventListener("error", reject);
      image.addEventListener("load", () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Canvas indisponible"));
          return;
        }

        let ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        let quality = IMAGE_QUALITY;
        let imageData = "";

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const width = Math.max(1, Math.round(image.naturalWidth * ratio));
          const height = Math.max(1, Math.round(image.naturalHeight * ratio));

          canvas.width = width;
          canvas.height = height;
          context.fillStyle = "#07030d";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          imageData = canvas.toDataURL("image/jpeg", quality);
          if (imageData.length <= MAX_IMAGE_DATA_LENGTH) break;

          ratio *= 0.86;
          quality = Math.max(0.68, quality - 0.06);
        }

        resolve(imageData);
      });

      image.src = reader.result;
    });

    reader.readAsDataURL(file);
  });
}

function getPosterTheme(game) {
  const normalized = String(game).toLowerCase();
  const presets = [
    { match: "elden", a: "#f4b33d", b: "#06150f" },
    { match: "zelda", a: "#76f2d8", b: "#0c2a3b" },
    { match: "valorant", a: "#ff394f", b: "#16070d" },
    { match: "minecraft", a: "#60c543", b: "#193c20" },
    { match: "call of duty", a: "#d4d4d6", b: "#0b0d11" },
    { match: "warzone", a: "#d4d4d6", b: "#0b0d11" },
    { match: "fortnite", a: "#37c8ff", b: "#5b25e7" },
    { match: "league", a: "#c7933b", b: "#06152b" },
  ];

  const preset = presets.find((item) => normalized.includes(item.match));
  if (preset) return preset;

  let hash = 0;
  for (const char of normalized) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    a: `hsl(${hue} 88% 48%)`,
    b: `hsl(${(hue + 62) % 360} 82% 18%)`,
  };
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitForFonts() {
  if (!document.fonts?.ready) return Promise.resolve();
  return withTimeout(document.fonts.ready.catch(() => undefined), 1400);
}

function withTimeout(promise, delay) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, delay))]);
}

function waitForImages(root) {
  const images = [...root.querySelectorAll("img")];
  return Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (image.decode) return image.decode().catch(() => undefined);

      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })
  );
}

function fitPreviewText(root) {
  const rules = [
    { selector: ".preview-game h3", min: 18 },
    { selector: ".preview-game p", min: 12 },
    { selector: ".preview-hour strong", min: 24 },
    { selector: ".preview-hour small", min: 10 },
  ];

  rules.forEach(({ selector, min }) => {
    root.querySelectorAll(selector).forEach((node) => fitTextNode(node, min));
  });
}

function fitTextNode(node, minFontSize) {
  const style = getComputedStyle(node);
  let fontSize = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(fontSize)) return;

  while (fontSize > minFontSize && isTextOverflowing(node)) {
    fontSize -= 1;
    node.style.fontSize = `${fontSize}px`;
  }
}

function isTextOverflowing(node) {
  return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixHex(hexA, hexB, weight) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const mixed = {
    r: Math.round(a.r + (b.r - a.r) * weight),
    g: Math.round(a.g + (b.g - a.g) * weight),
    b: Math.round(a.b + (b.b - a.b) * weight),
  };

  return `#${[mixed.r, mixed.g, mixed.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}
