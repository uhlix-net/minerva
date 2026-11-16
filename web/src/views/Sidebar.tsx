import { ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, pageUrl, type Space, type TreeNode } from "../api";

type SpaceTree = Space & { tree: TreeNode[] };

function useSpace(key: string) {
  const [space, setSpace] = useState<SpaceTree | null>(null);
  const load = useCallback(() => {
    api.get<SpaceTree>(`/api/spaces/${key}`).then(setSpace).catch(() => setSpace(null));
  }, [key]);
  useEffect(() => {
    load();
    window.addEventListener("minerva:tree", load);
    return () => window.removeEventListener("minerva:tree", load);
  }, [load]);
  return space;
}

export function Sidebar({ spaceKey, collapsed }: { spaceKey: string; collapsed: boolean }) {
  const space = useSpace(spaceKey);
  const { id } = useParams();
  const current = Number(id);
  const nav = useNavigate();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const kids = useMemo(() => {
    const m = new Map<number | null, TreeNode[]>();
    for (const n of space?.tree ?? []) m.set(n.parent_id, [...(m.get(n.parent_id) ?? []), n]);
    return m;
  }, [space]);

  // Expand the path to the current page.
  useEffect(() => {
    if (!space || !current) return;
    const byId = new Map(space.tree.map((n) => [n.id, n]));
    const s = new Set(open);
    let n = byId.get(current);
    while (n?.parent_id) {
      s.add(n.parent_id);
      n = byId.get(n.parent_id);
    }
    if (space.home_page_id) s.add(space.home_page_id);
    setOpen(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, current]);

  const addChild = async (parentId: number) => {
    const title = window.prompt("Title of the new page");
    if (!title) return;
    const r = await api.post<{ id: number }>("/api/pages", { space: spaceKey, parentId, title });
    window.dispatchEvent(new Event("minerva:tree"));
    nav(pageUrl(spaceKey, r.id) + "/edit");
  };

  const drop = async (target: number) => {
    if (drag === null || drag === target) return;
    try {
      await api.post(`/api/pages/${drag}/move`, { parentId: target, position: 9999 });
      setOpen((s) => new Set(s).add(target));
      window.dispatchEvent(new Event("minerva:tree"));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const render = (parent: number | null) => (
    <ul className="tree">
      {(kids.get(parent) ?? []).map((n) => {
        const has = kids.has(n.id);
        const isOpen = open.has(n.id);
        return (
          <li key={n.id}>
            <div
              className={`tree-row${n.id === current ? " active" : ""}${over === n.id ? " drop-into" : ""}`}
              draggable={n.id !== space?.home_page_id}
              onDragStart={() => setDrag(n.id)}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (drag !== null && drag !== n.id) {
                  e.preventDefault();
                  setOver(n.id);
                }
              }}
              onDragLeave={() => setOver((o) => (o === n.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(n.id);
              }}
            >
              <button
                className="twisty"
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={() => setOpen((s) => {
                  const c = new Set(s);
                  if (c.has(n.id)) c.delete(n.id);
                  else c.add(n.id);
                  return c;
                })}
                style={{ visibility: has ? "visible" : "hidden" }}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Link to={pageUrl(spaceKey, n.id)} title={n.title}>
                {n.title}
              </Link>
              <button className="twisty add" title="Add child page" aria-label="Add child page" onClick={() => addChild(n.id)}>
                <Plus size={14} />
              </button>
            </div>
            {has && isOpen && render(n.id)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      {space && (
        <>
          <Link to={`/s/${space.key}`} className="space-head" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="space-badge" style={{ background: space.color }}>
              {space.key.slice(0, 2)}
            </span>
            <span>
              <div className="name">{space.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {space.tree.length} pages
              </div>
            </span>
          </Link>
          <div className="side-section">
            <div className="side-title">
              <span>
                <FileText size={12} style={{ verticalAlign: -1 }} /> Content
              </span>
            </div>
            {render(null)}
          </div>
        </>
      )}
    </aside>
  );
}
