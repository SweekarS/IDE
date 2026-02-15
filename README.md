# IDE AI Assistant
Vibe Coders -> Engineering Minds

## What This Project Is
This project is a browser-based mini IDE built with React and Vite. It combines a code editor, file explorer, terminal simulation, and an AI assistant panel in one interface.

## What It Does
- Lets users open, edit, and navigate files in an IDE-style layout.
- Provides AI-assisted modes in the side panel:
  - `Code Buddy` for beginner-friendly code explanations.
  - `Reviewer` for practical code review feedback.
  - `Vibe Coder` for prompt-based edits to the active file.
  - `Rubber Ducky` voice mode for spoken debugging conversations.
- Supports speech input and ElevenLabs text-to-speech output for voice interaction.

## Why We Built It
We built this to make coding support feel native inside an editor-like experience, not separate from it. The goal is to help users learn, debug, and iterate faster by combining editing, AI guidance, and voice interaction in one place.

## Technologies Used (and Why)
- **React + TypeScript**: component-based UI with type safety for faster, safer iteration.
- **Vite**: fast development server and simple production builds.
- **Tailwind CSS**: rapid styling for an IDE-like interface and responsive layout.
- **Radix UI + custom UI components**: accessible primitives for consistent interactive elements.
- **Gemini API (`@google/generative-ai`)**: powers code analysis, review, and prompt-driven code generation.
- **Azure OpenAI**: used as the Vibe Coder agent in this project to interpret prompts and generate code-focused responses in an enterprise-ready setup.
- **Web Speech API**: browser-native speech recognition for voice input.
- **ElevenLabs API**: natural-sounding voice output for Rubber Ducky responses.
- **Lucide React icons**: lightweight iconography for editor and assistant controls.

## Run Locally
```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173` (or `http://127.0.0.1:5173`)
