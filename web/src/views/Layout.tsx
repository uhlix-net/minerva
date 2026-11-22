import { BookOpen, Check, ChevronDown, CircleHelp, LayoutGrid, LogOut, Palette, PanelLeft, Plus, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useSession } from "../App";
import { api, pageUrl } from "../api";
import { DENSITIES, THEMES, usePrefs, WIDTHS } from "../prefs";
import { CreateSpaceModal } from "./CreateSpaceModal";
import { Sidebar } from "./Sidebar";

export const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, close]);
}

function AppearanceMenu() {
  const { prefs, setPrefs } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn subtle icon" title="Appearance" aria-label="Appearance" onClick={() => setOpen(!open)}>
        <Palette size={18} />
      </button>
      {open && (
        <div className="menu">
          <div className="label">Theme</div>
          {THEMES.map((t) => (
            <button key={t.id} className={`item${prefs.theme === t.id ? " active" : ""}`} onClick={() => setPrefs({ theme: t.id })}>
              <span className="swatch">
                {t.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span style={{ flex: 1 }}>{t.name}</span>
              {prefs.theme === t.id && <Check size={14} />}
            </button>
          ))}
          <hr />
          <div className="label">Page width</div>
          {WIDTHS.map((w) => (
            <button key={w.id} className={`item${prefs.width === w.id ? " active" : ""}`} onClick={() => setPrefs({ width: w.id })}>
              <span style={{ flex: 1 }}>{w.name}</span>
              {prefs.width === w.id && <Check size={14} />}
            </button>
          ))}
          <hr />
          <div className="label">Spacing</div>
          {DENSITIES.map((d) => (
            <button key={d.id} className={`item${prefs.density === d.id ? " active" : ""}`} onClick={() => setPrefs({ density: d.id })}>
              <span style={{ flex: 1 }}>{d.name}</span>
              {prefs.density === d.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  if (!me) return null;
  const logout = async () => {
    await api.post("/api/auth/logout");
    await refresh();
    nav("/login");
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn subtle" onClick={() => setOpen(!open)} aria-label="Account" style={{ paddingLeft: 4 }}>
        <span className="avatar">{initials(me.display_name)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          <div style={{ padding: "8px 14px" }}>
            <div style={{ fontWeight: 700 }}>{me.display_name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {me.username} · {me.auth_source === "local" ? "Minerva account" : me.auth_source.toUpperCase()}
            </div>
          </div>
          <hr />
          <Link className="item" to="/settings">
            <Settings size={16} /> Settings
          </Link>
          <hr />
          <button className="item" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CreateButton() {
  const { key, id } = useParams();
  const nav = useNavigate();
  const [spaceModal, setSpaceModal] = useState(false);
  const create = async () => {
    if (!key) return setSpaceModal(true);
    const title = window.prompt("Title of the new page");
    if (!title) return;
    const r = await api.post<{ id: number }>("/api/pages", { space: key, parentId: id ? Number(id) : null, title });
    window.dispatchEvent(new Event("minerva:tree"));
    nav(pageUrl(key, r.id) + "/edit");
  };
  return (
    <>
      <button className="btn primary" onClick={create} title={key ? "Create a page here" : "Create a space"}>
        <Plus size={16} /> <span className="hide-sm">{key ? "Create" : "New space"}</span>
      </button>
      {spaceModal && <CreateSpaceModal onClose={() => setSpaceModal(false)} />}
    </>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) => `btn subtle${isActive ? " on" : ""}`;

export function Layout() {
  const { meta } = useSession();
  const { key } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const [sidebar, setSidebar] = useState(window.innerWidth > 800);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.innerWidth <= 800) setSidebar(false);
    // Pages scroll inside <main>, which stays mounted between routes: start each page at the top.
    mainRef.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="shell">
      <header className="topbar">
        {key && (
          <button className="btn subtle icon" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={() => setSidebar(!sidebar)}>
            <PanelLeft size={18} />
          </button>
        )}
        <Link to="/" className="brand">
          <img src="/minerva-mark.svg" alt="" />
          <span className="hide-sm">{meta?.siteName ?? "Minerva"}</span>
        </Link>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/spaces" className={navCls}>
            <LayoutGrid size={16} /> <span className="hide-sm">Spaces</span>
          </NavLink>
        </nav>
        <CreateButton />
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search size={15} />
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </form>
        <span className="spacer" />
        <nav className="topnav" aria-label="Settings and help">
          <NavLink to="/settings" className={navCls}>
            <Settings size={16} /> <span className="hide-sm">Settings</span>
          </NavLink>
          <NavLink to="/guide" className={navCls}>
            <BookOpen size={16} /> <span className="hide-sm">User Guide</span>
          </NavLink>
          <NavLink to="/help" className={navCls}>
            <CircleHelp size={16} /> <span className="hide-sm">Help</span>
          </NavLink>
        </nav>
        <AppearanceMenu />
        <UserMenu />
      </header>
      <div className="body">
        {key ? <Sidebar spaceKey={key} collapsed={!sidebar} /> : <div />}
        <main className="main" ref={mainRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
