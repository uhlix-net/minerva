import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useSession } from "../App";
import { api, pageUrl, timeAgo, type Space } from "../api";

interface Recent {
  id: number;
  title: string;
  space_key: string;
  space_name: string;
  space_color: string;
  updated_at: string;
  updated_by: string | null;
}

export function SpaceCard({ s }: { s: Space }) {
  return (
    <Link className="card" to={`/s/${s.key}`}>
      <span className="space-badge" style={{ background: s.color }}>
        {s.key.slice(0, 2)}
      </span>
      <h3>{s.name}</h3>
      <p>{s.description || <span className="muted">No description</span>}</p>
      <p className="muted" style={{ marginTop: 8, fontSize: "0.82em" }}>
        {s.page_count} pages{s.updated_at ? ` · updated ${timeAgo(s.updated_at)}` : ""}
      </p>
    </Link>
  );
}

export function Home() {
  const { me, meta } = useSession();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => {
    api.get<Space[]>("/api/spaces").then(setSpaces);
    api.get<Recent[]>("/api/recent").then(setRecent);
  }, []);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="dash">
      <div className="hero">
        <img src="/minerva-mark.svg" alt="" />
        <div>
          <h1>
            {greet}, {me?.display_name.split(" ")[0]}
          </h1>
          <p>Welcome to {meta?.siteName}.</p>
        </div>
      </div>

      <div className="section-title">Spaces</div>
      {spaces.length ? (
        <div className="grid">
          {spaces.map((s) => (
            <SpaceCard key={s.id} s={s} />
          ))}
        </div>
      ) : (
        <p className="muted">No spaces yet. Use “New space” to create the first one.</p>
      )}

      <div className="section-title">Recently updated</div>
      <div className="list">
        {recent.map((r) => (
          <Link key={r.id} className="list-row" to={pageUrl(r.space_key, r.id)}>
            <span className="space-badge" style={{ background: r.space_color, width: 26, height: 26, fontSize: 10 }}>
              {r.space_key.slice(0, 2)}
            </span>
            <span className="grow">
              <div className="t">{r.title}</div>
              <div className="s">{r.space_name}</div>
            </span>
            <span className="s">
              <Clock size={12} style={{ verticalAlign: -1 }} /> {timeAgo(r.updated_at)}
              {r.updated_by ? ` by ${r.updated_by}` : ""}
            </span>
          </Link>
        ))}
        {!recent.length && <div className="list-row muted">Nothing yet.</div>}
      </div>
    </div>
  );
}
