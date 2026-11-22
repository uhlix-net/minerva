import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, pageUrl } from "../api";

const COLORS = ["#8e1c1a", "#0c66e4", "#1f845a", "#b65c02", "#6e5dc6", "#c9372c", "#2e3440", "#0e7490"];

export function CreateSpaceModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState("");

  const autoKey = (n: string) =>
    n
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w, _, a) => (a.length > 1 ? w[0] : w.slice(0, 6)))
      .join("")
      .slice(0, 8);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ key: string; homePageId: number }>("/api/spaces", { name, key, description, color });
      onClose();
      nav(pageUrl(r.key, r.homePageId));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <h2>Create a space</h2>
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!keyEdited) setKey(autoKey(e.target.value));
            }}
          />
        </label>
        <label className="field">
          <span>Space key (used in links)</span>
          <input
            className="input"
            value={key}
            onChange={(e) => {
              setKeyEdited(true);
              setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field">
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Color
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                onClick={() => setColor(c)}
                style={{ width: 28, height: 28, borderRadius: 6, border: 0, background: c, cursor: "pointer", outline: c === color ? "3px solid var(--accent)" : "none", outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>
        {err && <div className="error-msg">{err}</div>}
        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name || key.length < 2}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
