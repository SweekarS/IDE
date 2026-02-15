import React, { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ActivityBar } from "./components/ActivityBar";
import { Sidebar } from "./components/Sidebar";
import { CodeEditor } from "./components/Editor";
import { BottomPanel } from "./components/BottomPanel";
import { AIPanel } from "./components/AIPanel";
import { MenuBar } from "./components/MenuBar";
import { Info, Settings, Bell, AlertCircle } from "lucide-react";
import { FileNode } from "./components/Sidebar";

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);
const AI_REFRESH_LINE_THRESHOLD = 5;

const countChangedLines = (before: string, after: string): number => {
  if (before === after) return 0;

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeLines[beforeEnd] === afterLines[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removedLines = Math.max(0, beforeEnd - start + 1);
  const addedLines = Math.max(0, afterEnd - start + 1);
  return Math.max(removedLines, addedLines);
};

export default function App() {
  const [activeActivity, setActiveActivity] = useState("explorer");
  const [currentFile, setCurrentFile] = useState("main.py");
  const [visiblePanels, setVisiblePanels] = useState({
      sidebar: true,
      ai: true,
      terminal: true
  });

  // --- File System State ---

  const initialFilesTree: FileNode[] = [
    {
      id: "root-folder",
      name: "python-project",
      type: "folder",
      isOpen: true,
      children: [
        {
          id: "app",
          name: "app",
          type: "folder",
          isOpen: true,
          children: [
            { id: "__init__.py", name: "__init__.py", type: "file" },
            { id: "main.py", name: "main.py", type: "file" },
            { id: "utils.py", name: "utils.py", type: "file" },
            {
              id: "services",
              name: "services",
              type: "folder",
              isOpen: false,
              children: [
                { id: "data_service.py", name: "data_service.py", type: "file" },
              ],
            },
          ],
        },
        {
          id: "tests",
          name: "tests",
          type: "folder",
          isOpen: false,
          children: [{ id: "test_main.py", name: "test_main.py", type: "file" }],
        },
        { id: "requirements.txt", name: "requirements.txt", type: "file" },
        { id: ".gitignore", name: ".gitignore", type: "file" },
        { id: "readme.md", name: "README.md", type: "file" },
      ],
    },
  ];

  const initialFilesContent: Record<string, string> = {
    "__init__.py": `"""Application package."""\n`,
    "main.py": `from utils import greet\nfrom data_service import get_items\n\n\ndef main() -> None:\n    print(greet("World"))\n    for item in get_items():\n        print(item)\n\n\nif __name__ == "__main__":\n    main()\n`,
    "utils.py": `def greet(name: str) -> str:\n    return f"Hello, {name}!"\n`,
    "data_service.py": `def get_items() -> list[str]:\n    return ["alpha", "beta", "gamma"]\n`,
    "test_main.py": `from utils import greet\n\n\ndef test_greet() -> None:\n    assert greet("World") == "Hello, World!"\n`,
  };

  const [filesTree, setFilesTree] = useState<FileNode[]>(initialFilesTree);
  const [filesContent, setFilesContent] = useState(initialFilesContent);
  const [aiPanelCode, setAiPanelCode] = useState(initialFilesContent[currentFile] || "");
  const [selectedCode, setSelectedCode] = useState("");
  const [terminalCommand, setTerminalCommand] = useState("python");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Terminal ready.",
    "Type a command below, then use Run menu.",
  ]);
  const pendingAiLineChangesRef = useRef<Record<string, number>>({});
  const previousAiFileRef = useRef(currentFile);

  useEffect(() => {
    if (previousAiFileRef.current !== currentFile) {
      setAiPanelCode(filesContent[currentFile] || "");
      setSelectedCode("");
      pendingAiLineChangesRef.current[currentFile] = 0;
      previousAiFileRef.current = currentFile;
    }
  }, [currentFile, filesContent]);

  // --- File System Operations ---

  const handleCreateNode = (type: "file" | "folder", parentId: string | undefined, name: string) => {
    if (!name) return;

    const newNode: FileNode = {
      id: generateId(),
      name,
      type,
      children: type === "folder" ? [] : undefined,
      isOpen: true
    };

    // If file, initialize empty content
    if (type === "file") {
      setFilesContent(prev => ({ ...prev, [name]: "// New file created" }));
      setCurrentFile(name);
    }

    // Helper to insert node
    const insertNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newNode],
            isOpen: true // Ensure folder is open
          };
        }
        if (node.children) {
          return { ...node, children: insertNode(node.children) };
        }
        return node;
      });
    };

    // If root (parentId is 'root' or undefined), add to top level of the first folder (project root)
    if (parentId === 'root-folder' || !parentId) {
        // In our structure, the first node is the project root. We add children to it.
        const newTree = [...filesTree];
        if (newTree[0] && newTree[0].children) {
            newTree[0].children.push(newNode);
        }
        setFilesTree(newTree);
    } else {
        setFilesTree(prev => insertNode(prev));
    }
  };

  const handleDeleteNode = (id: string) => {
    const deleteNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(node => {
        if (node.id === id) {
           // Also remove content if it's a file (optional cleanup)
           if (node.type === 'file') {
             // We'd need to know the name to remove from content map, 
             // but strictly we can leave it or find it. 
             // For simplicity, we just remove from tree.
           }
           return false;
        }
        if (node.children) {
          node.children = deleteNode(node.children);
        }
        return true;
      });
    };
    setFilesTree(prev => deleteNode([...prev]));
  };

  const handleToggleFolder = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isOpen: !node.isOpen };
        }
        if (node.children) {
          return { ...node, children: toggle(node.children) };
        }
        return node;
      });
    };
    setFilesTree(prev => toggle(prev));
  };


  const appendTerminalLines = (lines: string[]) => {
    setTerminalLines((prev) => [...prev, ...lines]);
  };

  const extractPrintOutputs = (source: string) => {
    const outputs: string[] = [];
    const printRegex = /print\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
    let match: RegExpExecArray | null = null;
    while ((match = printRegex.exec(source)) !== null) {
      outputs.push(match[2]);
    }
    return outputs;
  };

  const resolvePythonFileFromCommand = (commandArgs: string): string | null => {
    const match = commandArgs.match(/["']([^"']+\.py)["']|(\S+\.py)/i);
    if (!match) return null;
    return (match[1] || match[2] || "").trim();
  };

  const runPythonSource = (source: string, label: string) => {
    appendTerminalLines([`[Info] Executing ${label}`]);
    const printOutputs = extractPrintOutputs(source);
    if (printOutputs.length > 0) {
      appendTerminalLines(printOutputs);
    } else {
      appendTerminalLines(["(no stdout)"]);
    }
    appendTerminalLines(["[Exit] code 0"]);
  };

  const executeTerminalCommand = (rawCommand: string) => {
    const command = rawCommand.trim();
    if (!command) return;

    setVisiblePanels((p) => ({ ...p, terminal: true }));

    if (/^(clear|cls)$/i.test(command)) {
      setTerminalLines([]);
      setTerminalCommand("");
      return;
    }

    appendTerminalLines([`> ${command}`]);

    if (/^help$/i.test(command)) {
      appendTerminalLines([
        "Supported commands:",
        "python",
        "python <file.py>",
        "python -c \"print('hello')\"",
        "clear",
      ]);
      setTerminalCommand("");
      return;
    }

    const pythonMatch = command.match(/^python(?:\s+(.*))?$/i);
    if (!pythonMatch) {
      appendTerminalLines([`[Error] Unsupported command: ${command}`]);
      setTerminalCommand("");
      return;
    }

    const args = (pythonMatch[1] || "").trim();
    if (!args) {
      if (!currentFile.toLowerCase().endsWith(".py")) {
        appendTerminalLines([`[Error] Active file is not Python: ${currentFile}`]);
      } else {
        runPythonSource(filesContent[currentFile] || "", currentFile);
      }
      setTerminalCommand("");
      return;
    }

    const inlineMatch = args.match(/^-c\s+["']([\s\S]*)["']$/);
    if (inlineMatch) {
      runPythonSource(inlineMatch[1], "inline Python (-c)");
      setTerminalCommand("");
      return;
    }

    const targetFile = resolvePythonFileFromCommand(args);
    if (!targetFile) {
      appendTerminalLines([`[Error] Could not resolve Python file from command: ${command}`]);
      setTerminalCommand("");
      return;
    }

    const targetContent = filesContent[targetFile];
    if (typeof targetContent !== "string") {
      appendTerminalLines([`[Error] File not found in workspace: ${targetFile}`]);
      setTerminalCommand("");
      return;
    }

    runPythonSource(targetContent, targetFile);
    setTerminalCommand("");
  };

  const runCurrentPythonFile = (mode: "debug" | "run") => {
    const trimmedCommand = terminalCommand.trim() || "python";
    const fileCommand = trimmedCommand.includes("{file}")
      ? trimmedCommand.replace("{file}", currentFile)
      : `${trimmedCommand} ${currentFile}`;
    appendTerminalLines([`${mode === "debug" ? "[Debug]" : "[Run]"} ${fileCommand}`]);
    executeTerminalCommand(fileCommand);
  };

  const handleMenuAction = (action: string, payload?: any) => {
    const findFirstFileName = (nodes: FileNode[]): string | null => {
      for (const node of nodes) {
        if (node.type === "file") {
          return node.name;
        }
        if (node.children?.length) {
          const nested = findFirstFileName(node.children);
          if (nested) {
            return nested;
          }
        }
      }
      return null;
    };

    switch (action) {
        case "new_file":
             // Create a new file in the root
            handleCreateNode("file", "root-folder", `Untitled-${Math.floor(Math.random() * 1000)}.txt`);
            break;
        case "new_window":
             alert("New window action simulated");
             break;
        case "open_file":
            if (payload?.name && typeof payload.content === "string") {
              const fileName = payload.name as string;

              setFilesContent((prev) => ({
                ...prev,
                [fileName]: payload.content,
              }));

              setFilesTree((prev) => {
                const rootNode = prev[0];
                if (!rootNode) {
                  return prev;
                }

                const alreadyExists = (rootNode.children || []).some(
                  (node) => node.type === "file" && node.name === fileName
                );

                if (alreadyExists) {
                  return prev;
                }

                const newFileNode: FileNode = {
                  id: generateId(),
                  name: fileName,
                  type: "file",
                };

                return [
                  {
                    ...rootNode,
                    isOpen: true,
                    children: [...(rootNode.children || []), newFileNode],
                  },
                  ...prev.slice(1),
                ];
              });

              setCurrentFile(fileName);
              setActiveActivity("explorer");
              setVisiblePanels((p) => ({ ...p, sidebar: true }));
            }
            break;
        case "open_folder":
            if (payload?.folderName && Array.isArray(payload.children)) {
              const folderTree: FileNode[] = [
                {
                  id: "root-folder",
                  name: payload.folderName as string,
                  type: "folder",
                  isOpen: true,
                  children: payload.children as FileNode[],
                },
              ];

              setFilesTree(folderTree);
              setFilesContent(payload.fileContents || {});

              const firstFile = findFirstFileName(payload.children as FileNode[]);
              setCurrentFile(firstFile || "");
              setActiveActivity("explorer");
              setVisiblePanels((p) => ({ ...p, sidebar: true }));
            }
            break;
        case "save_file":
            alert(`Saved ${currentFile}`);
            break;
        case "save_all":
            alert("All files saved");
            break;
        case "toggle_sidebar":
            setVisiblePanels(p => ({ ...p, sidebar: !p.sidebar }));
            break;
        case "toggle_ai":
            setVisiblePanels(p => ({ ...p, ai: !p.ai }));
            break;
        case "toggle_terminal":
             setVisiblePanels(p => ({ ...p, terminal: !p.terminal }));
            break;
        case "toggle_word_wrap":
             alert("Word wrap toggled (simulated)");
             break;
        case "start_debugging":
            runCurrentPythonFile("debug");
            break;
        case "run_without_debugging":
            runCurrentPythonFile("run");
            break;
        default:
            console.log("Action:", action);
    }
  };

  // ---

  const handleCodeChange = (newCode: string) => {
    const previousCode = filesContent[currentFile] || "";
    const changedLines = countChangedLines(previousCode, newCode);

    if (changedLines > 0) {
      const pending = pendingAiLineChangesRef.current[currentFile] || 0;
      const nextPending = pending + changedLines;
      pendingAiLineChangesRef.current[currentFile] = nextPending;

      if (nextPending >= AI_REFRESH_LINE_THRESHOLD) {
        setAiPanelCode(newCode);
        pendingAiLineChangesRef.current[currentFile] = 0;
      }
    }

    setFilesContent((prev) => ({
      ...prev,
      [currentFile]: newCode,
    }));
  };

  const currentCode = filesContent[currentFile] || "";

  const handleApplyAIChangeToActiveFile = (newCode: string) => {
    setFilesContent((prev) => {
      if (!currentFile || !Object.prototype.hasOwnProperty.call(prev, currentFile)) {
        return prev;
      }
      return {
        ...prev,
        [currentFile]: newCode,
      };
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans">
      {/* Title Bar (VS Code style) */}
      <div className="h-8 bg-[#3c3c3c] flex items-center select-none justify-between border-b border-[#1e1e1e]">
        <div className="flex items-center h-full">
           <div className="flex gap-2 ml-3 mr-4">
             <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
             <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
             <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
           </div>
           
           <MenuBar onAction={handleMenuAction} visiblePanels={visiblePanels} />
        </div>
        
        <div className="text-xs text-[#cccccc] opacity-80 font-medium absolute left-1/2 transform -translate-x-1/2">
            {currentFile} - vscode-project
        </div>

        <div className="flex items-center gap-3 pr-2">
             <button 
                onClick={() => setVisiblePanels(p => ({ ...p, ai: !p.ai }))}
                className={`text-xs px-2 py-0.5 rounded border border-[#555] hover:bg-[#505050] transition-colors ${visiblePanels.ai ? 'bg-[#505050]' : ''}`}
             >
                {visiblePanels.ai ? 'Hide AI' : 'Show AI'}
             </button>
             <Settings size={16} className="text-[#cccccc] hover:text-white cursor-pointer" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar activeTab={activeActivity} onTabChange={(tab) => {
            if (activeActivity === tab) {
                setVisiblePanels(p => ({ ...p, sidebar: !p.sidebar }));
            } else {
                setActiveActivity(tab);
                setVisiblePanels(p => ({ ...p, sidebar: true }));
            }
        }} />

        {/* Resizable Panels */}
        <PanelGroup direction="horizontal" className="flex-1">
          
          {/* Sidebar Panel */}
          {visiblePanels.sidebar && activeActivity === 'explorer' && (
            <>
                <Panel defaultSize={15} minSize={10} maxSize={25} className="bg-[#252526]">
                    <Sidebar 
                        files={filesTree}
                        selectedFile={currentFile}
                        onFileSelect={setCurrentFile} 
                        onToggleFolder={handleToggleFolder}
                        onCreateNode={handleCreateNode}
                        onDeleteNode={handleDeleteNode}
                        onRenameNode={() => {}} 
                    />
                </Panel>
                <PanelResizeHandle className="w-[1px] bg-[#414141] hover:bg-blue-500 transition-colors" />
            </>
          )}

          {/* Center Area (Editor + Terminal) */}
          <Panel defaultSize={visiblePanels.ai ? 60 : 80} minSize={30}>
            <PanelGroup direction="vertical">
              {/* Editor */}
              <Panel defaultSize={visiblePanels.terminal ? 70 : 100} minSize={20} className="bg-[#1e1e1e]">
                {currentFile ? (
                    <CodeEditor 
                        key={currentFile} 
                        fileName={currentFile} 
                        code={currentCode}
                        onChange={handleCodeChange}
                        onSelectionChange={setSelectedCode}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <p className="mb-2">Select a file to view</p>
                            <p className="text-xs">CMD+P to search files</p>
                        </div>
                    </div>
                )}
              </Panel>
              
              {visiblePanels.terminal && (
                  <>
                    <PanelResizeHandle className="h-[1px] bg-[#414141] hover:bg-blue-500 transition-colors" />
                    <Panel defaultSize={30} minSize={10} className="bg-[#1e1e1e]">
                        <BottomPanel
                          terminalCommand={terminalCommand}
                          terminalLines={terminalLines}
                          onTerminalCommandChange={setTerminalCommand}
                          onTerminalCommandRun={executeTerminalCommand}
                        />
                    </Panel>
                  </>
              )}
            </PanelGroup>
          </Panel>

          {/* AI Panel (Right Side) */}
          {visiblePanels.ai && (
            <>
                <PanelResizeHandle className="w-[1px] bg-[#414141] hover:bg-blue-500 transition-colors" />
                <Panel defaultSize={25} minSize={15} maxSize={40} className="bg-[#1e1e1e]">
                    <AIPanel code={aiPanelCode} fileName={currentFile} selectedCode={selectedCode} onApplyActiveFileChange={handleApplyAIChangeToActiveFile}/>
                </Panel>
            </>
          )}

        </PanelGroup>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] text-white flex items-center px-3 text-xs justify-between select-none">
          <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 hover:bg-[#1f8ad2] px-1 cursor-pointer">
                  <span className="font-medium">main</span>*
              </div>
              <div className="flex items-center gap-1 hover:bg-[#1f8ad2] px-1 cursor-pointer">
                  <AlertCircle size={12} /> 0
                  <Info size={12} className="ml-1"/> 0
              </div>
          </div>
          <div className="flex items-center gap-4">
               <span className="hover:bg-[#1f8ad2] px-1 cursor-pointer">Ln {currentCode.split('\n').length}, Col 1</span>
               <span className="hover:bg-[#1f8ad2] px-1 cursor-pointer">UTF-8</span>
               <span className="hover:bg-[#1f8ad2] px-1 cursor-pointer">TypeScript React</span>
               <span className="hover:bg-[#1f8ad2] px-1 cursor-pointer">Prettier</span>
               <Bell size={12} className="hover:bg-[#1f8ad2] cursor-pointer" />
          </div>
      </div>
    </div>
  );
}
