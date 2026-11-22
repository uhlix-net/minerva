/**
 * Page elements beyond plain rich text: table of contents, callout panels, expand sections,
 * status labels and a child-page list. Each one has a markdown form so pages written as
 * markdown (or seeded from files) can use them:
 *
 *   {{toc}}                         table of contents (own line)
 *   {{children}}                    list of the page's child pages (own line)
 *   > [!WARNING]                    callout: NOTE, TIP, IMPORTANT, WARNING, CAUTION
 *   > text                          (GitHub alert syntax; INFO = NOTE, DANGER = CAUTION)
 *   <details>                       expand section
 *   <summary>Title</summary>
 *
 *   body
 *
 *   </details>
 *   {{status:green:Done}}           status label (grey, blue, green, yellow, red, purple)
 */
import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { AlertOctagon, AlertTriangle, ChevronRight, FileText, Info, Lightbulb, MessageSquareWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, pageUrl } from "../api";

/* ===== Page context ================================================================== */

/** Which page the editor shows, for elements that need it ({{children}}). */
export const PageInfo = Extension.create<{ pageId: number | null; spaceKey: string | null }>({
  name: "pageInfo",
  addOptions: () => ({ pageId: null, spaceKey: null }),
});

function pageInfo(editor: NodeViewProps["editor"]) {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "pageInfo");
  return (ext?.options ?? { pageId: null, spaceKey: null }) as { pageId: number | null; spaceKey: string | null };
}

/** Prefix every line with "> " (blank lines get a bare ">"), as blockquotes do. */
function quoteLines(s: string) {
  return s
    .split("\n")
    .map((l) => (l.trim() === "" ? ">" : `> ${l}`))
    .join("\n");
}

function renderBlocks(node: JSONContent, h: any): string {
  return (node.content ?? []).map((child, i) => (h.renderChild ? h.renderChild(child, i) : h.renderChildren([child]))).join("\n\n");
}

function blockChildren(tokens: any[], h: any): JSONContent[] {
  const kids = (h.parseBlockChildren ?? h.parseChildren)(tokens ?? []);
  return kids.length ? kids : [{ type: "paragraph" }];
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** A block macro written as {{name}} on its own line. */
function macroTokenizer(name: string) {
  const re = new RegExp(`^ {0,3}\\{\\{${name}\\}\\}[ \\t]*(?:\\n+|$)`);
  return {
    name,
    level: "block" as const,
    start: (src: string) => src.search(new RegExp(`^ {0,3}\\{\\{${name}\\}\\}`, "m")),
    tokenize: (src: string) => {
      const m = re.exec(src);
      return m ? { type: name, raw: m[0] } : undefined;
    },
  };
}

/* ===== Table of contents ============================================================= */

interface Heading {
  level: number;
  text: string;
  pos: number;
}

function TocView({ editor }: NodeViewProps) {
  const [items, setItems] = useState<Heading[]>([]);
  useEffect(() => {
    const read = () => {
      const hs: Heading[] = [];
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === "heading" && n.textContent.trim()) hs.push({ level: n.attrs.level, text: n.textContent, pos });
        return n.type.name !== "heading";
      });
      setItems((old) => (JSON.stringify(old) === JSON.stringify(hs) ? old : hs));
    };
    read();
    editor.on("transaction", read);
    return () => {
      editor.off("transaction", read);
    };
  }, [editor]);
  const min = Math.min(...items.map((i) => i.level), 6);
  const go = (pos: number) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <NodeViewWrapper className="el-toc" contentEditable={false} data-type="toc">
      <div className="el-toc-title">Table of Contents</div>
      {items.length === 0 ? (
        <div className="muted">Headings on this page will be listed here.</div>
      ) : (
        <ul>
          {items.map((h) => (
            <li key={h.pos} style={{ paddingLeft: (h.level - min) * 16 }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  go(h.pos);
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContents = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-type="toc"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "toc" })],
  addNodeView: () => ReactNodeViewRenderer(TocView),
  markdownTokenizer: macroTokenizer("toc"),
  parseMarkdown: (_t: any, h: any) => h.createNode("toc"),
  renderMarkdown: () => "{{toc}}",
});

/* ===== Child pages =================================================================== */

function ChildrenView({ editor }: NodeViewProps) {
  const { pageId, spaceKey } = pageInfo(editor);
  const [kids, setKids] = useState<{ id: number; title: string }[] | null>(null);
  useEffect(() => {
    if (!pageId) return;
    let live = true;
    api
      .get<{ children: { id: number; title: string }[] }>(`/api/pages/${pageId}`)
      .then((p) => live && setKids(p.children ?? []))
      .catch(() => live && setKids([]));
    return () => {
      live = false;
    };
  }, [pageId]);
  return (
    <NodeViewWrapper className="el-children" contentEditable={false} data-type="children">
      <div className="el-head">
        <FileText size={15} /> Child pages
      </div>
      {!pageId || !spaceKey ? (
        <div className="muted">Child pages of this page will be listed here.</div>
      ) : kids === null ? (
        <div className="muted">Loading…</div>
      ) : kids.length === 0 ? (
        <div className="muted">This page has no child pages.</div>
      ) : (
        <ul>
          {kids.map((k) => (
            <li key={k.id}>
              <Link to={pageUrl(spaceKey, k.id)}>{k.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  );
}

export const ChildPages = Node.create({
  name: "children",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-type="children"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "children" })],
  addNodeView: () => ReactNodeViewRenderer(ChildrenView),
  markdownTokenizer: macroTokenizer("children"),
  parseMarkdown: (_t: any, h: any) => h.createNode("children"),
  renderMarkdown: () => "{{children}}",
});

/* ===== Callout panels ================================================================ */

export const CALLOUT_KINDS = {
  note: { label: "Note", icon: Info },
  tip: { label: "Tip", icon: Lightbulb },
  important: { label: "Important", icon: MessageSquareWarning },
  warning: { label: "Warning", icon: AlertTriangle },
  caution: { label: "Caution", icon: AlertOctagon },
} as const;
export type CalloutKind = keyof typeof CALLOUT_KINDS;
const KIND_ALIASES: Record<string, CalloutKind> = { info: "note", danger: "caution" };
const toKind = (s: string): CalloutKind => {
  const k = s.toLowerCase();
  return (k in CALLOUT_KINDS ? k : KIND_ALIASES[k] ?? "note") as CalloutKind;
};

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const kind = toKind(node.attrs.kind);
  const { label, icon: Icon } = CALLOUT_KINDS[kind];
  return (
    <NodeViewWrapper className={`el-callout ${kind}`} data-type="callout">
      <div className="el-head" contentEditable={false}>
        <Icon size={15} />
        {editor.isEditable ? (
          <select value={kind} onChange={(e) => updateAttributes({ kind: e.target.value })} aria-label="Panel type">
            {Object.entries(CALLOUT_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        ) : (
          label
        )}
      </div>
      <NodeViewContent className="el-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({
    kind: { default: "note", parseHTML: (el) => toKind(el.getAttribute("data-kind") ?? "note"), renderHTML: (a) => ({ "data-kind": a.kind }) },
  }),
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
  addCommands() {
    return {
      setCallout:
        (kind: CalloutKind = "note") =>
        ({ commands }: any) =>
          commands.wrapIn(this.name, { kind }),
    } as any;
  },
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}> ?\[!/m),
    tokenize: (src: string, _tokens: any, lexer: any) => {
      const m = /^ {0,3}> ?\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\][ \t]*(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/i.exec(src);
      if (!m) return undefined;
      const inner = m[2]
        .split("\n")
        .map((l) => l.replace(/^ {0,3}> ?/, ""))
        .join("\n");
      return { type: "callout", raw: m[0], kind: toKind(m[1]), tokens: lexer.blockTokens(inner) };
    },
  },
  parseMarkdown: (t: any, h: any) => h.createNode("callout", { kind: t.kind }, blockChildren(t.tokens, h)),
  renderMarkdown: (node: JSONContent, h: any) => `> [!${toKind(node.attrs?.kind ?? "note").toUpperCase()}]\n${quoteLines(renderBlocks(node, h))}`,
});

/* ===== Expand section ================================================================ */

function ExpandView({ node, updateAttributes, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const [open, setOpen] = useState(editable);
  useEffect(() => setOpen(editable), [editable]);
  return (
    <NodeViewWrapper className={`el-expand${open ? " open" : ""}`} data-type="expand">
      <div className="el-head" contentEditable={false}>
        <button type="button" className="el-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"}>
          <ChevronRight size={16} />
        </button>
        {editable ? (
          <input value={node.attrs.title} placeholder="Section title" onChange={(e) => updateAttributes({ title: e.target.value })} aria-label="Section title" />
        ) : (
          <span className="el-title" onClick={() => setOpen(!open)}>
            {node.attrs.title || "Details"}
          </span>
        )}
      </div>
      <NodeViewContent className="el-body" style={open ? undefined : { display: "none" }} />
    </NodeViewWrapper>
  );
}

/** Index just past the </details> that closes the <details> at the start of src, or -1. */
function matchDetails(src: string): number {
  const re = /<\/?details\b[^>]*>/gi;
  let depth = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

export const Expand = Node.create({
  name: "expand",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({
    title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "", renderHTML: (a) => ({ "data-title": a.title }) },
  }),
  parseHTML: () => [{ tag: 'div[data-type="expand"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "expand" }), 0],
  addNodeView: () => ReactNodeViewRenderer(ExpandView),
  markdownTokenizer: {
    name: "expand",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}<details\b/im),
    tokenize: (src: string, _tokens: any, lexer: any) => {
      if (!/^ {0,3}<details\b[^>]*>/i.test(src)) return undefined;
      const end = matchDetails(src);
      if (end < 0) return undefined;
      const raw = src.slice(0, end) + (/^[ \t]*\n*/.exec(src.slice(end))?.[0] ?? "");
      let inner = src.slice(0, end).replace(/^ {0,3}<details\b[^>]*>/i, "").replace(/<\/details>\s*$/i, "");
      let title = "";
      const s = /^\s*<summary>([\s\S]*?)<\/summary>/i.exec(inner);
      if (s) {
        title = unescapeHtml(s[1].replace(/<[^>]+>/g, "")).trim();
        inner = inner.slice(s[0].length);
      }
      return { type: "expand", raw, title, tokens: lexer.blockTokens(inner.trim() + "\n") };
    },
  },
  parseMarkdown: (t: any, h: any) => h.createNode("expand", { title: t.title }, blockChildren(t.tokens, h)),
  renderMarkdown: (node: JSONContent, h: any) =>
    `<details>\n<summary>${escapeHtml(node.attrs?.title || "Details")}</summary>\n\n${renderBlocks(node, h)}\n\n</details>`,
});

/* ===== Status label ================================================================== */

export const STATUS_COLORS = ["grey", "blue", "green", "yellow", "red", "purple"] as const;
type StatusColor = (typeof STATUS_COLORS)[number];
const toColor = (s: string): StatusColor => {
  const c = s.toLowerCase() === "gray" ? "grey" : s.toLowerCase();
  return (STATUS_COLORS as readonly string[]).includes(c) ? (c as StatusColor) : "grey";
};

function StatusView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const color = toColor(node.attrs.color);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <NodeViewWrapper as="span" className="el-status-wrap" data-type="status" ref={box}>
      <span
        className={`el-status ${color}${selected ? " sel" : ""}`}
        onClick={() => editor.isEditable && setOpen(!open)}
        title={editor.isEditable ? "Click to edit" : undefined}
      >
        {node.attrs.text || "Status"}
      </span>
      {open && (
        <span className="el-status-pop" contentEditable={false}>
          <input
            autoFocus
            value={node.attrs.text}
            maxLength={40}
            onChange={(e) => updateAttributes({ text: e.target.value })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setOpen(false)}
            aria-label="Status text"
          />
          <span className="el-swatches">
            {STATUS_COLORS.map((c) => (
              <button key={c} type="button" className={`el-status ${c}${c === color ? " sel" : ""}`} onClick={() => updateAttributes({ color: c })} aria-label={c}>
                {c}
              </button>
            ))}
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Status = Node.create({
  name: "status",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    color: { default: "grey", parseHTML: (el) => toColor(el.getAttribute("data-color") ?? "grey"), renderHTML: (a) => ({ "data-color": a.color }) },
    text: { default: "", parseHTML: (el) => el.textContent ?? "", renderHTML: () => ({}) },
  }),
  parseHTML: () => [{ tag: 'span[data-type="status"]' }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "status", class: `el-status ${node.attrs.color}` }), node.attrs.text],
  renderText: ({ node }) => node.attrs.text,
  addNodeView: () => ReactNodeViewRenderer(StatusView),
  markdownTokenizer: {
    name: "status",
    level: "inline",
    start: (src: string) => src.indexOf("{{status:"),
    tokenize: (src: string) => {
      const m = /^\{\{status:([a-z]+):([^}\n]{1,40})\}\}/i.exec(src);
      return m ? { type: "status", raw: m[0], color: toColor(m[1]), text: m[2].trim() } : undefined;
    },
  },
  parseMarkdown: (t: any, h: any) => h.createNode("status", { color: t.color, text: t.text }),
  renderMarkdown: (node: JSONContent) => `{{status:${toColor(node.attrs?.color ?? "grey")}:${String(node.attrs?.text ?? "").replace(/[{}\n]/g, "") || "Status"}}}`,
});

export const pageElements = [TableOfContents, ChildPages, Callout, Expand, Status];
