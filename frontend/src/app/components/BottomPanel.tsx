import React, { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

interface BottomPanelProps {
  terminalCommand: string;
  terminalLines: string[];
  onTerminalCommandChange: (value: string) => void;
  onTerminalCommandRun: (command: string) => void;
}

export function BottomPanel({
  terminalCommand,
  terminalLines,
  onTerminalCommandChange,
  onTerminalCommandRun,
}: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState("terminal");
  const terminalScrollRef = useRef<HTMLDivElement | null>(null);

  const tabs = [
    { id: "problems", label: "PROBLEMS", count: 0 },
    { id: "output", label: "OUTPUT" },
    { id: "debug", label: "DEBUG CONSOLE" },
    { id: "terminal", label: "TERMINAL" },
    { id: "ports", label: "PORTS" },
  ];

  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <div className="h-full bg-[#1e1e1e] border-t border-[#414141] flex flex-col text-[#cccccc]">
      <div className="flex px-4 border-b border-[#414141]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-3 py-2 text-xs font-medium border-b hover:text-white transition-colors",
              activeTab === tab.id ? "text-white border-white" : "text-[#969696] border-transparent"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#3f3f3f] text-xs">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 p-2 font-mono text-sm overflow-auto" ref={terminalScrollRef}>
        {activeTab === "terminal" && (
          <div className="space-y-1">
            {terminalLines.map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 16)}`} className="text-[#cccccc] whitespace-pre-wrap break-words">
                {line}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-green-500">{">"}</span>
              <input
                value={terminalCommand}
                onChange={(e) => onTerminalCommandChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onTerminalCommandRun(terminalCommand);
                  }
                }}
                placeholder="Type command, e.g. python app.py or clear"
                className="flex-1 bg-transparent outline-none text-[#cccccc] placeholder:text-[#777]"
              />
            </div>
          </div>
        )}

        {activeTab === "output" && (
          <div className="text-gray-400">[Info] Output is shown in Terminal for run actions.</div>
        )}
        {activeTab === "problems" && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p>No problems have been detected in the workspace.</p>
          </div>
        )}
      </div>
    </div>
  );
}
