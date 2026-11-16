import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  FileCode,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  Workflow,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { api } from "../api";

function B({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`btn${on ? " on" : ""}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

const DIAGRAM = `flowchart LR
  user([User]) --> app[Minerva]
  app --> db[(PostgreSQL)]`;

export function Toolbar({ editor, pageId, right }: { editor: Editor; pageId?: number; right?: ReactNode }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : e.isActive("heading", { level: 4 })
              ? "h4"
              : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      table: e.isActive("table"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      color: (e.getAttributes("textStyle").color as string) ?? "#000000",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  const setBlock = (v: string) => {
    if (v === "p") c().setParagraph().run();
    else c().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 }).run();
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link URL (empty to remove)", prev);
    if (url === null) return;
    if (url === "") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url }).run();
  };

  const upload = async (f: File) => {
    const fd = new FormData();
    if (pageId) fd.append("pageId", String(pageId));
    fd.append("file", f);
    try {
      const r = await api.post<{ url: string }>("/api/attachments", fd);
      c().setImage({ src: r.url, alt: f.name }).run();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <B title="Undo (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!s.canUndo}>
        <Undo2 size={16} />
      </B>
      <B title="Redo (Ctrl+Shift+Z)" onClick={() => c().redo().run()} disabled={!s.canRedo}>
        <Redo2 size={16} />
      </B>
      <span className="sep" />
      <select value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
      </select>
      <span className="sep" />
      <B title="Bold (Ctrl+B)" on={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold size={16} />
      </B>
      <B title="Italic (Ctrl+I)" on={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic size={16} />
      </B>
      <B title="Underline (Ctrl+U)" on={s.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline size={16} />
      </B>
      <B title="Strikethrough" on={s.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough size={16} />
      </B>
      <B title="Inline code" on={s.code} onClick={() => c().toggleCode().run()}>
        <Code size={16} />
      </B>
      <input type="color" title="Text color" aria-label="Text color" value={s.color} onChange={(e) => c().setColor(e.target.value).run()} />
      <B title="Highlight" on={s.highlight} onClick={() => c().toggleHighlight().run()}>
        <Highlighter size={16} />
      </B>
      <span className="sep" />
      <B title="Align left" on={s.left} onClick={() => c().setTextAlign("left").run()}>
        <AlignLeft size={16} />
      </B>
      <B title="Align center" on={s.center} onClick={() => c().setTextAlign("center").run()}>
        <AlignCenter size={16} />
      </B>
      <B title="Align right" on={s.right} onClick={() => c().setTextAlign("right").run()}>
        <AlignRight size={16} />
      </B>
      <span className="sep" />
      <B title="Bulleted list" on={s.bullet} onClick={() => c().toggleBulletList().run()}>
        <List size={16} />
      </B>
      <B title="Numbered list" on={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </B>
      <B title="Task list" on={s.task} onClick={() => c().toggleTaskList().run()}>
        <ListChecks size={16} />
      </B>
      <span className="sep" />
      <B title="Link (Ctrl+K)" on={s.link} onClick={setLink}>
        <Link2 size={16} />
      </B>
      <B title="Image" onClick={() => fileRef.current?.click()}>
        <ImagePlus size={16} />
      </B>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <B title="Table" on={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table size={16} />
      </B>
      {s.table && (
        <>
          <B title="Add row below" onClick={() => c().addRowAfter().run()}>
            +Row
          </B>
          <B title="Add column right" onClick={() => c().addColumnAfter().run()}>
            +Col
          </B>
          <B title="Delete row" onClick={() => c().deleteRow().run()}>
            −Row
          </B>
          <B title="Delete column" onClick={() => c().deleteColumn().run()}>
            −Col
          </B>
          <B title="Delete table" onClick={() => c().deleteTable().run()}>
            <Trash2 size={16} />
          </B>
        </>
      )}
      <B title="Quote" on={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote size={16} />
      </B>
      <B title="Code block" on={s.codeBlock} onClick={() => c().toggleCodeBlock().run()}>
        <FileCode size={16} />
      </B>
      <B title="Diagram (Mermaid)" onClick={() => c().insertContent({ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: DIAGRAM }] }).run()}>
        <Workflow size={16} />
      </B>
      <B title="Divider" onClick={() => c().setHorizontalRule().run()}>
        <Minus size={16} />
      </B>
      <span className="grow" />
      {right}
    </div>
  );
}
