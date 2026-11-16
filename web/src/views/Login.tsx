import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useSession } from "../App";
import { api } from "../api";

const ERRORS: Record<string, string> = {
  sso_state: "The sign-in session expired. Try again.",
  sso_failed: "Single sign-on failed. Try again or use a password.",
  sso_not_allowed: "Your account is not in a group allowed to use Minerva.",
};

export function Login() {
  const { meta, refresh } = useSession();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState("");
  const [err, setErr] = useState(ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  const pw = meta?.providers.filter((p) => p.type === "password") ?? [];
  const sso = meta?.providers.filter((p) => p.type === "redirect") ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/auth/login", { username, password, provider: provider || undefined });
      await refresh();
      const next = params.get("next");
      nav(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <img className="logo" src="/minerva-mark.svg" alt="" />
        <h1>{meta?.siteName ?? "Minerva"}</h1>
        <p className="tag">Knowledge, kept sharp.</p>
        {sso.map((p) => (
          <a key={p.id} className="btn primary" href={p.loginPath}>
            <LogIn size={16} /> {p.label}
          </a>
        ))}
        {sso.length > 0 && pw.length > 0 && <div className="or">or sign in with a password</div>}
        {pw.length > 0 && (
          <form onSubmit={submit}>
            <label className="field">
              <span>Username</span>
              <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {pw.length > 1 && (
              <label className="field">
                <span>Account type</span>
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="">Automatic</option>
                  {pw.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {err && <div className="error-msg">{err}</div>}
            <button className={`btn ${sso.length ? "" : "primary"}`} disabled={busy || !username}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}
        {pw.length === 0 && err && <div className="error-msg">{err}</div>}
        <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 20 }}>
          Minerva {meta?.version}
        </p>
      </div>
    </div>
  );
}
