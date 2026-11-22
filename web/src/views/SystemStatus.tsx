import { RefreshCw, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "../App";
import { api, timeAgo } from "../api";

interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  auth_source: string;
  is_admin: boolean;
  disabled: boolean;
  last_login: string | null;
}
interface Mod {
  id: string;
  name: string;
  description: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  source: string;
  checks: number;
}
interface CheckRow {
  id: string;
  name: string;
  module: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

/** Settings > Users (admins). */
export function Users() {
  const { me } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", email: "", password: "", isAdmin: false });
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api.get<User[]>("/api/admin/users").then(setUsers);
  }, []);
  useEffect(load, [load]);

  const update = async (u: User, body: object) => {
    try {
      await api.put(`/api/admin/users/${u.id}`, body);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/admin/users", form);
      setAdding(false);
      setForm({ username: "", displayName: "", email: "", password: "", isAdmin: false });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setAdding(!adding)}>
          <UserPlus size={16} /> Add local user
        </button>
      </div>
      {adding && (
        <form className="card" onSubmit={add} style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Username</span>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Display name</span>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Email</span>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Password</span>
            <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} /> Administrator
          </label>
          <button className="btn primary">Create</button>
          {err && <div className="error-msg">{err}</div>}
        </form>
      )}
      <table className="data">
        <thead>
          <tr>
            <th>User</th>
            <th>Source</th>
            <th>Last sign-in</th>
            <th>Admin</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <strong>{u.display_name}</strong>
                <div className="muted" style={{ fontSize: "0.85em" }}>
                  {u.username}
                  {u.email ? ` · ${u.email}` : ""}
                </div>
              </td>
              <td>
                <span className="lozenge">{u.auth_source}</span>
              </td>
              <td className="muted">{u.last_login ? timeAgo(u.last_login) : "never"}</td>
              <td>
                <input type="checkbox" checked={u.is_admin} disabled={u.id === me?.id || u.auth_source !== "local"} title={u.auth_source !== "local" ? "Set by identity provider groups" : ""} onChange={(e) => update(u, { isAdmin: e.target.checked })} />
              </td>
              <td>{u.disabled ? <span className="lozenge fail">disabled</span> : <span className="lozenge ok">active</span>}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {u.auth_source === "local" && (
                  <button
                    className="btn subtle"
                    onClick={() => {
                      const pw = window.prompt(`New password for ${u.username}`);
                      if (pw) update(u, { password: pw });
                    }}
                  >
                    Reset password
                  </button>
                )}
                {u.id !== me?.id && (
                  <button className="btn subtle" onClick={() => update(u, { disabled: !u.disabled })}>
                    {u.disabled ? "Enable" : "Disable"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Health() {
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const run = useCallback(() => {
    setRows(null);
    api.get<CheckRow[]>("/api/admin/checks").then(setRows);
  }, []);
  useEffect(run, [run]);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          The same checks run before every Helm install or upgrade.
        </p>
        <button className="btn" onClick={run}>
          <RefreshCw size={15} /> Run again
        </button>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
            <th>Detail</th>
            <th>Module</th>
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <tr>
              <td colSpan={4} className="muted">
                Running checks...
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.module + r.id}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td>
                  <span className={`lozenge ${r.status}`}>{r.status}</span>
                </td>
                <td style={{ fontSize: "0.9em" }}>{r.detail}</td>
                <td className="muted">{r.module}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

function Modules() {
  const [mods, setMods] = useState<Mod[]>([]);
  useEffect(() => {
    api.get<Mod[]>("/api/admin/modules").then(setMods);
  }, []);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Enable built-in modules with <code>MINERVA_MODULES</code> (Helm value <code>modules</code>). Third-party modules load from <code>MINERVA_PLUGIN_DIR</code>.
      </p>
      <div className="grid">
        {mods.map((m) => (
          <div key={m.id} className="card">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="lozenge">{m.kind}</span>
              {!m.enabled ? <span className="lozenge">disabled</span> : m.configured ? <span className="lozenge ok">active</span> : <span className="lozenge warn">not configured</span>}
              {m.source === "plugin" && <span className="lozenge">plugin</span>}
            </div>
            <h3>{m.name}</h3>
            <p>{m.description}</p>
            <p className="muted" style={{ marginTop: 8, fontSize: "0.8em" }}>
              <code>{m.id}</code>
              {m.checks ? ` · ${m.checks} check(s)` : ""}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

/** Settings > System Status (admins): health checks, users, modules. */
export function SystemStatus() {
  const [tab, setTab] = useState<"health" | "modules">("health");
  const { meta } = useSession();
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {meta?.siteName} {meta?.version}
      </p>
      <div className="tabs subtabs">
        <button className={tab === "health" ? "on" : ""} onClick={() => setTab("health")}>
          System health
        </button>
        <button className={tab === "modules" ? "on" : ""} onClick={() => setTab("modules")}>
          Modules
        </button>
      </div>
      {tab === "health" ? <Health /> : <Modules />}
    </>
  );
}
