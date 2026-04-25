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
  conversation: [],
  currentIndustry: null,
  recognition: null,
  micStream: null,
  analyser: null,
  mediaRecorder: null,
  audioChunks: [],
  audioLevel: 0,
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  handsFree: false,
  blinkAt: Date.now() + 1200,
  blinkUntil: 0,
  asciiInterval: null,
  currentAvatarMode: "avatar",
  jarvisAvatar: null,
  identity: {
    voiceEnrolled: false,
    faceEnrolled: false,
  },
  rag: {
    collections: [],
    currentCollection: null,
    documents: [],
  },
};

const elements = {};

const loadConfig = async () => {
  if (window.location.protocol === "file:") {
    return;
  }
  try {
    const response = await fetch("/config.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const config = await response.json();
    state.config = { ...state.config, ...config };
    
    // Update UI with configured assistant name
    const assistantName = state.config.assistantName || "Jarvis";
    if (elements.assistantTitle) {
      elements.assistantTitle.textContent = assistantName;
    }
    document.title = `Beep AI ${assistantName}`;
  } catch (error) {
    console.warn("Using default config", error);
  }
};

const getBaseUrl = () => state.config.serverBaseUrl.replace(/\/$/, "");
const getMiddlewareBaseUrl = () =>
  (state.config.middlewareBaseUrl || state.config.serverBaseUrl).replace(/\/$/, "");

const getAuthHeaders = () => {
  const headers = {};
  if (state.config.apiToken && state.config.apiToken.trim()) {
    headers.Authorization = `Bearer ${state.config.apiToken}`;
  }
  return headers;
};

const getJsonAuthHeaders = () => {
  return {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
  };
};

const requireToken = (context) => {
  if (state.config.apiToken && state.config.apiToken.trim()) {
    return true;
  }
  logMessage(
    "System",
    `API token required for ${context}. Open Admin to set it.`
  );
  return false;
};

const populateIndustries = () => {
  elements.industrySelect.innerHTML = "";
  state.config.industries.forEach((industry) => {
    const option = document.createElement("option");
    option.value = industry.id;
    option.textContent = industry.label;
    elements.industrySelect.appendChild(option);
  });
  
  // Restore saved industry preference or use first option
  const savedIndustryId = localStorage.getItem("jarvisSelectedIndustry");
  const savedIndustry = savedIndustryId 
    ? state.config.industries.find(ind => ind.id === savedIndustryId)
    : null;
  
  state.currentIndustry = savedIndustry || state.config.industries[0];
  if (state.currentIndustry) {
    elements.industrySelect.value = state.currentIndustry.id;
    updateIndustrySummary();
  }
};

const updateIndustrySummary = () => {
  if (!state.currentIndustry) {
    elements.industrySummary.textContent = "No industry selected.";
    return;
  }
  elements.industrySummary.textContent = `${state.currentIndustry.label} profile active.`;
};

const updateStatus = (target, value, isError = false) => {
  target.textContent = value;
  target.classList.toggle("danger", isError);
};

const buildMessages = (text) => {
  const systemMessage = getSystemMessage();
  return systemMessage
    ? [systemMessage, ...state.conversation, { role: "user", content: text }]
    : [...state.conversation, { role: "user", content: text }];
};

/**
 * Log message to conversation or system log
 * System messages go to a hidden log panel, User/Assistant to main conversation
 */
const logMessage = (role, content) => {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const roleEl = document.createElement("div");
  roleEl.className = "role";
  roleEl.textContent = role;
  const contentEl = document.createElement("div");
  contentEl.className = "content";
  contentEl.textContent = content;
  entry.append(roleEl, contentEl);
  
  // System messages go to hidden system log, others to conversation
  if (role === "System") {
    if (elements.systemLog) {
      elements.systemLog.appendChild(entry);
      elements.systemLog.scrollTop = elements.systemLog.scrollHeight;
    }
  } else {
    elements.terminalLog.appendChild(entry);
    elements.terminalLog.scrollTop = elements.terminalLog.scrollHeight;
  }
};

/**
 * Clean text for TTS - remove special characters, icons, markdown, etc.
 * that would sound weird when spoken.
 */
const cleanTextForTTS = (text) => {
  if (!text) return "";
  
  let cleaned = text;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " code block omitted ");
  cleaned = cleaned.replace(/`[^`]+`/g, "");
  
  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");  // bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");      // italic
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1");      // bold
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");        // italic
  cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1");      // strikethrough
  cleaned = cleaned.replace(/#{1,6}\s*/g, "");          // headers
  
  // Remove markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, " link ");
  
  // Remove Font Awesome icons (fa-xxx, fas, fab, etc.)
  cleaned = cleaned.replace(/\bfa[srbl]?\s+fa-[\w-]+/gi, "");
  cleaned = cleaned.replace(/\bfa-[\w-]+/gi, "");
  
  // Remove common Unicode symbols and emojis
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");  // emojis
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, "");    // misc symbols
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, "");    // dingbats
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, "");  // emoticons
  
  // Remove special characters that sound weird
  cleaned = cleaned.replace(/[★☆●○◆◇■□▲△▼▽♠♣♥♦]/g, "");
  cleaned = cleaned.replace(/[→←↑↓↔↕⇒⇐⇑⇓⇔]/g, "");
  cleaned = cleaned.replace(/[©®™℃℉°±×÷]/g, "");
  
  // Remove bullet points and list markers
  cleaned = cleaned.replace(/^[\s]*[-•◦▪▸►]\s*/gm, "");
  cleaned = cleaned.replace(/^[\s]*\d+[.)]\s*/gm, "");
  
  // Remove HTML tags if any
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
};

const getSystemMessage = () => {
  // Use industry-specific prompt if an industry is selected
  if (state.currentIndustry && state.currentIndustry.systemPrompt) {
    return {
      role: "system",
      content: state.currentIndustry.systemPrompt,
    };
  }
  // Otherwise use the default system prompt from config
  if (state.config.defaultSystemPrompt) {
    return {
      role: "system",
      content: state.config.defaultSystemPrompt,
    };
  }
  return null;
};

const buildPayload = (text) => {
  const messages = buildMessages(text);
  const temperature = state.config.temperature ?? 0.7;
  const maxTokens = state.config.maxTokens ?? 2048;
  const endpoint =
    state.config.chatMode === "openai"
      ? state.config.openAiEndpoint
      : state.config.chatEndpoint;
  const isOpenAiCompat = (endpoint || "").startsWith("/v1/");
  const baseUrl = isOpenAiCompat ? getBaseUrl() : getMiddlewareBaseUrl();

  if (isOpenAiCompat) {
    return {
      url: `${baseUrl}${endpoint}`,
      body: {
        model: state.config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
    };
  }

  return {
    url: `${baseUrl}${endpoint}`,
    body: {
      messages,
      model_id: state.config.model,
      temperature,
      max_tokens: maxTokens,
    },
  };
};

const buildLlmWithTtsPayload = (text) => {
  const baseUrl = getMiddlewareBaseUrl();
  return {
    url: `${baseUrl}${state.config.llmWithTtsEndpoint}`,
    body: {
      messages: buildMessages(text),
      model_id: state.config.model,
      generate_speech: true,
      voice: "default",
      speed: 1.0,
    },
  };
};

const parseResponse = (data) => {
  if (!data) {
    return "No response payload returned.";
  }
  if (typeof data === "string") {
    return data;
  }
  // Handle OpenAI error format
  if (data.error) {
    const errorMsg = data.error.message || data.error;
    throw new Error(typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg));
  }
  // Handle OpenAI format: choices[0].message.content
  if (data.choices && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  // Handle legacy formats
  if (data.response) {
    return data.response;
  }
  if (data.message) {
    return data.message;
  }
  if (data.content) {
    return data.content;
  }
  return JSON.stringify(data);
};

const playAudioFromBase64 = (audioBase64, format = "mp3") => {
  return new Promise((resolve, reject) => {
    if (!audioBase64) {
      resolve();
      return;
    }
    const audioUrl = `data:audio/${format};base64,${audioBase64}`;
    const audio = new Audio(audioUrl);
    
    // Start avatar speaking animation when audio starts
    audio.onplay = () => {
      state.isSpeaking = true;  // Enable simulated audio levels
      if (state.jarvisAvatar) {
        state.jarvisAvatar.setExpression("speaking");
        state.jarvisAvatar.startSpeaking();
      }
    };
    
    // Stop avatar speaking when audio ends
    audio.onended = () => {
      state.isSpeaking = false;  // Stop simulated audio levels
      if (state.jarvisAvatar) {
        state.jarvisAvatar.stopSpeaking();
        state.jarvisAvatar.setExpression("neutral");
      }
      resolve();
    };
    
    audio.onerror = (err) => {
      state.isSpeaking = false;  // Stop simulated audio levels on error
      if (state.jarvisAvatar) {
        state.jarvisAvatar.stopSpeaking();
      }
      reject(err);
    };
    
    audio.play().catch(reject);
  });
};

const pollTaskResult = async (taskId, timeoutMs = 120000) => {
  const start = Date.now();
  const statusUrl = `/api/tasks/${encodeURIComponent(taskId)}/status`;

  while (Date.now() - start < timeoutMs) {
    const response = await fetch(statusUrl, { 
      cache: "no-store",
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error("Task status failed.");
    }
    const task = await response.json();
    if (task.status === "completed") {
      return task.result || {};
    }
    if (["failed", "cancelled", "timeout"].includes(task.status)) {
      throw new Error(task.error || "Task failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Task timed out.");
};

const callChat = async (text) => {
  const { body } = buildPayload(text);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Request failed.");
  }
  return response.json();
};

const callChatWithTts = async (text) => {
  const { body } = buildLlmWithTtsPayload(text);
  const response = await fetch("/api/llm-with-tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Request failed.");
  }
  return response.json();
};

const speak = async (text) => {
  // Clean text before TTS - remove special chars, icons, markdown, etc.
  const cleanedText = cleanTextForTTS(text);
  if (!cleanedText) {
    console.log("Nothing to speak after text cleaning");
    return;
  }
  
  state.isSpeaking = true;
  updateStatus(elements.statusTts, "Speaking");
  if (state.config.ttsProvider === "server") {
    if (!requireToken("TTS")) {
      updateStatus(elements.statusTts, "Token required", true);
      return;
    }
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanedText,
          voice: "default",
          speed: 1.0,
          engine: "edge-tts",
        }),
      });
      if (!response.ok) {
        throw new Error("TTS request failed.");
      }
      const data = await response.json();
      const result = data.task_id ? await pollTaskResult(data.task_id) : data;
      const audio = result.audio || data.audio;
      const format = result.format || result.audio_format || data.format || data.audio_format || "mp3";
      if (!audio) {
        throw new Error("TTS response did not include audio.");
      }
      await playAudioFromBase64(audio, format);
      updateStatus(elements.statusTts, "Ready");
      return;
    } catch (error) {
      console.warn("TTS failed", error);
    }
  }

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = 1;
    
    // Start avatar speaking animation when speech actually starts
    utterance.onstart = () => {
      state.isSpeaking = true;  // Ensure state is set
      if (state.jarvisAvatar) {
        state.jarvisAvatar.setExpression("speaking");
        state.jarvisAvatar.startSpeaking();
      }
    };
    
    utterance.onend = () => {
      state.isSpeaking = false;
      updateStatus(elements.statusTts, "Ready");
      // Stop avatar speaking animation
      if (state.jarvisAvatar) {
        state.jarvisAvatar.stopSpeaking();
        state.jarvisAvatar.setExpression("neutral");
      }
    };
    
    utterance.onerror = () => {
      state.isSpeaking = false;
      updateStatus(elements.statusTts, "Error", true);
      // Stop avatar speaking animation on error
      if (state.jarvisAvatar) {
        state.jarvisAvatar.stopSpeaking();
        state.jarvisAvatar.setExpression("alert");
      }
    };
    
    speechSynthesis.speak(utterance);
  } else {
    state.isSpeaking = false;
    updateStatus(elements.statusTts, "Unavailable", true);
  }
};

const sendMessage = async (text) => {
  if (!text.trim()) {
    return;
  }
  if (!requireToken("chat")) {
    elements.sessionStatus.textContent = "Token required";
    return;
  }
  const assistantName = state.config.assistantName || "Jarvis";
  logMessage("User", text);
  elements.sessionStatus.textContent = "Thinking...";
  state.isThinking = true;
  
  // Avatar shows thinking gesture
  if (state.jarvisAvatar) {
    state.jarvisAvatar.tilt();
  }
  
  // Query RAG for context if collection is selected
  let ragContext = "";
  if (state.rag.currentCollection) {
    try {
      const ragResults = await queryRag(text);
      if (ragResults && ragResults.length > 0) {
        ragContext = "\n\n[Relevant Knowledge Base Context]:\n" + 
          ragResults.map((r, i) => `${i + 1}. ${r.content || r.text || r.document || ""}`).join("\n");
      }
    } catch (e) {
      console.warn("RAG query failed:", e);
    }
  }
  
  // Append RAG context to user message for LLM
  const messageWithContext = ragContext ? text + ragContext : text;
  
  state.conversation.push({ role: "user", content: text });
  elements.textInput.value = "";
  try {
    let reply = "";
    let audio = null;
    let format = "mp3";

    if (state.config.ttsProvider === "server" && state.config.llmWithTtsEndpoint) {
      const data = await callChatWithTts(messageWithContext);
      reply = data.llm_response || parseResponse(data);
      audio = data.audio;
      format = data.audio_format || "mp3";
    } else {
      const data = await callChat(messageWithContext);
      reply = parseResponse(data);
    }

    logMessage(assistantName, reply);
    state.conversation.push({ role: "assistant", content: reply });
    state.isThinking = false;
    elements.sessionStatus.textContent = "Standby";
    
    // Trigger avatar gesture based on response
    if (state.jarvisAvatar) {
      // Nod when responding
      state.jarvisAvatar.nod();
      
      // Happy expression for positive responses
      if (reply.match(/yes|sure|absolutely|of course|happy|great|excellent/i)) {
        state.jarvisAvatar.setExpression("happy");
      }
    }
    
    if (audio) {
      state.isSpeaking = true;
      await playAudioFromBase64(audio, format);
      state.isSpeaking = false;
    } else {
      speak(reply);
    }
  } catch (error) {
    state.isThinking = false;
    state.isSpeaking = false;
    elements.sessionStatus.textContent = "Error";
    logMessage("System", `Error: ${error.message}`);
    
    // Avatar shakes head on error
    if (state.jarvisAvatar) {
      state.jarvisAvatar.shake();
    }
  }
};

const initSpeechRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    updateStatus(elements.statusMic, "Unavailable", true);
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onstart = () => {
    state.isListening = true;
    updateStatus(elements.statusMic, "Listening");
    elements.micHint.textContent = "Listening...";
    elements.btnTalk.classList.add("active");
    
    // Avatar shows curious expression when listening
    if (state.jarvisAvatar) {
      state.jarvisAvatar.setExpression("curious");
    }
  };

  recognition.onend = () => {
    state.isListening = false;
    updateStatus(elements.statusMic, "Idle");
    elements.micHint.textContent = "Mic idle";
    elements.btnTalk.classList.remove("active");
    if (state.handsFree) {
      recognition.start();
    }
  };

  recognition.onerror = (event) => {
    updateStatus(elements.statusMic, "Error", true);
    elements.micHint.textContent = event.error || "Mic error";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.textInput.value = transcript;
    if (state.handsFree || state.isListening) {
      sendMessage(transcript);
    }
  };

  state.recognition = recognition;
};

const startListening = async () => {
  if (state.isListening) {
    return;
  }
  await ensureMicStream();
  if (state.config.sttProvider === "server") {
    startRecording();
    return;
  }
  state.recognition?.start();
};

const stopListening = () => {
  if (state.config.sttProvider === "server") {
    stopRecording();
    return;
  }
  state.recognition?.stop();
};

const ensureMicStream = async () => {
  if (state.micStream) {
    return;
  }
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    setupAnalyser(state.micStream);
  } catch (error) {
    updateStatus(elements.statusMic, "Blocked", true);
    logMessage("System", "Microphone access blocked.");
  }
};

const setupAnalyser = (stream) => {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  state.analyser = analyser;
  
  // Update AvatarRegistry with analyser if available
  if (typeof AvatarRegistry !== "undefined") {
    AvatarRegistry.setAnalyser(analyser);
  }
};

const startRecording = () => {
  if (!state.micStream) {
    return;
  }
  state.audioChunks = [];
  const recorder = new MediaRecorder(state.micStream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.audioChunks.push(event.data);
    }
  };
  recorder.onstop = async () => {
    const blob = new Blob(state.audioChunks, { type: "audio/webm" });
    await sendAudioForTranscription(blob);
  };
  recorder.start();
  state.mediaRecorder = recorder;
};

const stopRecording = () => {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
};

const sendAudioForTranscription = async (blob) => {
  if (!requireToken("speech services")) {
    updateStatus(elements.statusMic, "Token required", true);
    return;
  }
  try {
    const formData = new FormData();
    formData.append("audio", blob, "speech.webm");

    if (state.config.useVoiceChat && state.config.voiceChatEndpoint) {
      formData.append("model_id", state.config.model);
      const response = await fetch("/api/voice-chat", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      const transcript = data.transcribed_text || "";
      const reply = data.llm_response || "";
      if (transcript) {
        logMessage("User", transcript);
        state.conversation.push({ role: "user", content: transcript });
      }
      if (reply) {
        logMessage("Jarvis", reply);
        state.conversation.push({ role: "assistant", content: reply });
      }
      if (data.audio) {
        await playAudioFromBase64(data.audio, data.audio_format || "mp3");
      }
      return;
    }

    const response = await fetch("/api/stt", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    const result = data.task_id ? await pollTaskResult(data.task_id) : data;
    const transcript = result.text || data.text || "";
    if (transcript) {
      sendMessage(transcript);
    }
  } catch (error) {
    logMessage("System", "Transcription failed.");
  }
};

const drawAscii = () => {
  const now = Date.now();
  if (now > state.blinkAt) {
    state.blinkUntil = now + 140;
    state.blinkAt = now + 2200 + Math.random() * 2000;
  }
  const blink = now < state.blinkUntil;
  const mouthOpen = state.audioLevel > 0.12;

  const eyes = blink ? "  --  " : "  oo  ";
  const mouth = mouthOpen ? "  \\__/  " : "  ____  ";
  const lines = [
    "  .----.  ",
    " /      \\ ",
    `|${eyes}|`,
    "|        |",
    `|${mouth}|`,
    " \\______/",
  ];
  elements.asciiHead.textContent = lines.join("\n");
};

const drawAvatar = () => {
  const canvas = elements.headCanvas;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#0b1626";
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 120;
  const glow = 12 + state.audioLevel * 40;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20, 38, 60, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 209, 179, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + glow, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(90, 209, 179, 0.15)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const eyeOffset = 40;
  const eyeY = centerY - 30;
  ctx.fillStyle = "#9ff9e6";
  ctx.beginPath();
  ctx.arc(centerX - eyeOffset, eyeY, 10, 0, Math.PI * 2);
  ctx.arc(centerX + eyeOffset, eyeY, 10, 0, Math.PI * 2);
  ctx.fill();

  const mouthWidth = 70;
  const mouthOpen = 10 + state.audioLevel * 40;
  ctx.strokeStyle = "#5ad1b3";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - mouthWidth / 2, centerY + 45);
  ctx.quadraticCurveTo(
    centerX,
    centerY + 45 + mouthOpen,
    centerX + mouthWidth / 2,
    centerY + 45
  );
  ctx.stroke();
};

const updateAudioLevel = () => {
  // If speaking without an audio analyser, simulate audio levels
  if (state.isSpeaking && !state.analyser) {
    // Generate natural-looking mouth movement when speaking
    const base = 0.3 + Math.random() * 0.4;
    const variation = Math.sin(Date.now() / 100) * 0.2;
    state.audioLevel = Math.max(0, Math.min(1, base + variation));
    return;
  }
  
  if (!state.analyser) {
    state.audioLevel = Math.max(0, state.audioLevel - 0.02);
    return;
  }
  const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteFrequencyData(dataArray);
  const avg =
    dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  state.audioLevel = avg / 255;
};

const animateHead = () => {
  updateAudioLevel();
  
  // Update ASCII mode
  if (state.currentAvatarMode === "ascii") {
    drawAscii();
  }
  
  // Update Jarvis avatar if active
  if (state.jarvisAvatar) {
    state.jarvisAvatar.setAudioLevel(state.audioLevel);
    state.jarvisAvatar.setState({
      isListening: state.isListening,
      isSpeaking: state.isSpeaking,
      isThinking: state.isThinking,
    });
  } else if (state.currentAvatarMode !== "ascii") {
    // Fallback to simple canvas drawing
    drawAvatar();
  }
  
  requestAnimationFrame(animateHead);
};

const setHeadMode = (mode) => {
  state.currentAvatarMode = mode;
  
  if (mode === "ascii") {
    // ASCII terminal mode
    elements.asciiShell.style.display = "grid";
    elements.avatarShell.style.display = "none";
    if (state.jarvisAvatar) {
      state.jarvisAvatar.stop();
      state.jarvisAvatar = null;
    }
    return;
  }
  
  // Canvas-based avatar mode
  elements.asciiShell.style.display = "none";
  elements.avatarShell.style.display = "grid";
  
  // Initialize JarvisAvatar
  if (typeof JarvisAvatar !== "undefined" && !state.jarvisAvatar) {
    state.jarvisAvatar = new JarvisAvatar(elements.headCanvas);
    state.jarvisAvatar.start();
  }
};

const formatServiceState = (state) => {
  if (state === true) return "enabled";
  if (state === false) return "disabled";
  return "unknown";
};

const checkServer = async () => {
  updateStatus(elements.statusServer, "Checking...");
  if (!requireToken("server check")) {
    updateStatus(elements.statusServer, "Token required", true);
    return;
  }
  try {
    const response = await fetch("/api/server/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Server offline.");
    }
    const data = await response.json();
    const healthPayload = data.health?.payload || {};
    const status = healthPayload.status || "Online";
    updateStatus(elements.statusServer, status);
    
    // Avatar nods and shows happy when server is online
    if (state.jarvisAvatar) {
      state.jarvisAvatar.nod();
      state.jarvisAvatar.setExpression("happy");
      setTimeout(() => state.jarvisAvatar.setExpression("neutral"), 2000);
    }

    logMessage("System", `Server base URL: ${data.base_url || "unknown"}`);
    if (data.middleware?.payload?.status) {
      logMessage("System", `Middleware: ${data.middleware.payload.status}`);
    }
    const serviceStates = data.services?.payload?.service_states || {};
    if (Object.keys(serviceStates).length) {
      const lines = [
        `LLM: ${formatServiceState(serviceStates.llm)}`,
        `STT: ${formatServiceState(serviceStates.speech_to_text)}`,
        `TTS: ${formatServiceState(serviceStates.text_to_speech)}`,
        `Voice Chat: ${formatServiceState(serviceStates.voice_to_voice)}`,
      ];
      logMessage("System", `Services: ${lines.join(", ")}`);
    }
  } catch (error) {
    updateStatus(elements.statusServer, "Offline", true);
    logMessage("System", `Server check failed: ${error.message}`);
    
    // Avatar shakes head when server is offline
    if (state.jarvisAvatar) {
      state.jarvisAvatar.shake();
      state.jarvisAvatar.setExpression("alert");
      setTimeout(() => state.jarvisAvatar.setExpression("neutral"), 2000);
    }
  }
};

const dataUrlToBlob = (dataUrl) => {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
};

const recordVoiceSample = async (durationMs = 2000) => {
  await ensureMicStream();
  if (!state.micStream) {
    throw new Error("Microphone unavailable.");
  }
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(state.micStream);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(new Error("Recording failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  });
};

const captureFaceSample = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  const video = document.createElement("video");
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  stream.getTracks().forEach((track) => track.stop());
  return dataUrlToBlob(dataUrl);
};

const enrollIdentity = async (modality, blob, filename) => {
  const formData = new FormData();
  if (modality === "voice") {
    formData.append("audio", blob, filename || "voice.webm");
  } else {
    formData.append("image", blob, filename || "face.png");
  }
  formData.append("modality", modality);

  const response = await fetch("/api/identity/enroll", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
};

const verifyIdentityRequest = async (voiceBlob, faceBlob) => {
  const formData = new FormData();
  if (voiceBlob) {
    formData.append("audio", voiceBlob, "voice.webm");
  }
  if (faceBlob) {
    formData.append("image", faceBlob, "face.png");
  }
  const response = await fetch("/api/identity/verify", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
};

const enrollVoice = async () => {
  if (!requireToken("identity enrollment")) {
    elements.voiceStatus.textContent = "Token required";
    return;
  }
  try {
    elements.voiceStatus.textContent = "Recording...";
    const blob = await recordVoiceSample(2500);
    await enrollIdentity("voice", blob, "voice.webm");
    state.identity.voiceEnrolled = true;
    localStorage.setItem("jarvisVoiceEnrolled", "true");
    elements.voiceStatus.textContent = "Enrolled";
  } catch (error) {
    elements.voiceStatus.textContent = "Failed";
  }
};

const enrollFace = async () => {
  if (!requireToken("identity enrollment")) {
    elements.faceStatus.textContent = "Token required";
    return;
  }
  try {
    elements.faceStatus.textContent = "Capturing...";
    const blob = await captureFaceSample();
    await enrollIdentity("face", blob, "face.png");
    state.identity.faceEnrolled = true;
    localStorage.setItem("jarvisFaceEnrolled", "true");
    elements.faceStatus.textContent = "Enrolled";
  } catch (error) {
    elements.faceStatus.textContent = "Failed";
  }
};

const verifyIdentity = async () => {
  if (!requireToken("identity verification")) {
    elements.verifyResult.textContent = "Token required.";
    return;
  }
  if (!state.identity.voiceEnrolled && !state.identity.faceEnrolled) {
    elements.verifyResult.textContent = "No enrollment data.";
    return;
  }
  elements.verifyResult.textContent = "Verifying...";
  try {
    const voiceBlob = state.identity.voiceEnrolled
      ? await recordVoiceSample(1500)
      : null;
    const faceBlob = state.identity.faceEnrolled
      ? await captureFaceSample()
      : null;
    const result = await verifyIdentityRequest(voiceBlob, faceBlob);
    if (result.match && result.match.user_id) {
      elements.verifyResult.textContent = `Verified user ${result.match.user_id} (${(
        result.match.score || 0
      ).toFixed(2)})`;
    } else {
      elements.verifyResult.textContent = "No match.";
    }
  } catch (error) {
    elements.verifyResult.textContent = "Verification failed.";
  }
};

const bindEvents = () => {
  elements.btnSend.addEventListener("click", () =>
    sendMessage(elements.textInput.value)
  );
  elements.textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(elements.textInput.value);
    }
  });
  elements.btnTalk.addEventListener("mousedown", startListening);
  elements.btnTalk.addEventListener("mouseup", stopListening);
  elements.btnTalk.addEventListener("mouseleave", stopListening);
  elements.btnStop.addEventListener("click", () => {
    stopListening();
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }
  });
  elements.industrySelect.addEventListener("change", (event) => {
    const selected = state.config.industries.find(
      (industry) => industry.id === event.target.value
    );
    state.currentIndustry = selected || state.config.industries[0];
    // Save preference to localStorage
    if (state.currentIndustry) {
      localStorage.setItem("jarvisSelectedIndustry", state.currentIndustry.id);
    }
    updateIndustrySummary();
  });
  elements.headMode.addEventListener("change", (event) =>
    setHeadMode(event.target.value)
  );
  elements.handsfreeToggle.addEventListener("change", (event) => {
    state.handsFree = event.target.checked;
    if (state.handsFree) {
      startListening();
    } else {
      stopListening();
    }
  });
  elements.btnCheckServer.addEventListener("click", checkServer);
  
  // Sidebar toggle
  elements.sidebarToggle.addEventListener("click", () => {
    const isCollapsed = elements.sidebar.classList.toggle("collapsed");
    elements.app.classList.toggle("sidebar-collapsed", isCollapsed);
    localStorage.setItem("jarvisSidebarCollapsed", isCollapsed ? "true" : "false");
  });
  
  elements.btnClear.addEventListener("click", () => {
    elements.terminalLog.innerHTML = "";
    state.conversation = [];
  });
  
  // Toggle system log visibility
  if (elements.btnShowLog) {
    elements.btnShowLog.addEventListener("click", () => {
      if (elements.systemLogPanel) {
        const isHidden = elements.systemLogPanel.classList.toggle("hidden");
        elements.btnShowLog.textContent = isHidden ? "Show Log" : "Hide Log";
      }
    });
  }
  elements.btnEnrollVoice.addEventListener("click", enrollVoice);
  elements.btnEnrollFace.addEventListener("click", enrollFace);
  elements.btnVerify.addEventListener("click", verifyIdentity);
  
  // Mouse tracking for avatar eyes
  elements.headCanvas.addEventListener("mousemove", (event) => {
    if (state.jarvisAvatar) {
      const rect = elements.headCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      state.jarvisAvatar.lookAt(x, y);
    }
  });
  
  // Click to trigger wave gesture
  elements.headCanvas.addEventListener("click", () => {
    if (state.jarvisAvatar) {
      state.jarvisAvatar.wave();
    }
  });
};

const initElements = () => {
  elements.industrySelect = document.getElementById("industry-select");
  elements.statusServer = document.getElementById("status-server");
  elements.statusMic = document.getElementById("status-mic");
  elements.statusTts = document.getElementById("status-tts");
  elements.btnCheckServer = document.getElementById("btn-check-server");
  elements.btnSend = document.getElementById("btn-send");
  elements.btnTalk = document.getElementById("btn-talk");
  elements.btnStop = document.getElementById("btn-stop");
  elements.btnClear = document.getElementById("btn-clear");
  elements.btnShowLog = document.getElementById("btn-show-log");
  elements.systemLog = document.getElementById("system-log");
  elements.systemLogPanel = document.getElementById("system-log-panel");
  elements.btnEnrollVoice = document.getElementById("btn-enroll-voice");
  elements.btnEnrollFace = document.getElementById("btn-enroll-face");
  elements.btnVerify = document.getElementById("btn-verify");
  elements.voiceStatus = document.getElementById("voice-status");
  elements.faceStatus = document.getElementById("face-status");
  elements.verifyResult = document.getElementById("verify-result");
  elements.headMode = document.getElementById("head-mode");
  elements.handsfreeToggle = document.getElementById("handsfree-toggle");
  elements.textInput = document.getElementById("text-input");
  elements.terminalLog = document.getElementById("terminal-log");
  elements.sessionStatus = document.getElementById("session-status");
  elements.micHint = document.getElementById("mic-hint");
  elements.asciiHead = document.getElementById("ascii-head");
  elements.asciiShell = document.getElementById("ascii-shell");
  elements.avatarShell = document.getElementById("avatar-shell");
  elements.headCanvas = document.getElementById("head-canvas");
  elements.industrySummary = document.getElementById("industry-summary");
  elements.assistantTitle = document.getElementById("assistant-title");
  elements.sidebar = document.getElementById("sidebar");
  elements.sidebarToggle = document.getElementById("sidebar-toggle");
  elements.app = document.querySelector(".app");
  // RAG elements
  elements.ragCollection = document.getElementById("rag-collection");
  elements.ragStatus = document.getElementById("rag-status");
  elements.btnRagRefresh = document.getElementById("btn-rag-refresh");
  elements.btnRagDocs = document.getElementById("btn-rag-docs");
  elements.btnRagUpload = document.getElementById("btn-rag-upload");
  elements.ragFileInput = document.getElementById("rag-file-input");
};

const initEnrollmentState = () => {
  if (localStorage.getItem("jarvisVoiceEnrolled") === "true") {
    state.identity.voiceEnrolled = true;
    elements.voiceStatus.textContent = "Enrolled";
  }
  if (localStorage.getItem("jarvisFaceEnrolled") === "true") {
    state.identity.faceEnrolled = true;
    elements.faceStatus.textContent = "Enrolled";
  }
};

// =====================
// RAG Knowledge Base Functions
// =====================

const loadRagCollections = async () => {
  if (!requireToken("RAG")) {
    elements.ragStatus.textContent = "Token required";
    return;
  }
  
  try {
    elements.ragStatus.textContent = "Loading...";
    const response = await fetch("/api/rag/collections");
    
    if (!response.ok) {
      throw new Error("Failed to load collections");
    }
    
    const data = await response.json();
    state.rag.collections = data.collections || [];
    
    // Populate dropdown
    elements.ragCollection.innerHTML = '<option value="">-- Select --</option>';
    state.rag.collections.forEach((coll) => {
      const option = document.createElement("option");
      option.value = coll.id;
      option.textContent = `${coll.name || coll.id} (${coll.doc_count || 0})`;
      elements.ragCollection.appendChild(option);
    });
    
    // Restore saved selection
    const savedCollection = localStorage.getItem("jarvisRagCollection");
    if (savedCollection && state.rag.collections.find(c => c.id === savedCollection)) {
      elements.ragCollection.value = savedCollection;
      state.rag.currentCollection = savedCollection;
    }
    
    elements.ragStatus.textContent = `${state.rag.collections.length} collection(s)`;
  } catch (error) {
    console.error("RAG collections error:", error);
    elements.ragStatus.textContent = "Connection failed";
  }
};

const loadRagDocuments = async () => {
  if (!state.rag.currentCollection) {
    logMessage("System", "Please select a collection first.");
    return;
  }
  
  if (!requireToken("RAG")) return;
  
  try {
    const response = await fetch(
      `/api/rag/collections/${encodeURIComponent(state.rag.currentCollection)}/documents`
    );
    
    if (!response.ok) {
      throw new Error("Failed to load documents");
    }
    
    const data = await response.json();
    state.rag.documents = data.documents || [];
    
    // Display documents in conversation
    const docList = state.rag.documents.map((d, i) => 
      `${i + 1}. ${d.source || d.document_id}`
    ).join("\n");
    
    const assistantName = state.config.assistantName || "Jarvis";
    logMessage(assistantName, 
      `**Collection: ${state.rag.currentCollection}**\n` +
      `Documents (${state.rag.documents.length}):\n${docList || "No documents found."}`
    );
  } catch (error) {
    console.error("RAG documents error:", error);
    logMessage("System", `Error loading documents: ${error.message}`);
  }
};

const uploadRagDocument = async (file) => {
  if (!state.rag.currentCollection) {
    logMessage("System", "Please select a collection first.");
    return;
  }
  
  if (!requireToken("RAG")) return;
  
  try {
    elements.ragStatus.textContent = "Uploading...";
    const assistantName = state.config.assistantName || "Jarvis";
    
    // First extract text from document
    const formData = new FormData();
    formData.append("file", file);
    
    const extractResponse = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });
    
    if (!extractResponse.ok) {
      throw new Error("Failed to extract document");
    }
    
    const extractData = await extractResponse.json();
    const content = extractData.text || extractData.content || "";
    
    if (!content) {
      throw new Error("No text extracted from document");
    }
    
    // Now add to RAG collection
    const addResponse = await fetch(
      `/api/rag/collections/${encodeURIComponent(state.rag.currentCollection)}/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collection_id: state.rag.currentCollection,
          documents: [
            {
              content: content,
              source: file.name,
              metadata: {
                filename: file.name,
                size: file.size,
                type: file.type,
                uploaded_at: new Date().toISOString(),
              },
            },
          ],
        }),
      }
    );
    
    if (!addResponse.ok) {
      throw new Error("Failed to add document to collection");
    }
    
    const addData = await addResponse.json();
    elements.ragStatus.textContent = "Upload complete";
    logMessage(assistantName, `Document "${file.name}" added to ${state.rag.currentCollection}.`);
    
    // Refresh collections to update count
    await loadRagCollections();
  } catch (error) {
    console.error("RAG upload error:", error);
    elements.ragStatus.textContent = "Upload failed";
    logMessage("System", `Error uploading document: ${error.message}`);
  }
};

const queryRag = async (query) => {
  if (!state.rag.currentCollection) {
    return null;
  }
  
  if (!requireToken("RAG")) return null;
  
  try {
    const response = await fetch("/api/rag/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query,
        collection_id: state.rag.currentCollection,
        max_results: 3,
      }),
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.results || data.documents || [];
  } catch (error) {
    console.error("RAG query error:", error);
    return null;
  }
};

const bindRagEvents = () => {
  elements.ragCollection.addEventListener("change", (event) => {
    state.rag.currentCollection = event.target.value || null;
    if (state.rag.currentCollection) {
      localStorage.setItem("jarvisRagCollection", state.rag.currentCollection);
    } else {
      localStorage.removeItem("jarvisRagCollection");
    }
  });
  
  elements.btnRagRefresh.addEventListener("click", loadRagCollections);
  elements.btnRagDocs.addEventListener("click", loadRagDocuments);
  elements.btnRagUpload.addEventListener("click", () => {
    elements.ragFileInput.click();
  });
  
  elements.ragFileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) {
      await uploadRagDocument(file);
      event.target.value = ""; // Reset for next upload
    }
  });
};

const init = async () => {
  initElements();
  await loadConfig();
  populateIndustries();
  initEnrollmentState();
  initSpeechRecognition();
  
  // Restore sidebar state
  if (localStorage.getItem("jarvisSidebarCollapsed") === "true") {
    elements.sidebar.classList.add("collapsed");
    elements.app.classList.add("sidebar-collapsed");
  }
  
  bindEvents();
  bindRagEvents();
  
  // Initialize head mode (default to avatar)
  const initialMode = elements.headMode.value || "avatar";
  elements.headMode.value = initialMode;
  setHeadMode(initialMode);
  requestAnimationFrame(animateHead);
  
  // Wave gesture on startup
  setTimeout(() => {
    if (state.jarvisAvatar) {
      state.jarvisAvatar.wave();
    }
  }, 500);
  
  checkServer();
  
  // Load RAG collections after server check
  setTimeout(loadRagCollections, 1000);
  
  // Display greeting message from config - greeting shows as assistant message
  const assistantName = state.config.assistantName || "Jarvis";
  const greeting = state.config.greetingMessage || `${assistantName} console ready.`;
  logMessage(assistantName, greeting);
};

document.addEventListener("DOMContentLoaded", init);
