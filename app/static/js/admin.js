const defaultConfig = {
  serverBaseUrl: "http://localhost:5000",
  middlewareBaseUrl: "http://localhost:5000",
  chatMode: "openai",
  chatEndpoint: "/v1/chat/completions",
  openAiEndpoint: "/v1/chat/completions",
  model: "llama-2-7b",
  apiToken: "",
  sttProvider: "server",
  sttEndpoint: "/ai-middleware/api/services/speech-to-text/transcribe",
  ttsProvider: "browser",
  ttsEndpoint: "/ai-middleware/api/services/text_to_speech/generate_speech",
  llmWithTtsEndpoint: "/ai-middleware/api/services/llm-with-tts",
  voiceChatEndpoint: "/ai-middleware/api/services/voice-chat",
  taskStatusEndpoint: "/ai-middleware/api/playground/tasks/{taskId}/status",
  identityEnrollEndpoint: "/api/v1/identity/enroll",
  identityVerifyEndpoint: "/api/v1/identity/verify",
  serverHealthEndpoint: "/ai-middleware/api/health",
  middlewareStatusEndpoint: "/ai-middleware/api/operational-status",
  servicesListEndpoint: "/ai-middleware/api/services",
  servicesStatusEndpoint: "/ai-middleware/api/services/status",
  appUserId: "jarvis-local-user",
  appUserRole: "user",
  appUserEmail: "",
  useVoiceChat: true,
  // Assistant personality settings
  assistantName: "Jarvis",
  defaultSystemPrompt: "You are Jarvis, a helpful and intelligent AI assistant. You provide clear, accurate, and concise responses. Be friendly and professional.",
  greetingMessage: "Hello! I'm Jarvis, your AI assistant. How can I help you today?",
  temperature: 0.7,
  maxTokens: 2048,
  industries: [
    {
      id: "community",
      label: "Community",
      systemPrompt:
        "You are Jarvis for the Beep AI Community. Be welcoming, guide users to projects, competitions, and best practices.",
      ragCollection: "community",
    },
    {
      id: "healthcare",
      label: "Healthcare",
      systemPrompt:
        "You are Jarvis for Healthcare. Prioritize compliance, safety, and clinical clarity.",
      ragCollection: "healthcare",
    },
    {
      id: "finance",
      label: "Finance",
      systemPrompt:
        "You are Jarvis for Finance. Focus on risk controls, audit trails, and regulatory guidance.",
      ragCollection: "finance",
    },
  ],
};

const state = {
  config: { ...defaultConfig },
  fileHandle: null,
};

const elements = {};

const setStatus = (message) => {
  elements.statusText.textContent = message;
};

const normalizeHostInput = (value) => {
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `http://${value}`;
};

const parseBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    return { host: "", port: "" };
  }
  try {
    const url = new URL(baseUrl);
    return {
      host: `${url.protocol}//${url.hostname}`,
      port: url.port || "",
    };
  } catch (error) {
    return { host: baseUrl, port: "" };
  }
};

const buildBaseUrlFromInputs = () => {
  const hostInput = elements.serverHost.value.trim();
  const portInput = elements.serverPort.value.trim();

  if (!hostInput) {
    return "";
  }

  const normalizedHost = normalizeHostInput(hostInput);
  try {
    const url = new URL(normalizedHost);
    if (portInput) {
      url.port = portInput;
    }
    return url.origin;
  } catch (error) {
    const trimmed = normalizedHost.replace(/\/$/, "");
    return portInput ? `${trimmed}:${portInput}` : trimmed;
  }
};

const updateComputedUrl = () => {
  const baseUrl = buildBaseUrlFromInputs();
  const middlewareUrl = buildMiddlewareUrlFromInputs();
  elements.computedUrl.textContent = baseUrl || "-";
  elements.computedMiddlewareUrl.textContent = middlewareUrl || "-";
};

const applyConfigToForm = () => {
  const parsed = parseBaseUrl(state.config.serverBaseUrl);
  const middlewareParsed = parseBaseUrl(state.config.middlewareBaseUrl);
  elements.serverHost.value = parsed.host;
  elements.serverPort.value = parsed.port;
  elements.middlewareHost.value = middlewareParsed.host;
  elements.middlewarePort.value = middlewareParsed.port;
  elements.apiToken.value = state.config.apiToken || "";
  elements.modelId.value = state.config.model || "";
  elements.appUserId.value = state.config.appUserId || "jarvis-local-user";
  elements.appUserRole.value = state.config.appUserRole || "user";
  elements.appUserEmail.value = state.config.appUserEmail || "";
  elements.chatMode.value = state.config.chatMode || "middleware";
  elements.sttProvider.value = state.config.sttProvider || "server";
  elements.ttsProvider.value = state.config.ttsProvider || "server";
  elements.useVoiceChat.checked = Boolean(state.config.useVoiceChat);
  // Assistant personality fields
  elements.assistantName.value = state.config.assistantName || "Jarvis";
  elements.defaultSystemPrompt.value = state.config.defaultSystemPrompt || "";
  elements.greetingMessage.value = state.config.greetingMessage || "";
  elements.temperature.value = state.config.temperature ?? 0.7;
  elements.maxTokens.value = state.config.maxTokens ?? 2048;
  renderIndustries();
  updateComputedUrl();
};

const buildMiddlewareUrlFromInputs = () => {
  const hostInput = elements.middlewareHost.value.trim();
  const portInput = elements.middlewarePort.value.trim();

  if (!hostInput) {
    return "";
  }

  const normalizedHost = normalizeHostInput(hostInput);
  try {
    const url = new URL(normalizedHost);
    if (portInput) {
      url.port = portInput;
    }
    return url.origin;
  } catch (error) {
    const trimmed = normalizedHost.replace(/\/$/, "");
    return portInput ? `${trimmed}:${portInput}` : trimmed;
  }
};

const buildConfigFromForm = () => {
  const serverBaseUrl = buildBaseUrlFromInputs() || state.config.serverBaseUrl;
  const middlewareBaseUrl =
    buildMiddlewareUrlFromInputs() || state.config.middlewareBaseUrl;
  return {
    ...state.config,
    serverBaseUrl,
    middlewareBaseUrl,
    apiToken: elements.apiToken.value.trim(),
    model: elements.modelId.value.trim(),
    appUserId: elements.appUserId.value.trim() || "jarvis-local-user",
    appUserRole: elements.appUserRole.value.trim() || "user",
    appUserEmail: elements.appUserEmail.value.trim(),
    chatMode: elements.chatMode.value,
    sttProvider: elements.sttProvider.value,
    ttsProvider: elements.ttsProvider.value,
    useVoiceChat: elements.useVoiceChat.checked,
    // Assistant personality fields
    assistantName: elements.assistantName.value.trim() || "Jarvis",
    defaultSystemPrompt: elements.defaultSystemPrompt.value.trim(),
    greetingMessage: elements.greetingMessage.value.trim(),
    temperature: parseFloat(elements.temperature.value) || 0.7,
    maxTokens: parseInt(elements.maxTokens.value) || 2048,
    industries: getIndustriesFromForm(),
  };
};

const loadConfigFromUrl = async () => {
  if (window.location.protocol === "file:") {
    setStatus("File mode: use Open config.json to load settings.");
    return;
  }
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Config API not available.");
    }
    const config = await response.json();
    state.config = { ...defaultConfig, ...config };
    applyConfigToForm();
    setStatus("Loaded config.json from server.");
  } catch (error) {
    try {
      const response = await fetch("/config.json", { cache: "no-store" });
      if (!response.ok) {
        setStatus("config.json not found. Loaded defaults.");
        return;
      }
      const config = await response.json();
      state.config = { ...defaultConfig, ...config };
      applyConfigToForm();
      setStatus("Loaded config.json from server.");
    } catch (innerError) {
      setStatus("Failed to load config.json. Using defaults.");
    }
  }
};

const openConfigFile = async () => {
  if (!window.showOpenFilePicker) {
    elements.fileInput.click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    state.fileHandle = handle;
    const file = await handle.getFile();
    const content = await file.text();
    const config = JSON.parse(content);
    state.config = { ...defaultConfig, ...config };
    applyConfigToForm();
    setStatus("Loaded config.json from disk.");
  } catch (error) {
    setStatus("Open canceled or failed.");
  }
};

const handleFileInput = async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    setStatus("Open canceled or failed.");
    return;
  }
  try {
    const content = await file.text();
    const config = JSON.parse(content);
    state.config = { ...defaultConfig, ...config };
    applyConfigToForm();
    setStatus("Loaded config.json from disk.");
  } catch (error) {
    setStatus("Failed to read config.json.");
  } finally {
    event.target.value = "";
  }
};

const saveConfigToFile = async () => {
  const config = buildConfigFromForm();
  const payload = JSON.stringify(config, null, 2);

  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        throw new Error("Config API failed.");
      }
      state.config = config;
      setStatus("Saved to config.json on server.");
      return;
    } catch (error) {
      setStatus("Server save failed. Falling back to file save.");
    }
  }

  try {
    let handle = state.fileHandle;
    if (!handle && window.showSaveFilePicker) {
      handle = await window.showSaveFilePicker({
        suggestedName: "config.json",
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    }

    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      state.fileHandle = handle;
      state.config = config;
      setStatus("Saved to config.json.");
      return;
    }
  } catch (error) {
    setStatus("Save canceled or failed.");
    return;
  }

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "config.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  state.config = config;
  setStatus("Downloaded config.json. Replace the file manually.");
};

const bindEvents = () => {
  elements.serverHost.addEventListener("input", updateComputedUrl);
  elements.serverPort.addEventListener("input", updateComputedUrl);
  elements.middlewareHost.addEventListener("input", updateComputedUrl);
  elements.middlewarePort.addEventListener("input", updateComputedUrl);
  elements.btnOpenFile.addEventListener("click", openConfigFile);
  elements.btnSaveFile.addEventListener("click", saveConfigToFile);
  elements.fileInput.addEventListener("change", handleFileInput);
  // Add industry button
  if (elements.btnAddIndustry) {
    elements.btnAddIndustry.addEventListener("click", addIndustry);
  }
};

const initElements = () => {
  elements.statusText = document.getElementById("status-text");
  elements.serverHost = document.getElementById("server-host");
  elements.serverPort = document.getElementById("server-port");
  elements.middlewareHost = document.getElementById("middleware-host");
  elements.middlewarePort = document.getElementById("middleware-port");
  elements.apiToken = document.getElementById("api-token");
  elements.modelId = document.getElementById("model-id");
  elements.appUserId = document.getElementById("app-user-id");
  elements.appUserRole = document.getElementById("app-user-role");
  elements.appUserEmail = document.getElementById("app-user-email");
  elements.chatMode = document.getElementById("chat-mode");
  elements.sttProvider = document.getElementById("stt-provider");
  elements.ttsProvider = document.getElementById("tts-provider");
  elements.useVoiceChat = document.getElementById("voice-chat");
  elements.computedUrl = document.getElementById("computed-url");
  elements.computedMiddlewareUrl = document.getElementById("computed-middleware-url");
  elements.btnOpenFile = document.getElementById("btn-open-file");
  elements.btnSaveFile = document.getElementById("btn-save-file");
  elements.fileInput = document.getElementById("file-input");
  // Assistant personality elements
  elements.assistantName = document.getElementById("assistant-name");
  elements.defaultSystemPrompt = document.getElementById("default-system-prompt");
  elements.greetingMessage = document.getElementById("greeting-message");
  elements.temperature = document.getElementById("temperature");
  elements.maxTokens = document.getElementById("max-tokens");
  elements.industriesContainer = document.getElementById("industries-container");
  elements.btnAddIndustry = document.getElementById("btn-add-industry");
};

/**
 * Render industries list in the admin panel
 */
const renderIndustries = () => {
  const container = elements.industriesContainer;
  if (!container) return;
  
  container.innerHTML = "";
  const industries = state.config.industries || [];
  
  industries.forEach((industry, index) => {
    const card = document.createElement("div");
    card.className = "industry-card";
    card.innerHTML = `
      <div class="industry-header">
        <input type="text" class="industry-id" value="${escapeHtml(industry.id || "")}" placeholder="ID (e.g., healthcare)" data-index="${index}" />
        <input type="text" class="industry-label" value="${escapeHtml(industry.label || "")}" placeholder="Label (e.g., Healthcare)" data-index="${index}" />
        <button class="ghost danger btn-remove-industry" data-index="${index}">×</button>
      </div>
      <div class="industry-body">
        <input type="text" class="industry-rag" value="${escapeHtml(industry.ragCollection || "")}" placeholder="RAG Collection (optional)" data-index="${index}" />
        <textarea class="industry-prompt" rows="3" placeholder="System prompt for this industry..." data-index="${index}">${escapeHtml(industry.systemPrompt || "")}</textarea>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Bind remove buttons
  container.querySelectorAll(".btn-remove-industry").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      removeIndustry(index);
    });
  });
};

/**
 * Escape HTML for safe rendering
 */
const escapeHtml = (str) => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Get industries from form inputs
 */
const getIndustriesFromForm = () => {
  const container = elements.industriesContainer;
  if (!container) return state.config.industries || [];
  
  const industries = [];
  const cards = container.querySelectorAll(".industry-card");
  
  cards.forEach((card, index) => {
    const id = card.querySelector(".industry-id")?.value.trim();
    const label = card.querySelector(".industry-label")?.value.trim();
    const ragCollection = card.querySelector(".industry-rag")?.value.trim();
    const systemPrompt = card.querySelector(".industry-prompt")?.value.trim();
    
    if (id && label) {
      industries.push({
        id,
        label,
        ragCollection: ragCollection || "",
        systemPrompt: systemPrompt || "",
      });
    }
  });
  
  return industries;
};

/**
 * Add a new industry
 */
const addIndustry = () => {
  const industries = getIndustriesFromForm();
  industries.push({
    id: "",
    label: "",
    ragCollection: "",
    systemPrompt: "",
  });
  state.config.industries = industries;
  renderIndustries();
  // Focus on the new industry's ID field
  const lastCard = elements.industriesContainer.querySelector(".industry-card:last-child");
  if (lastCard) {
    lastCard.querySelector(".industry-id")?.focus();
  }
};

/**
 * Remove an industry by index
 */
const removeIndustry = (index) => {
  const industries = getIndustriesFromForm();
  industries.splice(index, 1);
  state.config.industries = industries;
  renderIndustries();
};

const init = async () => {
  initElements();
  bindEvents();
  await loadConfigFromUrl();
  if (!state.config.industries.length && window.location.protocol === "file:") {
    setStatus("Loaded defaults. Open config.json to edit saved values.");
  }
};

document.addEventListener("DOMContentLoaded", init);
