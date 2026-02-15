import React, { useState, useEffect } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/themes/prism-dark.css"; // We'll override this with VS Code colors

// Minimal custom CSS for Prism to match VS Code Dark
const customPrismStyles = `
  .token.comment,
  .token.prolog,
  .token.doctype,
  .token.cdata {
    color: #6a9955;
  }
  .token.punctuation {
    color: #d4d4d4;
  }
  .token.property,
  .token.tag,
  .token.boolean,
  .token.number,
  .token.constant,
  .token.symbol,
  .token.deleted {
    color: #b5cea8;
  }
  .token.selector,
  .token.attr-name,
  .token.string,
  .token.char,
  .token.builtin,
  .token.inserted {
    color: #ce9178;
  }
  .token.operator,
  .token.entity,
  .token.url,
  .language-css .token.string,
  .style .token.string {
    color: #d4d4d4;
  }
  .token.atrule,
  .token.attr-value,
  .token.keyword {
    color: #569cd6;
  }
  .token.function,
  .token.class-name {
    color: #dcdcaa;
  }
  .token.regex,
  .token.important,
  .token.variable {
    color: #9cdcfe;
  }
  code[class*="language-"],
  pre[class*="language-"] {
    color: #d4d4d4;
    text-shadow: none;
    font-family: "Menlo", "Monaco", "Courier New", monospace;
    font-size: 14px;
    line-height: 1.5;
    direction: ltr;
    text-align: left;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    tab-size: 2;
    hyphens: none;
  }
`;

interface CodeEditorProps {
  initialCode?: string;
  code?: string;
  onChange?: (code: string) => void;
  onSelectionChange?: (selectedCode: string) => void;
  fileName?: string;
}

export function CodeEditor({
  initialCode,
  code,
  onChange,
  onSelectionChange,
  fileName = "App.tsx",
}: CodeEditorProps) {
  // If controlled, use props.code, else use local state initialized with initialCode
  const [internalCode, setInternalCode] = useState(initialCode || "");
  const editorContainerRef = React.useRef<HTMLDivElement | null>(null);

  const isControlled = code !== undefined;
  const currentCode = isControlled ? code : internalCode;

  const emitSelectionChange = () => {
    if (!onSelectionChange) return;
    const textarea = editorContainerRef.current?.querySelector("textarea");
    if (!textarea) {
      onSelectionChange("");
      return;
    }
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (end <= start) {
      onSelectionChange("");
      return;
    }
    onSelectionChange(currentCode.slice(start, end));
  };

  const handleChange = (newCode: string) => {
    if (!isControlled) {
      setInternalCode(newCode);
    }
    if (onChange) {
      onChange(newCode);
    }
    window.requestAnimationFrame(emitSelectionChange);
  };

  // Reset internal state if initialCode changes (for uncontrolled usage when file switches)
  useEffect(() => {
    if (!isControlled && initialCode !== undefined) {
      setInternalCode(initialCode);
    }
  }, [initialCode, isControlled]);

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] overflow-hidden">
      {/* Tabs */}
      <div className="flex bg-[#2d2d2d] overflow-x-auto scrollbar-hide">
        <div className="px-3 py-2 bg-[#1e1e1e] text-[#ffffff] text-sm border-t-2 border-blue-500 flex items-center min-w-[120px]">
          <span className="mr-2 text-blue-400">TSX</span>
          {fileName}
          <span className="ml-auto text-gray-400 hover:text-white cursor-pointer px-1">×</span>
        </div>
        <div className="px-3 py-2 bg-[#2d2d2d] text-[#969696] text-sm border-t-2 border-transparent hover:bg-[#2a2d2e] flex items-center min-w-[120px] cursor-pointer">
          <span className="mr-2 text-yellow-400">JSON</span>
          package.json
        </div>
      </div>

      {/* Editor Area */}
      <div
        ref={editorContainerRef}
        className="flex-1 relative overflow-auto custom-scrollbar"
        onMouseUp={emitSelectionChange}
        onKeyUp={emitSelectionChange}
      >
        <style>{customPrismStyles}</style>
        <Editor
          value={currentCode}
          onValueChange={handleChange}
          highlight={(code) => Prism.highlight(code, Prism.languages.javascript, "javascript")}
          padding={20}
          className="font-mono min-h-full"
          style={{
            fontFamily: '"Fira Code", "Fira Mono", monospace',
            fontSize: 14,
            backgroundColor: "#1e1e1e",
            color: "#d4d4d4",
          }}
        />
      </div>
    </div>
  );
}
