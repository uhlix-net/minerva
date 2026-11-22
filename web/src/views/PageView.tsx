import { ChevronRight, Clock, FileText, History, Maximize2, Minimize2, MoreHorizontal, Pencil, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, pageUrl, timeAgo, type Page } from "../api";
import { DocView } from "../editor/Doc";
import { usePrefs } from "../prefs";
import { initials } from "./Layout";

interface Version {
  version: number;
  title: string;
  created_at: string;
  updated_by: string | null;
}

function HistoryDrawer({ page, onClose, onPreview }: { page: Page; onClose: () => void; onPreview: (v: number | null) => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  useEffect(() => {
    api.get<Version[]>(`/api/pages/${page.id}/versions`).then(setVersions);
  }, [page.id, page.version]);
  return (
    <aside className="drawer">
      <header>
        <span>
          <History size={16} style={{ verticalAlign: -3 }} /> Page history
        </span>
        <button className="btn subtle icon" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>
      <div className="content">
        {versions.map((v) => (
          <button key={v.version} className="list-row" style={{ width: "100%", border: 0, background: "none", cursor: "pointer", textAlign: "left" }} onClick={() => onPreview(v.version === page.version ? null : v.version)}>
            <span className="lozenge">v{v.version}</span>
            <span className="grow">
              <div className="t">{v.version === page.version ? "Current version" : v.title}</div>
              <div className="s">
                {v.updated_by ?? "unknown"} · {timeAgo(v.created_at)}
              </div>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function PageView() {
  const { key, id } = useParams();
  const nav = useNavigate();
  const { prefs, setPrefs } = usePrefs();
  const [page, setPage] = useState<Page | null>(null);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState<{ version: number; title: string; body: unknown; body_md: string | null } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setErr("");
    api
      .get<Page>(`/api/pages/${id}`)
      .then((p) => {
        setPage(p);
        document.title = `${p.title} · ${p.space_name}`;
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    load();
    setPreview(null);
  }, [load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "e" && !(e.target as HTMLElement).closest("input,textarea,[contenteditable=true]") && !e.ctrlKey && !e.metaKey) nav(`/s/${key}/p/${id}/edit`);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [key, id, nav]);

  const showVersion = async (v: number | null) => {
    if (v === null) return setPreview(null);
    setPreview(await api.get(`/api/pages/${id}/versions/${v}`));
  };

  const restore = async () => {
    if (!page || !preview) return;
    await api.put(`/api/pages/${page.id}`, { title: preview.title, body: preview.body, bodyMd: preview.body_md, version: page.version });
    setPreview(null);
    window.dispatchEvent(new Event("minerva:tree"));
    load();
  };

  const remove = async () => {
    if (!page || !window.confirm(`Delete "${page.title}" and all of its child pages?`)) return;
    try {
      await api.del(`/api/pages/${page.id}`);
      window.dispatchEvent(new Event("minerva:tree"));
      nav(page.parent_id ? pageUrl(page.space_key, page.parent_id) : `/s/${page.space_key}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (err) return <div className="dash">{err}</div>;
  if (!page) return null;
  const shown = preview ?? page;
  const wide = prefs.width === "full" || prefs.width === "wide";

  return (
    <div className="page-wrap">
      <div className="page">
        <div className="page-bar">
          <nav className="crumbs" aria-label="Breadcrumbs">
            <Link to={`/s/${page.space_key}`}>{page.space_name}</Link>
            {page.ancestors.map((a) => (
              <span key={a.id} style={{ display: "contents" }}>
                <ChevronRight size={12} />
                <Link to={pageUrl(page.space_key, a.id)}>{a.title}</Link>
              </span>
            ))}
          </nav>
          <Link className="btn primary" to={`/s/${key}/p/${id}/edit`} title="Edit (E)">
            <Pencil size={15} /> Edit
          </Link>
          <button className="btn subtle icon" title={wide ? "Standard width" : "Full width"} aria-label="Toggle width" onClick={() => setPrefs({ width: wide ? "standard" : "full" })}>
            {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="btn subtle icon" title="Print (Ctrl+P)" aria-label="Print" onClick={() => window.print()}>
            <Printer size={16} />
          </button>
          <button className="btn subtle icon" title="Page history" aria-label="Page history" onClick={() => setHistory(!history)}>
            <History size={16} />
          </button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button className="btn subtle icon" aria-label="More actions" onClick={() => setMenu(!menu)}>
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <button className="item" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
                  <FileText size={16} /> Copy link
                </button>
                <button className="item" style={{ color: "var(--danger)" }} onClick={remove}>
                  <Trash2 size={16} /> Delete page
                </button>
              </div>
            )}
          </div>
        </div>

        {preview && (
          <div className="banner warn">
            <Clock size={16} />
            <span style={{ flex: 1 }}>You are viewing version {preview.version}. </span>
            <button className="btn" onClick={restore}>
              <RotateCcw size={14} /> Restore this version
            </button>
            <button className="btn subtle" onClick={() => setPreview(null)}>
              Back to current
            </button>
          </div>
        )}

        <h1 className="page-title">{shown.title}</h1>
        <div className="byline">
          <span className="avatar">{initials(page.updated_by ?? "?")}</span>
          <span>
            {page.updated_by ? `Last updated by ${page.updated_by}` : "Updated"} {timeAgo(page.updated_at)} · v{page.version}
          </span>
        </div>

        <DocView doc={shown} pageId={page.id} spaceKey={page.space_key} />

        {page.children.length > 0 && !preview && (
          <div className="child-pages">
            <h4>Child pages</h4>
            <div className="list">
              {page.children.map((c) => (
                <Link key={c.id} className="list-row" to={pageUrl(page.space_key, c.id)}>
                  <FileText size={16} className="muted" /> <span className="t">{c.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      {history && <HistoryDrawer page={page} onClose={() => setHistory(false)} onPreview={showVersion} />}
    </div>
  );
}
