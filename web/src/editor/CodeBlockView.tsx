import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useState } from "react";

const LANGS = ["", "mermaid", "bash", "yaml", "json", "python", "typescript", "javascript", "go", "sql", "ini", "xml", "markdown", "dockerfile", "plaintext"];

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then((m) => m.default);
  return mermaidReady;
}

function themeIsDark() {
  return ["midnight", "nord", "contrast"].includes(document.documentElement.dataset.theme ?? "");
}

/** Renders Mermaid source to SVG. Used in the editor and in read-only pages. */
export function Mermaid({ source }: { source: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState("");
  const theme = document.documentElement.dataset.theme;
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: themeIsDark() ? "dark" : "default" });
        const r = await mermaid.render(id, source || "flowchart LR\n  A --> B");
        if (live) {
          setSvg(r.svg);
          setErr("");
        }
      } catch (e) {
        if (live) setErr((e as Error).message);
        document.getElementById("d" + id)?.remove();
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [source, id, theme]);
  if (err) return <div className="diagram-error">Diagram error: {err}</div>;
  return <div className="diagram-render" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const lang: string = node.attrs.language ?? "";
  const editable = editor.isEditable;
  const isDiagram = lang === "mermaid";

  if (isDiagram && !editable) {
    return (
      <NodeViewWrapper className="diagram-block">
        <Mermaid source={node.textContent} />
        <pre style={{ display: "none" }}>
          <NodeViewContent<"code"> as="code" />
        </pre>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={isDiagram ? "diagram-block" : ""}>
      {editable && (
        <div className="diagram-head" contentEditable={false}>
          <select className="code-lang" value={lang} onChange={(e) => updateAttributes({ language: e.target.value || null })}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === "" ? "auto" : l === "mermaid" ? "mermaid (diagram)" : l}
              </option>
            ))}
          </select>
          {isDiagram && <span>Diagram source; preview below</span>}
        </div>
      )}
      <pre>
        <NodeViewContent<"code"> as="code" className={lang ? `language-${lang}` : undefined} />
      </pre>
      {isDiagram && (
        <div contentEditable={false}>
          <Mermaid source={node.textContent} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
