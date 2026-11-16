import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, pageUrl, timeAgo } from "../api";

interface Hit {
  id: number;
  title: string;
  space_key: string;
  space_name: string;
  updated_at: string;
  snippet: string;
}

/** ts_headline output with only <mark> kept; everything else is escaped. */
function safeSnippet(s: string) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}

export function SearchView() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    setHits(null);
    api.get<Hit[]>(`/api/search?q=${encodeURIComponent(q)}`).then(setHits);
  }, [q]);
  return (
    <div className="dash" style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Search results for “{q}”</h1>
      {hits === null ? (
        <p className="muted">Searching...</p>
      ) : hits.length === 0 ? (
        <p className="muted">No pages match.</p>
      ) : (
        <div className="list">
          {hits.map((h) => (
            <Link key={h.id} className="list-row" to={pageUrl(h.space_key, h.id)} style={{ display: "block" }}>
              <div className="t">{h.title}</div>
              <div className="s">
                {h.space_name} · updated {timeAgo(h.updated_at)}
              </div>
              <div className="snippet" style={{ marginTop: 4, color: "var(--text-subtle)" }} dangerouslySetInnerHTML={{ __html: safeSnippet(h.snippet) }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
