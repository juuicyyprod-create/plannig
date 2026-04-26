const STORAGE_KEY = "general-jus-stream-sessions";
const SETTINGS_KEY = "general-jus-calendar-settings";
const MAX_IMAGE_SIZE = 900;
const IMAGE_QUALITY = 0.82;

const dayOptions = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const themeAccents = {
  twitch: "#8d2cff",
  void: "#b026ff",
  royal: "#6f35ff",
};

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

  if (!isValidDayValue(selectedDay)) {
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

  return {
    date,
    day: selectedDay,
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
    <article class="session-card" draggable="true" data-id="${escapeHtml(session.id)}">
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
  const density = getDensity(sessions.length);
  elements.preview.dataset.density = density;
  elements.previewList.style.setProperty("--session-count", String(Math.max(sessions.length, 1)));

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

  return `
    <article class="preview-stream">
      <div class="preview-date">
        <span class="preview-day">${escapeHtml(session.day)}</span>
        <span class="preview-number">${escapeHtml(dateParts.day)}</span>
        <span class="preview-month">${escapeHtml(dateParts.month)}</span>
      </div>
      ${renderGameVisual(session, "preview-visual")}
      <div class="preview-game">
        <h3>${escapeHtml(session.game)}</h3>
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
      <img src="${escapeHtml(session.image)}" alt="" />
    </span>
  `;
}

async function generateImage() {
  if (!sessions.length) {
    showToast("Ajoutez au moins une session avant de générer l'image.");
    elements.game.focus();
    return;
  }

  if (!window.html2canvas) {
    showToast("Le module d'export n'est pas encore chargé. Réessayez dans un instant.");
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
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    exportHost = document.createElement("div");
    const exportNode = elements.preview.cloneNode(true);
    exportHost.className = "export-host";
    exportNode.classList.add("export-render");
    exportNode.removeAttribute("id");
    exportNode.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    exportNode.setAttribute("aria-hidden", "true");
    exportHost.appendChild(exportNode);
    document.body.appendChild(exportHost);

    await nextFrame();
    await waitForImages(exportNode);

    const canvas = await html2canvas(exportNode, {
      width: 1920,
      height: 1080,
      scale: 1,
      backgroundColor: null,
      useCORS: true,
      logging: false,
      windowWidth: 1920,
      windowHeight: 1080,
    });

    downloadCanvas(canvas);
    showToast("Image PNG exportée en 1920x1080.");
  } catch {
    showToast("Impossible de générer l'image. Vérifiez le chargement de la page.");
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

function downloadCanvas(canvas) {
  const link = document.createElement("a");
  link.download = `planning-le-general-jus-${toInputDate(new Date())}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
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

  const fallbackDay = getDayFromDate(date) || "Lun";
  const createdAt = Number.isFinite(session.createdAt) ? session.createdAt : Date.now() + index;

  return {
    id: sanitizeText(session.id, 80) || createId(),
    date,
    day: isValidDayValue(session.day) ? session.day : fallbackDay,
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

function getDensity(count) {
  if (count > 7) return "ultra";
  if (count > 5) return "compact";
  return "normal";
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
        const ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Canvas indisponible"));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#07030d";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
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
