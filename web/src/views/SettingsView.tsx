import { useState, type FormEvent } from "react";
import { useSession } from "../App";
import { api } from "../api";
import { Navigate, useSearchParams } from "react-router";
import { DENSITIES, THEMES, usePrefs, WIDTHS } from "../prefs";
import { SystemStatus, Users } from "./SystemStatus";
import { AuthSettings } from "./AuthSettings";

/** Settings (administrators): Users, Authentication, System Status. Personal preferences are under /preferences. */
export function SettingsView() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  if (!me?.is_admin) return <Navigate to="/preferences" replace />;
  const asked = params.get("tab");
  const tab = asked === "auth" || asked === "status" ? asked : "users";
  return (
    <div className="dash" style={{ maxWidth: 1100 }}>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <div className="tabs">
        <button className={tab === "users" ? "on" : ""} onClick={() => setParams({})}>
          Users
        </button>
        <button className={tab === "auth" ? "on" : ""} onClick={() => setParams({ tab: "auth" })}>
          Authentication
        </button>
        <button className={tab === "status" ? "on" : ""} onClick={() => setParams({ tab: "status" })}>
          System Status
        </button>
      </div>
      {tab === "auth" ? <AuthSettings /> : tab === "status" ? <SystemStatus /> : <Users />}
    </div>
  );
}

/** Preferences (every user, from the account menu): theme, page width, spacing, editor, password. */
export function PreferencesView() {
  const { me } = useSession();
  const { prefs, setPrefs } = usePrefs();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.put("/api/me/password", { current: cur, next });
      setMsg("Password changed.");
      setCur("");
      setNext("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="dash" style={{ maxWidth: 1100 }}>
      <h1 style={{ marginTop: 0 }}>Preferences</h1>
      <div className="section-title">Theme</div>
      <div className="choice-grid">
        {THEMES.map((t) => (
          <button key={t.id} className={`choice${prefs.theme === t.id ? " on" : ""}`} onClick={() => setPrefs({ theme: t.id })}>
            <span className="swatch" style={{ width: 28, height: 28 }}>
              {t.swatch.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {t.name}
          </button>
        ))}
      </div>

      <div className="section-title">Page width</div>
      <div className="choice-grid">
        {WIDTHS.map((w) => (
          <button key={w.id} className={`choice${prefs.width === w.id ? " on" : ""}`} onClick={() => setPrefs({ width: w.id })} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <strong>{w.name}</strong>
            <span className="muted" style={{ fontSize: "0.85em" }}>
              {w.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="section-title">Spacing</div>
      <div className="choice-grid">
        {DENSITIES.map((d) => (
          <button key={d.id} className={`choice${prefs.density === d.id ? " on" : ""}`} onClick={() => setPrefs({ density: d.id })}>
            {d.name}
          </button>
        ))}
      </div>

      <div className="section-title">Default editor</div>
      <div className="choice-grid">
        {(["visual", "markdown"] as const).map((m) => (
          <button key={m} className={`choice${prefs.editorMode === m ? " on" : ""}`} onClick={() => setPrefs({ editorMode: m })}>
            {m === "visual" ? "Visual (word processor)" : "Markdown source"}
          </button>
        ))}
      </div>

      <div className="section-title">Account</div>
      <div className="card">
        <p style={{ margin: 0 }}>
          <strong>{me?.display_name}</strong> ({me?.username}){me?.email ? ` · ${me.email}` : ""}
        </p>
        {me?.auth_source === "local" ? (
          <form onSubmit={changePw} style={{ marginTop: 16, maxWidth: 360 }}>
            <label className="field">
              <span>Current password</span>
              <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </label>
            <label className="field">
              <span>New password</span>
              <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            {msg && <p className="muted">{msg}</p>}
            <button className="btn primary" disabled={!cur || !next}>
              Change password
            </button>
          </form>
        ) : (
          <p className="muted">Your password is managed by your identity provider ({me?.auth_source.toUpperCase()}).</p>
        )}
      </div>
    </div>
  );
}
