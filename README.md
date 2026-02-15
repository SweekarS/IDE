# 🛠️ IDE AI Assistant
⚡ Vibe Coding Meets Engineering Rigor

## 📌 What This Project Is
This project is an AI-first IDE built to deepen the engineering depth. It stands out by giving developers continuous guidance without requiring extra prompting for core workflows. Our mission is simple: help vibe coders become engineers by letting them build fast and understand deeply, in the way they prefer.

## 🚀 What It Does
- Delivers a complete IDE-style workflow: file navigation, code editing, terminal simulation, and in-context AI assistance.
- Provides three core modes designed to work together:
  - 🔍 **Reviewer Mode**: automatically reviews the currently active file without prompting.
  - 📘 **Learn Mode**: automatically explains what the active file’s code does, without prompting.
  - ⚡ **Vibe Code Mode**: applies prompt-driven code changes, including improvements suggested by Reviewer Mode.
- Adds 🐤 **Rubber Ducky Voice Mode** for learning and debugging through speech-based conversation.
- Enables voice interaction with speech input and ElevenLabs text-to-speech output.

## 🎯 Why We Built It
We built this to close the gap between “vibe coding” and disciplined engineering. The product is designed to help developers ship faster while maintaining technical rigor through guided reviews, autonomous assistance, and conversational debugging.

## 🧱 Technologies Used (and Why)
- **React + TypeScript**: component-based UI with type safety for faster, safer iteration.
- **Vite**: fast development server and simple production builds.
- **Tailwind CSS**: rapid styling for an IDE-like interface and responsive layout.
- **Radix UI + custom UI components**: accessible primitives for consistent interactive elements.
- **Gemini API (`@google/generative-ai`)**: powers code analysis, review, and prompt-driven code generation.
- **Azure OpenAI**: used as the Vibe Coder agent in this project to interpret prompts and generate code-focused responses in an enterprise-ready setup.
- **Web Speech API**: browser-native speech recognition for voice input.
- **ElevenLabs API**: natural-sounding voice output for Rubber Ducky responses.
- **Lucide React icons**: lightweight iconography for editor and assistant controls.

## ▶️ Run Locally
```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173` (or `http://127.0.0.1:5173`)
