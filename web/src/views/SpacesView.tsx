import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Space } from "../api";
import { CreateSpaceModal } from "./CreateSpaceModal";
import { SpaceCard } from "./Home";

export function SpacesView() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState(false);
  useEffect(() => {
    api.get<Space[]>("/api/spaces").then(setSpaces);
  }, []);
  const f = filter.toLowerCase();
  const shown = spaces.filter((s) => !f || s.name.toLowerCase().includes(f) || s.key.toLowerCase().includes(f));
  return (
    <div className="dash">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, flex: 1 }}>Spaces</h1>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Filter spaces" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn primary" onClick={() => setModal(true)}>
          <Plus size={16} /> New space
        </button>
      </div>
      <div className="grid">
        {shown.map((s) => (
          <SpaceCard key={s.id} s={s} />
        ))}
      </div>
      {modal && <CreateSpaceModal onClose={() => setModal(false)} />}
    </div>
  );
}
