import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Sparkles, CheckCircle2, Wand2, WandSparkles, Mic, MicOff, Square } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useSpeechRecognition } from "../hooks/UseSpeechRecognition";
import { useTextToSpeech } from "../hooks/UseTextToSpeech";

interface AIPanelProps {
  ideMode?: "dark" | "light";
  code: string;
  fileName: string;
  selectedCode: string;
  onApplyActiveFileChange: (newCode: string) => void;
}

type AIPanelMode = "reviewer" | "teacher" | "vibe" | "voice";
type PythonFunctionBlock = { functionName: string; source: string };

interface VibeResponse {
  summary?: string;
  updatedContent?: string;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

type RubberDuckyStatus = "idle" | "listening" | "processing" | "speaking";

interface ConversationMessage {
  role: "user" | "model";
  content: string;
}

const RUBBER_DUCKY_EXIT_PHRASES = ["stop", "done", "end session", "that's all", "we're done"];

export function AIPanel({ ideMode = "dark", code, fileName, selectedCode, onApplyActiveFileChange }: AIPanelProps) {
  const [explanation, setExplanation] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mode, setMode] = useState<AIPanelMode>("teacher");
  const [vibePrompt, setVibePrompt] = useState("");
  const [lastGeminiResponse, setLastGeminiResponse] = useState("");
  const [statusMessage, setStatusMessage] = useState<string>("Ready");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const isDarkMode = ideMode === "dark";
  const analysisRunRef = useRef(0);
  const { isListening, transcript, supported: speechSupported, start, stop } = useSpeechRecognition();
  const { speak, isSpeaking, supported: ttsSupported } = useTextToSpeech();

  const [sessionActive, setSessionActive] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [rubberDuckyStatus, setRubberDuckyStatus] = useState<RubberDuckyStatus>("idle");
  const rubberDuckyContextRef = useRef<{ fileName: string; code: string } | null>(null);
  const pendingTranscriptProcessRef = useRef(false);

  const normalizeIndent = (line: string) =>
    line.replace(/\t/g, "    ").match(/^\s*/)?.[0].length || 0;

  const getModel = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing VITE_GEMINI_API_KEY in environment.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  };

  const getRubberDuckySystemInstruction = useCallback(
    (file: string, codeContent: string) => {
      const codeSnippet = codeContent.trim()
        ? `\n\nHere is the developer's code from file "${file}":\n\`\`\`\n${codeContent}\n\`\`\``
        : "";
      return `You are a rubber duck for rubber duck debugging. The developer is explaining their code/problem to you.
Your job is to help them think through the solution by asking guiding questions-never give direct answers or write code.
Ask one or two short, thought-provoking questions at a time. Be conversational and encouraging.
Keep responses brief (1-3 sentences) so they can be spoken naturally.${codeSnippet}`;
    },
    []
  );

  const startRubberDuckySession = useCallback(() => {
    const codeContext = selectedCode.trim() ? selectedCode : code;
    rubberDuckyContextRef.current = { fileName, code: codeContext };
    setSessionActive(true);
    setConversationHistory([]);
    setRubberDuckyStatus("idle");
    setVoiceTranscript("");
  }, [fileName, code, selectedCode]);

  const endRubberDuckySession = useCallback(() => {
    setSessionActive(false);
    setConversationHistory([]);
    setRubberDuckyStatus("idle");
    setVoiceTranscript("");
    rubberDuckyContextRef.current = null;
    pendingTranscriptProcessRef.current = false;
  }, []);

  const processRubberDuckyTranscript = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed) return;

      const shouldExit = RUBBER_DUCKY_EXIT_PHRASES.some((p) =>
        trimmed.toLowerCase().includes(p)
      );
      if (shouldExit) {
        endRubberDuckySession();
        return;
      }

      setConversationHistory((prev) => [...prev, { role: "user", content: trimmed }]);
      setRubberDuckyStatus("processing");

      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          setConversationHistory((prev) => [
            ...prev,
            { role: "model", content: "Set VITE_GEMINI_API_KEY to use Rubber Ducky." },
          ]);
          setRubberDuckyStatus("idle");
          return;
        }

        const ctx = rubberDuckyContextRef.current ?? { fileName, code };
        const systemInstruction = getRubberDuckySystemInstruction(ctx.fileName, ctx.code);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction,
        });

        const prevHistory = conversationHistory;
        const geminiHistory = prevHistory.map((m) => ({
          role: m.role,
          parts: [{ text: m.content }],
        }));

        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessage(trimmed);
        const response = result.response;
        const aiText = response.text()?.trim() ?? "I didn't catch that. Can you say more?";

        setConversationHistory((prev) => [...prev, { role: "model", content: aiText }]);
        setRubberDuckyStatus("speaking");

        await speak(aiText);

        setRubberDuckyStatus("idle");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Something went wrong. Try again.";
        setConversationHistory((prev) => [
          ...prev,
          { role: "model", content: msg.includes("VITE_GEMINI_API_KEY") ? "Set VITE_GEMINI_API_KEY to use Rubber Ducky." : msg },
        ]);
        setRubberDuckyStatus("idle");
      }
    },
    [conversationHistory, endRubberDuckySession, fileName, code, getRubberDuckySystemInstruction, speak]
  );
  
  const extractPythonFunctions = (codeContent: string): PythonFunctionBlock[] => {
    const lines = codeContent.split("\n");
    const functions: PythonFunctionBlock[] = [];

    let i = 0;
    while (i < lines.length) {
      const defMatch = lines[i].match(/^(\s*)def\s+([A-Za-z_]\w*)\s*\(/);
      if (!defMatch) {
        i += 1;
        continue;
      }

      let start = i;
      const defIndent = normalizeIndent(lines[i]);

      while (start > 0) {
        const prevLine = lines[start - 1];
        if (!prevLine.trim()) {
          break;
        }
        const decoratorMatch = prevLine.match(/^(\s*)@/);
        if (!decoratorMatch || normalizeIndent(prevLine) !== defIndent) {
          break;
        }
        start -= 1;
      }

      let end = i + 1;
      while (end < lines.length) {
        const currentLine = lines[end];
        if (!currentLine.trim()) {
          end += 1;
          continue;
        }
        if (normalizeIndent(currentLine) <= defIndent) {
          break;
        }
        end += 1;
      }

      functions.push({
        functionName: defMatch[2],
        source: lines.slice(start, end).join("\n"),
      });

      i = end;
    }

    return functions;
  };

  const buildBatchPrompt = (
    modeValue: AIPanelMode,
    batch: PythonFunctionBlock[],
    name: string
  ) => {
    const batchSource = batch
      .map(
        (fn, index) =>
          `Function ${index + 1} name: ${fn.functionName}\nFunction ${index + 1} source:\n${fn.source}`
      )
      .join("\n\n---\n\n");

    if (modeValue === "teacher") {
      return `You are a programming teacher.
Analyze these Python functions from file "${name}" in a beginner-friendly way.
Return only a JSON array. Each item must include "functionName" and "explanation".
Keep each explanation concise (max 2 lines) and mention the concept demonstrated.

Response format:
[
  {"functionName":"function_name", "explanation":"clear two-line teaching explanation"}
]

Functions:
${batchSource}`;
    }

    return `You are a senior code reviewer.
Review these Python functions from file "${name}".
Return only a JSON array. Each item must include "functionName" and "explanation".
Keep each explanation concise and include one practical review point (correctness, readability, or maintainability).

Response format:
[
  {"functionName":"function_name", "explanation":"concise review insight"}
]

Functions:
${batchSource}`;
  };

  const parseJsonFromModelText = (text: string): Array<{ functionName: string; explanation: string }> => {
    const cleaned = text.replace(/```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const asArray = Array.isArray(parsed) ? parsed : [parsed];

    asArray.forEach((item) => {
      if (
        !item ||
        typeof item.functionName !== "string" ||
        typeof item.explanation !== "string"
      ) {
        throw new Error("Invalid response shape");
      }
    });

    return asArray;
  };

  const analyzeSelectedSnippet = async (snippet: string, name: string) => {
    if (!snippet.trim()) {
      setExplanation("Select some code in the editor, then click the icon to analyze it.");
      return;
    }

    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setIsAnalyzing(true);
    setExplanation("Analyzing selected code in Code Buddy mode...");
    setLastGeminiResponse("");
    const genAI = new GoogleGenerativeAI("AIzaSyBLzpDN_C2TsvX70n22V8eqfpLEBXRqZ7Q");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const extractedFunctions = extractPythonFunctions(snippet);
    if (extractedFunctions.length > 0) {
      const batchSize = 5;
      for (let i = 0; i < extractedFunctions.length; i += batchSize) {
        if (analysisRunRef.current !== runId) {
          return;
        }
        const batch = extractedFunctions.slice(i, i + batchSize);
        try {
          const prompt = buildBatchPrompt("teacher", batch, `${name} (selected)`);
          const result = await model.generateContent(prompt);
          const response = await result.response;
          setLastGeminiResponse((prev) =>
            prev ? `${prev}\n\n${response.text().trim()}` : response.text().trim()
          );
          const parsed = parseJsonFromModelText(response.text());
          const parsedByName = new Map(parsed.map((item) => [item.functionName, item.explanation]));
          setExplanation((prev) => {
            const batchLines = batch.map((fn) => {
              const explanationText = parsedByName.get(fn.functionName) || "Unable to analyze this function.";
              return `<b>${fn.functionName}:</b> ${explanationText}`;
            });
            return `${prev}\n${batchLines.join("\n")}`;
          });
        } catch {
          setExplanation((prev) => {
            const batchLines = batch.map(
              (fn) => `<b>${fn.functionName}:</b> Unable to analyze this function.`
            );
            return `${prev}\n${batchLines.join("\n")}`;
          });
        }
      }
      if (analysisRunRef.current === runId) {
        setIsAnalyzing(false);
      }
      return;
    }

    try {
      const prompt = `You are a programming teacher.
Analyze only the selected Python code from file "${name}".
Explain what it does in 4 concise bullet points.
Mention one improvement suggestion.
Return plain text only.

Selected code:
${snippet}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      setLastGeminiResponse(response.text().trim());
      setExplanation(`### Selected Code Insight\n${response.text().trim()}`);
    } catch {
      setExplanation("Unable to analyze selected code.");
    } finally {
      if (analysisRunRef.current === runId) {
        setIsAnalyzing(false);
      }
    }
  };

  const analyzeCode = async (codeContent: string, name: string) => {
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setIsAnalyzing(true);
    setExplanation("");
    setLastGeminiResponse("");
    const extractedFunctions = extractPythonFunctions(codeContent);
    if (extractedFunctions.length === 0) {
      setExplanation("No Python functions found for analysis.");
      setIsAnalyzing(false);
      return;
    }

    const batchSize = 5;

    setExplanation(
      `Analyzing function(s) in batch(es) using ${
        mode === "teacher" ? "Code Buddy" : "Reviewer"
      } mode...`
    );

    const model = getModel();
    
    for (let i = 0; i < extractedFunctions.length; i += batchSize) {
      if (analysisRunRef.current !== runId) {
        return;
      }

      const batch = extractedFunctions.slice(i, i + batchSize);

      try {
        const prompt = buildBatchPrompt(mode, batch, name);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        setLastGeminiResponse((prev) =>
          prev ? `${prev}\n\n${response.text().trim()}` : response.text().trim()
        );
        const parsed = parseJsonFromModelText(response.text());
        const parsedByName = new Map(parsed.map((item) => [item.functionName, item.explanation]));

        setExplanation((prev) => {
          const batchLines = batch.map((fn) => {
            const explanationText = parsedByName.get(fn.functionName) || "Unable to analyze this function.";
            return `<b>${fn.functionName}:</b> ${explanationText}`;
          });
          return `${prev}\n${batchLines.join("\n")}`;
        });
      } catch {
        setExplanation((prev) => {
          const batchLines = batch.map(
            (fn) => `<b>${fn.functionName}:</b> Unable to analyze this function.`
          );
          return `${prev}\n${batchLines.join("\n")}`;
        });
      }
    }

    if (analysisRunRef.current === runId) {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (mode === "vibe" || mode === "voice") {
      return;
    }
    const timer = setTimeout(() => {
      void analyzeCode(code, fileName);
    }, 1500);

    return () => {
      clearTimeout(timer);
      analysisRunRef.current += 1;
    };
  }, [code, fileName, mode]);

  useEffect(() => {
    if (isListening) {
      setVoiceTranscript(transcript);
    }
  }, [isListening, transcript]);

  useEffect(() => {
    if (!isListening && pendingTranscriptProcessRef.current && sessionActive && mode === "voice") {
      pendingTranscriptProcessRef.current = false;
      const textToProcess = transcript.trim() || voiceTranscript.trim();
      if (textToProcess) {
        void processRubberDuckyTranscript(textToProcess);
      } else {
        setRubberDuckyStatus("idle");
      }
    }
  }, [isListening, sessionActive, mode, transcript, voiceTranscript, processRubberDuckyTranscript]);

  const runVibeTask = async (promptOverride?: string) => {
    if (!fileName || !code) {
      setStatusMessage("No active file content available.");
      return;
    }

    const taskPrompt = (promptOverride ?? vibePrompt).trim();
    if (!taskPrompt) {
      setStatusMessage("Enter a task prompt first.");
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage("Generating edits...");

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing VITE_OPENAI_API_KEY in environment.");
      }
      const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
      const prompt = `You are a coding agent inside an IDE.
      Complete the user's request by editing only the active file.
      Return only strict JSON with this shape:
      {
        "summary": "short summary",
        "updatedContent": "full updated file content"
      }

      User request:
        ${taskPrompt}

        Active file:
        ${fileName}

        Current content:
        ${code}`;

      const completionResponse = await fetch(import.meta.env.VITE_OPENAI_API_BASE_URL + 'chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a precise coding agent. Return only strict JSON with keys summary and updatedContent.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!completionResponse.ok) {
        throw new Error(`OpenAI request failed with status ${completionResponse.status}`);
      }

      const completionJson = (await completionResponse.json()) as OpenAIChatCompletionResponse;
      const raw = completionJson.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw.trim()) {
        throw new Error("OpenAI returned an empty response.");
      }
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(cleaned) as VibeResponse;
      if (!parsed.updatedContent || typeof parsed.updatedContent !== "string") {
        setStatusMessage("Agent returned no applicable edit.");
        return;
      }

      onApplyActiveFileChange(parsed.updatedContent);
      setStatusMessage(
        parsed.summary
          ? `${parsed.summary} (updated ${fileName})`
          : `Applied update to ${fileName}.`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("VITE_OPENAI_API_KEY")) {
        setStatusMessage("Set VITE_OPENAI_API_KEY to use Vibe Coder.");
      } else {
        setStatusMessage("Failed to apply edits. Try refining the prompt.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };
  const handleReviewerVibe = () => {
    const promptFromReviewer = lastGeminiResponse.replace(/```json\s*/g, "").replace(/```/g, "").trim() || explanation.replace(/```json\s*/g, "").replace(/```/g, "").replace(/<[^>]*>/g, "").trim();
    if (!promptFromReviewer) {
      setStatusMessage("No reviewer response available to run as a Vibe task.");
      return;
    }

    setVibePrompt(promptFromReviewer);
    setMode("vibe");
    void runVibeTask(promptFromReviewer);
  };

  return (
    <div
      className={`h-full border-l flex flex-col font-sans ${
        isDarkMode
          ? "bg-[#1e1e1e] border-[#414141] text-[#cccccc]"
          : "bg-[#ffffff] border-[#bfdbfe] text-[#0f172a]"
      }`}
    >
      <div className={`h-9 px-4 flex items-center border-b select-none ${isDarkMode ? "border-[#414141] bg-[#252526]" : "border-[#bfdbfe] bg-[#eff6ff]"}`}>
        <Bot size={16} className="text-purple-400 mr-2" />
        <span className="text-xs font-bold uppercase tracking-wider">AI Assistant</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AIPanelMode)}
          className={`ml-3 text-[10px] uppercase tracking-wide border rounded px-2 py-1 outline-none ${
            isDarkMode
              ? "bg-[#1f1f1f] border-[#414141] text-[#cccccc]"
              : "bg-[#ffffff] border-[#93c5fd] text-[#0f172a]"
          }`}>
          <option value="teacher">Code Buddy</option>
          <option value="reviewer">Reviewer</option>
          <option value="vibe">Vibe Coder</option>
          <option value="voice">Rubber Ducky</option>
        </select>
        <button
          type="button"
          title={
            mode !== "teacher"
              ? "Available only in Code Buddy mode"
              : "Analyze selected code"
          }
          disabled={mode !== "teacher" || isAnalyzing}
          onClick={() => void analyzeSelectedSnippet(selectedCode, fileName)}
          className={`ml-2 p-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed ${
            isDarkMode
              ? "border-[#414141] text-[#cccccc] hover:bg-[#303030]"
              : "border-[#93c5fd] text-[#0f172a] hover:bg-[#eff6ff]"
          }`}>
          <Wand2 size={12} />
        </button>
        {isAnalyzing && <Loader2 size={14} className="ml-auto animate-spin text-blue-400" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {mode === "voice" ? (
          <div className="space-y-4 flex flex-col h-full">
            <div className="text-xs text-[#9da1a6] leading-relaxed">
              Rubber duck debugging: speak your thoughts, the AI guides you with questions. Say &quot;stop&quot; or press Done to end.
            </div>

            {!speechSupported ? (
              <div className="text-sm text-amber-400 border border-amber-600/50 rounded p-3 bg-amber-950/30">
                Voice input is not supported in this browser. Try Chrome, Edge, or Safari.
              </div>
            ) : (
              <>
                {!sessionActive ? (
                  <button
                    type="button"
                    onClick={startRubberDuckySession}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded font-medium bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
                  >
                    Start session
                  </button>
                ) : (
                  <>
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar">
                      {conversationHistory.map((msg, i) => (
                        <div
                          key={i}
                          className={`rounded-lg p-2 text-sm ${
                            msg.role === "user"
                              ? "bg-blue-900/30 border border-blue-700/50 ml-4"
                              : "bg-[#2d2d2d] border border-[#414141] mr-4"
                          }`}
                        >
                          <span className="text-[#9da1a6] text-[10px] uppercase">
                            {msg.role === "user" ? "You" : "Rubber duck"}
                          </span>
                          <p className="mt-0.5">{msg.content}</p>
                        </div>
                      ))}
                    </div>

                    {(rubberDuckyStatus === "listening" || rubberDuckyStatus === "processing" || rubberDuckyStatus === "speaking") && (
                      <div className="text-xs text-[#9da1a6] flex items-center gap-2">
                        {rubberDuckyStatus === "listening" && "Listening..."}
                        {rubberDuckyStatus === "processing" && <><Loader2 size={12} className="animate-spin" /> Thinking...</>}
                        {rubberDuckyStatus === "speaking" && "Speaking..."}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isListening) {
                            pendingTranscriptProcessRef.current = true;
                            stop();
                          } else {
                            setRubberDuckyStatus("listening");
                            start();
                          }
                        }}
                        disabled={rubberDuckyStatus === "processing"}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          isListening
                            ? "bg-red-600/80 hover:bg-red-600 text-white"
                            : "bg-[#0e639c] hover:bg-[#1177bb] text-white"
                        }`}
                      >
                        {isListening ? (
                          <>
                            <MicOff size={16} />
                            Stop recording
                          </>
                        ) : (
                          <>
                            <Mic size={16} />
                            {conversationHistory.length === 0 ? "Start recording" : "Speak again"}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={endRubberDuckySession}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded font-medium border border-[#414141] text-[#cccccc] hover:bg-[#303030] transition-colors"
                      >
                        <Square size={14} />
                        Done
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : mode === "vibe" ? (
          <div className="space-y-4">
            <div className="text-xs text-[#9da1a6] leading-relaxed">
              Write a task prompt. Vibe Coder edits only the active editor file.
            </div>

            <textarea
              value={vibePrompt}
              onChange={(e) => setVibePrompt(e.target.value)}
              placeholder="Example: Refactor this component for readability and keep behavior unchanged."
              className={`w-full min-h-28 border rounded p-2 text-sm outline-none focus:border-blue-500 resize-y ${
                isDarkMode
                  ? "bg-[#1f1f1f] border-[#414141]"
                  : "bg-[#ffffff] border-[#93c5fd]"
              }`}/>

            <div className={`text-xs rounded p-2 border ${isDarkMode ? "text-[#9da1a6] border-[#414141] bg-[#1f1f1f]" : "text-[#1d4ed8] border-[#bfdbfe] bg-[#f8fbff]"}`}>
              Active file: <span className="text-blue-300">{fileName || "None selected"}</span>
            </div>

            <button
              disabled={isAnalyzing}
              onClick={() => void runVibeTask()}
              className="w-full flex items-center justify-center gap-2 bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-[#3a3a3a] disabled:cursor-not-allowed rounded py-2 text-sm font-medium transition-colors"
            >
              <WandSparkles size={14} />
              Run Vibe Task
            </button>

            <div className={`text-xs rounded p-2 border ${isDarkMode ? "text-[#9da1a6] border-[#414141] bg-[#1f1f1f]" : "text-[#1d4ed8] border-[#bfdbfe] bg-[#f8fbff]"}`}>
              {statusMessage}
            </div>
          </div>
        ) : isAnalyzing ? (
           <div className="space-y-3 animate-pulse">
              <div className={`h-4 rounded w-3/4 ${isDarkMode ? "bg-[#333]" : "bg-[#dbeafe]"}`}></div>
              <div className={`h-4 rounded w-1/2 ${isDarkMode ? "bg-[#333]" : "bg-[#dbeafe]"}`}></div>
              <div className={`h-4 rounded w-full ${isDarkMode ? "bg-[#333]" : "bg-[#dbeafe]"}`}></div>
              <div className={`h-4 rounded w-5/6 ${isDarkMode ? "bg-[#333]" : "bg-[#dbeafe]"}`}></div>

           </div>
        ) : (
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="prose prose-invert max-w-none">
            {explanation.split("\n").map((line, i) => {
              if (line.startsWith("###")) {
                return (
                  <h3 key={i} className="text-white font-semibold mb-2 mt-4 text-base">
                    {line.replace("### ", "")}
                  </h3>
                );
              }
              if (line.startsWith("-")) {
                return (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <span className="mt-1.5 w-1 h-1 bg-purple-500 rounded-full flex-shrink-0" />
                    <span
                      dangerouslySetInnerHTML={{
                        __html: line
                          .substring(2)
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-300">$1</strong>')
                          .replace(
                            /`(.*?)`/g,
                            '<code class="bg-[#2d2d2d] px-1 rounded text-[#ce9178] font-mono text-xs">$1</code>'
                          ),
                      }}
                    />
                  </div>
                );
              }
              return (
                <p
                  key={i}
                  className="mb-2"
                  dangerouslySetInnerHTML={{
                    __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>'),
                  }}
                />
              );
            })}
          </div>

          {!isAnalyzing && code.trim().length > 0 && (
            <div className="mt-6 pt-4 border-t border-[#333] text-xs text-gray-500 flex items-center gap-2">
              <Sparkles size={12} className="text-yellow-500" />
              <span>AI analysis generated based on code patterns.</span>
            </div>
          )}
          {mode === "reviewer" && !isAnalyzing && lastGeminiResponse.trim().length > 0 && (
            <button
              type="button"
              onClick={handleReviewerVibe}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-[#0e639c] hover:bg-[#1177bb] rounded py-2 text-sm font-medium transition-colors"
            >
              <WandSparkles size={14} />
              Vibe
            </button>
          )}
        </div>
        )}
      </div>

      <div className={`p-3 border-t ${isDarkMode ? "bg-[#252526] border-[#414141]" : "bg-[#eff6ff] border-[#bfdbfe]"}`}>
        <div className={`text-xs mb-2 flex items-center justify-between ${isDarkMode ? "text-[#858585]" : "text-[#1d4ed8]"}`}>
          <span>Status</span>
          <span className="flex items-center gap-1 text-green-500">
            <CheckCircle2 size={10} /> Active
          </span>
        </div>
        <div className={`w-full h-1 rounded overflow-hidden ${isDarkMode ? "bg-[#3c3c3c]" : "bg-[#bfdbfe]"}`}>
          {isAnalyzing ? (
            <div className="h-full bg-purple-500 animate-progress"></div>
          ) : (
            <div className={`h-full w-full ${isDarkMode ? "bg-[#3c3c3c]" : "bg-[#bfdbfe]"}`}></div>
          )}
        </div>
      </div>
    </div>
  );
}