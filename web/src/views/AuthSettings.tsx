import { CheckCircle2, PlugZap, RotateCcw, Save, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";

type Source = "environment" | "database";
interface OidcSettings {
  enabled: boolean;
  issuer: string;
  clientId: string;
  displayName: string;
  scopes: string;
  usernameClaim: string;
  groupsClaim: string;
  adminGroups: string[];
  allowedGroups: string[];
  hasSecret: boolean;
  source: Source;
  redirectUri?: string;
}
interface LdapSettings {
  enabled: boolean;
  url: string;
  bindDn: string;
  userBase: string;
  userFilter: string;
  usernameAttr: string;
  displayNameAttr: string;
  emailAttr: string;
  adminGroups: string[];
  allowedGroups: string[];
  displayName: string;
  caFile: string;
  hasSecret: boolean;
  source: Source;
}
interface AuthState {
  oidc: OidcSettings;
  ldap: LdapSettings;
  modules: Record<"oidc" | "ldap", { loaded: boolean; active: boolean }>;
}
interface TestResult {
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

type Field<T> = { key: keyof T & string; label: string; hint?: ReactNode; list?: boolean; placeholder?: string; wide?: boolean };

const OIDC_FIELDS: Field<OidcSettings>[] = [
  { key: "issuer", label: "Issuer URL", placeholder: "https://auth.example.com/application/o/minerva/", wide: true, hint: "Discovery is read from <issuer>/.well-known/openid-configuration." },
  { key: "clientId", label: "Client ID" },
  { key: "displayName", label: "Sign-in button label" },
  { key: "scopes", label: "Scopes", hint: "Space separated." },
  { key: "usernameClaim", label: "Username claim" },
  { key: "groupsClaim", label: "Groups claim" },
  { key: "adminGroups", label: "Admin groups", list: true, hint: "One per line. Members become Minerva administrators." },
  { key: "allowedGroups", label: "Allowed groups", list: true, hint: "One per line. Empty = anyone the provider lets through." },
];
const LDAP_FIELDS: Field<LdapSettings>[] = [
  { key: "url", label: "Server URL", placeholder: "ldaps://dc01.example.com:636", wide: true },
  { key: "bindDn", label: "Service account (bind DN)", placeholder: "CN=svc-minerva,OU=Service,DC=example,DC=com", wide: true },
  { key: "userBase", label: "User search base", placeholder: "OU=Users,DC=example,DC=com", wide: true },
  { key: "userFilter", label: "User filter", wide: true, hint: <>Must contain <code>{"{{username}}"}</code>.</> },
  { key: "usernameAttr", label: "Username attribute" },
  { key: "displayNameAttr", label: "Display name attribute" },
  { key: "emailAttr", label: "Email attribute" },
  { key: "displayName", label: "Label on the sign-in form" },
  { key: "adminGroups", label: "Admin groups (DNs)", list: true, wide: true, hint: "One full group DN (from memberOf) per line." },
  { key: "allowedGroups", label: "Allowed groups (DNs)", list: true, wide: true, hint: "One DN per line. Empty = any user found under the search base." },
  { key: "caFile", label: "CA certificate file", placeholder: "/etc/minerva/ca/ca.pem", wide: true, hint: "Path inside the container. Empty = system trust store (plus NODE_EXTRA_CA_CERTS)." },
];

function ProviderForm<T extends OidcSettings | LdapSettings>(props: {
  kind: "oidc" | "ldap";
  title: string;
  intro: ReactNode;
  value: T;
  active: boolean;
  moduleLoaded: boolean;
  fields: Field<T>[];
  secretLabel: string;
  onSaved: () => void;
}) {
  const { kind, value, fields } = props;
  const toForm = (v: T) => {
    const f: Record<string, string | boolean> = { enabled: v.enabled };
    for (const fd of fields) {
      const x = v[fd.key] as unknown;
      f[fd.key] = Array.isArray(x) ? x.join("\n") : String(x ?? "");
    }
    return f;
  };
  const [form, setForm] = useState(() => toForm(value));
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [tUser, setTUser] = useState("");
  const [tPass, setTPass] = useState("");
  useEffect(() => setForm(toForm(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = secret !== "" || JSON.stringify(form) !== JSON.stringify(toForm(value));
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { ...form };
      if (secret) body[kind === "oidc" ? "clientSecret" : "bindPassword"] = secret;
      await api.put(`/api/admin/auth/${kind}`, body);
      setSecret("");
      setMsg({ ok: true, text: "Saved. Takes effect immediately." });
      props.onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm(`Discard the ${props.title} settings saved here and use the values from the environment (Helm values)?`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/auth/${kind}`);
      setSecret("");
      setMsg({ ok: true, text: "Now using the environment settings." });
      props.onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const runTest = async () => {
    setTest({ status: "skip", detail: "Testing..." });
    try {
      setTest(await api.post<TestResult>(`/api/admin/auth/${kind}/test`, kind === "ldap" && tUser && tPass ? { username: tUser, password: tPass } : {}));
    } catch (e) {
      setTest({ status: "fail", detail: (e as Error).message });
    }
  };

  return (
    <div className="card auth-card">
      <div className="auth-head">
        <h3>{props.title}</h3>
        {!props.moduleLoaded ? (
          <span className="lozenge">module not loaded</span>
        ) : props.active ? (
          <span className="lozenge ok">active</span>
        ) : value.enabled ? (
          <span className="lozenge warn">incomplete</span>
        ) : (
          <span className="lozenge">off</span>
        )}
        <span className="lozenge" title="Where the current values come from">
          {value.source === "database" ? "saved in Minerva" : "from environment"}
        </span>
      </div>
      <p className="muted">{props.intro}</p>
      {!props.moduleLoaded && (
        <p className="error-msg">
          The <code>auth-{kind}</code> module is not in <code>MINERVA_MODULES</code>; these settings have no effect until it is.
        </p>
      )}
      <label className="toggle">
        <input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => set("enabled", e.target.checked)} />
        <span>Enable {props.title}</span>
      </label>
      {"redirectUri" in value && value.redirectUri && (
        <p className="auth-note">
          Redirect URI to register with the provider: <code>{value.redirectUri}</code>
        </p>
      )}
      <div className="auth-grid">
        {fields.map((f) => (
          <label key={f.key} className={`field${f.wide ? " wide" : ""}`}>
            <span>{f.label}</span>
            {f.list ? (
              <textarea className="textarea" rows={3} value={String(form[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} spellCheck={false} />
            ) : (
              <input className="input" value={String(form[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} spellCheck={false} />
            )}
            {f.hint && <small className="muted">{f.hint}</small>}
          </label>
        ))}
        <label className="field">
          <span>{props.secretLabel}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={secret}
            placeholder={value.hasSecret ? "•••••••• (set; leave empty to keep)" : "not set"}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
      </div>
      {msg && <p className={msg.ok ? "muted" : "error-msg"}>{msg.text}</p>}
      <div className="auth-actions">
        <button className="btn primary" onClick={save} disabled={busy || !dirty}>
          <Save size={15} /> Save
        </button>
        {value.source === "database" && (
          <button className="btn" onClick={reset} disabled={busy}>
            <RotateCcw size={15} /> Use environment settings
          </button>
        )}
        <span className="spacer" />
        {kind === "ldap" && (
          <>
            <input className="input auth-test-input" placeholder="Test user (optional)" value={tUser} onChange={(e) => setTUser(e.target.value)} autoComplete="off" />
            <input className="input auth-test-input" type="password" placeholder="Password" value={tPass} onChange={(e) => setTPass(e.target.value)} autoComplete="new-password" />
          </>
        )}
        <button className="btn" onClick={runTest} disabled={dirty} title={dirty ? "Save first; the test uses the saved settings" : "Test the saved settings"}>
          <PlugZap size={15} /> Test
        </button>
      </div>
      {test && (
        <p className={`auth-test ${test.status}`}>
          {test.status === "ok" ? <CheckCircle2 size={15} /> : test.status === "fail" ? <XCircle size={15} /> : null} {test.detail}
        </p>
      )}
    </div>
  );
}

export function AuthSettings() {
  const [state, setState] = useState<AuthState | null>(null);
  const [err, setErr] = useState("");
  const load = () =>
    api
      .get<AuthState>("/api/admin/auth")
      .then(setState)
      .catch((e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  if (err) return <p className="error-msg">{err}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Local Minerva accounts always work. The providers below are added to the sign-in page when they are enabled and complete. Values start from the
        environment (Helm values and secrets); saving here stores them in the Minerva database, where they override the environment. Secrets are never shown
        again after saving.
      </p>
      <ProviderForm
        kind="oidc"
        title="OpenID Connect (SSO)"
        intro="Single sign-on through Authentik, Keycloak, Entra ID or any OpenID Connect provider. Users get a sign-in button on the login page."
        value={state.oidc}
        active={state.modules.oidc.active}
        moduleLoaded={state.modules.oidc.loaded}
        fields={OIDC_FIELDS}
        secretLabel="Client secret"
        onSaved={load}
      />
      <ProviderForm
        kind="ldap"
        title="LDAP / Active Directory"
        intro="Users sign in on the normal form with their directory username and password. Minerva searches with the service account, then binds as the user."
        value={state.ldap}
        active={state.modules.ldap.active}
        moduleLoaded={state.modules.ldap.loaded}
        fields={LDAP_FIELDS}
        secretLabel="Service account password"
        onSaved={load}
      />
    </>
  );
}
