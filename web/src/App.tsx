import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { api, ApiError, type Me, type Meta } from "./api";
import { PrefsProvider } from "./prefs";
import { Layout } from "./views/Layout";
import { Login } from "./views/Login";
import { Home } from "./views/Home";
import { SpacesView } from "./views/SpacesView";
import { SpaceHome } from "./views/SpaceHome";
import { PageView } from "./views/PageView";
import { PageEdit } from "./views/PageEdit";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";
import { HelpView, UserGuideView } from "./views/HelpView";

interface Session {
  me: Me | null;
  meta: Meta | null;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Session>({ me: null, meta: null, refresh: async () => {} });
export const useSession = () => useContext(SessionContext);

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const loc = useLocation();

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/api/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([api.get<Meta>("/api/meta").then(setMeta), refresh()]).finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (meta) document.title = meta.siteName;
  }, [meta]);

  if (loading) return null;

  return (
    <SessionContext.Provider value={{ me, meta, refresh }}>
      <PrefsProvider me={me}>
        {!me ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/spaces" element={<SpacesView />} />
              <Route path="/s/:key" element={<SpaceHome />} />
              <Route path="/s/:key/p/:id" element={<PageView />} />
              <Route path="/s/:key/p/:id/edit" element={<PageEdit />} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/help" element={<HelpView />} />
              <Route path="/guide" element={<UserGuideView />} />
              <Route path="/about" element={<Navigate to="/help" replace />} />
              <Route path="/admin" element={<Navigate to="/settings?tab=status" replace />} />
              <Route path="*" element={<div className="dash">Page not found.</div>} />
            </Route>
          </Routes>
        )}
      </PrefsProvider>
    </SessionContext.Provider>
  );
}
