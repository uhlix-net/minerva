import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { api, pageUrl, type Space } from "../api";

/** /s/:key goes to the space's home page. */
export function SpaceHome() {
  const { key } = useParams();
  const [space, setSpace] = useState<Space | null | undefined>(undefined);
  useEffect(() => {
    api.get<Space>(`/api/spaces/${key}`).then(setSpace).catch(() => setSpace(null));
  }, [key]);
  if (space === undefined) return null;
  if (!space) return <div className="dash">Space not found.</div>;
  if (space.home_page_id) return <Navigate to={pageUrl(space.key, space.home_page_id)} replace />;
  return <div className="dash">This space has no home page.</div>;
}
