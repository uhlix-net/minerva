import { EditorContent, type Editor as TEditor } from "@tiptap/react";
import { Code2, Eye } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import { api, type Page } from "../api";
import { useDocEditor } from "../editor/Doc";
import { Toolbar } from "../editor/Toolbar";
import { usePrefs } from "../prefs";

function Editor({ page }: { page: Page }) {
  const nav = useNavigate();
  const { prefs, setPrefs } = usePrefs();
  const [title, setTitle] = useState(page.title);
  const [mode, setMode] = useState<"visual" | "markdown">(prefs.editorMode);
  const [markdown, setMarkdown] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const done = useRef(false);
  const editor = useDocEditor(page, () => setDirty(true));

  // Markdown mode edits the source; switching back re-parses it into the visual editor.
  useEffect(() => {
    if (editor && mode === "markdown") setMarkdown((editor as any).getMarkdown());
  }, [editor, mode]);

  const switchMode = (m: "visual" | "markdown") => {
    if (!editor || m === mode) return;
    if (m === "visual") editor.commands.setContent(markdown, { contentType: "markdown" } as any);
    setMode(m);
    setPrefs({ editorMode: m });
  };

  const save = useCallback(async () => {
    if (!editor) return;
    if (mode === "markdown") editor.commands.setContent(markdown, { contentType: "markdown" } as any);
    setSaving(true);
    setErr("");
    try {
      await api.put(`/api/pages/${page.id}`, {
        title: title.trim() || "Untitled",
        body: editor.getJSON(),
        bodyMd: (editor as any).getMarkdown(),
        bodyText: editor.getText(),
        version: page.version,
      });
      done.current = true;
      window.dispatchEvent(new Event("minerva:tree"));
      nav(`/s/${page.space_key}/p/${page.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [editor, mode, markdown, title, page, nav]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  const changed = dirty || title !== page.title;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => changed && !done.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("Discard your unsaved changes?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  if (!editor) return null;

  const actions = (
    <div className="edit-actions">
      <div className="btn-group" style={{ display: "flex", background: "var(--surface-hover)", borderRadius: 4 }}>
        <button className={`btn${mode === "visual" ? " on" : ""}`} onClick={() => switchMode("visual")} title="Visual editor">
          <Eye size={15} /> Visual
        </button>
        <button className={`btn${mode === "markdown" ? " on" : ""}`} onClick={() => switchMode("markdown")} title="Edit Markdown source">
          <Code2 size={15} /> Markdown
        </button>
      </div>
      <button
        className="btn subtle"
        style={{ color: "var(--text-subtle)" }}
        onClick={() => {
          done.current = true;
          nav(`/s/${page.space_key}/p/${page.id}`);
        }}
      >
        Cancel
      </button>
      <button className="btn primary" style={{ color: "var(--accent-text)", background: "var(--accent)" }} onClick={save} disabled={saving} title="Publish (Ctrl+S)">
        {saving ? "Publishing..." : "Publish"}
      </button>
    </div>
  );

  return (
    <div className="page-wrap">
      <div className="page">
        {mode === "visual" ? <Toolbar editor={editor} pageId={page.id} right={actions} /> : <div className="toolbar"><span className="muted" style={{ padding: "0 8px" }}>Markdown source</span><span className="grow" />{actions}</div>}
        {err && <div className="banner warn">{err}</div>}
        <input className="title-input" placeholder="Page title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Page title" />
        {mode === "visual" ? (
          <EditorArea editor={editor} />
        ) : (
          <textarea
            className="md-source"
            value={markdown}
            spellCheck={false}
            onChange={(e) => {
              setMarkdown(e.target.value);
              setDirty(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

function EditorArea({ editor }: { editor: TEditor }) {
  return <EditorContent editor={editor} />;
}

export function PageEdit() {
  const { id } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get<Page>(`/api/pages/${id}`).then(setPage).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="dash">{err}</div>;
  if (!page) return null;
  return <Editor key={page.id} page={page} />;
}
