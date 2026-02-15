import React, { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Sparkles, CheckCircle2, Wand2, WandSparkles } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AIPanelProps {
  code: string;
  fileName: string;
  selectedCode: string;
  onApplyActiveFileChange: (newCode: string) => void;
}

type AIPanelMode = "reviewer" | "teacher" | "vibe";
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

export function AIPanel({ code, fileName, selectedCode, onApplyActiveFileChange }: AIPanelProps) {
  const [explanation, setExplanation] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mode, setMode] = useState<AIPanelMode>("teacher");
  const [vibePrompt, setVibePrompt] = useState("");
  const [lastGeminiResponse, setLastGeminiResponse] = useState("");
  const [statusMessage, setStatusMessage] = useState<string>("Ready");
  const analysisRunRef = useRef(0);

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
    if (mode === "vibe") {
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
    <div className="h-full bg-[#1e1e1e] border-l border-[#414141] flex flex-col text-[#cccccc] font-sans">
      <div className="h-9 px-4 flex items-center border-b border-[#414141] select-none bg-[#252526]">
        <Bot size={16} className="text-purple-400 mr-2" />
        <span className="text-xs font-bold uppercase tracking-wider">AI Assistant</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AIPanelMode)}
          className="ml-3 text-[10px] uppercase tracking-wide bg-[#1f1f1f] border border-[#414141] rounded px-2 py-1 text-[#cccccc] outline-none"
        >
          <option value="teacher">Code Buddy</option>
          <option value="reviewer">Reviewer</option>
          <option value="vibe">Vibe Coder</option>
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
          className="ml-2 p-1 rounded border border-[#414141] text-[#cccccc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#303030]"
        >
          <Wand2 size={12} />
        </button>
        {isAnalyzing && <Loader2 size={14} className="ml-auto animate-spin text-blue-400" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {mode === "vibe" ? (
          <div className="space-y-4">
            <div className="text-xs text-[#9da1a6] leading-relaxed">
              Write a task prompt. Vibe Coder edits only the active editor file.
            </div>

            <textarea
              value={vibePrompt}
              onChange={(e) => setVibePrompt(e.target.value)}
              placeholder="Example: Refactor this component for readability and keep behavior unchanged."
              className="w-full min-h-28 bg-[#1f1f1f] border border-[#414141] rounded p-2 text-sm outline-none focus:border-blue-500 resize-y"
            />

            <div className="text-xs text-[#9da1a6] border border-[#414141] rounded p-2 bg-[#1f1f1f]">
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

            <div className="text-xs text-[#9da1a6] border border-[#414141] rounded p-2 bg-[#1f1f1f]">
              {statusMessage}
            </div>
          </div>
        ) : isAnalyzing ? (
           <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-[#333] rounded w-3/4"></div>
              <div className="h-4 bg-[#333] rounded w-1/2"></div>
              <div className="h-4 bg-[#333] rounded w-full"></div>
              <div className="h-4 bg-[#333] rounded w-5/6"></div>
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

      <div className="p-3 bg-[#252526] border-t border-[#414141]">
        <div className="text-xs text-[#858585] mb-2 flex items-center justify-between">
          <span>Status</span>
          <span className="flex items-center gap-1 text-green-500">
            <CheckCircle2 size={10} /> Active
          </span>
        </div>
        <div className="w-full bg-[#3c3c3c] h-1 rounded overflow-hidden">
          {isAnalyzing ? (
            <div className="h-full bg-purple-500 animate-progress"></div>
          ) : (
            <div className="h-full w-full bg-[#3c3c3c]"></div>
          )}
        </div>
      </div>
    </div>
  );
}
