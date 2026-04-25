# Beep.AI.Jarvis

[![License](https://img.shields.io/github/license/the-tech-idea/beep.ai.jarvis)](LICENSE.txt)
[![Issues](https://img.shields.io/github/issues/the-tech-idea/beep.ai.jarvis)](https://github.com/the-tech-idea/beep.ai.jarvis/issues)
[![Stars](https://img.shields.io/github/stars/the-tech-idea/beep.ai.jarvis?style=social)](https://github.com/the-tech-idea/beep.ai.jarvis)

**Beep.AI.Jarvis** is a browser-first talking head experience that connects to Beep AI Server, providing real-time speech recognition, TTS, and interactive avatars for advanced conversational AI applications.

---

## Features
- Live mic input (SpeechRecognition or server-based STT)
- TTS response (browser or server endpoint)
- Two talking head modes: ASCII terminal + audio-reactive avatar
- Industry profile switching with custom system prompts
- Voice/face enrollment with AI.Server identity mapping

---

## Quick Start

1. Update `config.json` with your Beep AI Server URL and API token.
2. Run `run.bat` (Windows) or `run.sh` (Linux/macOS) to start a local web server.
3. Open `http://localhost:8080` in a modern Chromium browser.
4. Click "Check Server" to validate connectivity.
5. Hold the "Hold to Talk" button and speak.
6. Open `http://localhost:8080/admin` to update settings and enroll identity.

---

## Local Launcher
- `run.bat` (Windows) downloads embedded Python, creates `.venv`, installs requirements, and runs a local server.
- `run.sh` (Linux/macOS) creates `.venv`, installs requirements, and runs a local server.
- Set `JARVIS_IDENTITY=1` to install optional identity dependencies from `requirements-identity.txt`.
- Windows installs **binary wheels only** to avoid compiling; Linux/macOS installs normally.
- Set `JARVIS_PORT=8081` (or pass a port as the first argument) to change the server port.

---

## Configuration

`config.json` supports:
- `serverBaseUrl`: AI Server URL (example: `http://localhost:5000`)
- `middlewareBaseUrl`: optional compatibility override; normally use the same root as `serverBaseUrl`
- `chatMode`: `openai` (recommended) or `middleware` for custom non-OpenAI-compatible chat adapters
- `chatEndpoint`: used when `chatMode=middleware`
- `openAiEndpoint`: used when `chatMode=openai`
- `model`: model ID for chat
- `appUserId`: scoped end-user ID Jarvis sends to middleware-backed RAG/document routes
- `appUserRole`: scoped end-user role sent with middleware-backed RAG/document routes
- `appUserEmail`: optional scoped end-user email sent with RAG/document routes
- `apiToken`: optional bearer token
- `sttProvider`: `browser` or `server`
- `ttsProvider`: `browser` or `server`
- `llmWithTtsEndpoint`: `/ai-middleware/api/services/llm-with-tts` (returns text + audio)
- `voiceChatEndpoint`: `/ai-middleware/api/services/voice-chat` (voice -> STT -> LLM -> TTS)
- `taskStatusEndpoint`: `/ai-middleware/api/playground/tasks/{taskId}/status` (used for STT/TTS task polling)
- `identityEnrollEndpoint`: `/api/v1/identity/enroll`
- `identityVerifyEndpoint`: `/api/v1/identity/verify`
- `useVoiceChat`: when true, mic input uses Jarvis's local `/api/voice-chat` proxy
- `industries`: list of industry profiles (id/label/systemPrompt/ragCollection)

---

## Notes
- Voice/face enrollment is mapped to AI.Server users via the identity endpoints.
- Chat uses Jarvis's local `/api/chat` proxy and targets AI Server's OpenAI-compatible `/v1/chat/completions` route by default.
- STT/TTS/RAG/document calls go through Jarvis's local `/api/...` proxies so browser clients do not have to call AI.Server or AIMiddleware routes directly.
- Voice enrollment uses WebM audio; install `ffmpeg` if decoding fails on your platform.
- If identity packages fail to build on Windows, keep `JARVIS_IDENTITY` off and run identity on a machine with prebuilt wheels.

---

## Contributing

Contributions are welcome! Please open issues or submit pull requests via [GitHub](https://github.com/the-tech-idea/beep.ai.jarvis).

## License

This project is licensed under the terms of the [MIT License](LICENSE.txt).

---

## Project Links
- [GitHub Repository](https://github.com/the-tech-idea/beep.ai.jarvis)
- [Issue Tracker](https://github.com/the-tech-idea/beep.ai.jarvis/issues)
