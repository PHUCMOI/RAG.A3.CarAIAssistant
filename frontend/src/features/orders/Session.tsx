import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { request, ApiError, clearRequestState, type User } from "./api";
const Session = createContext<{
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({ user: null, loading: true, error: "", refresh: async () => {} });
export function OrdersSession({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    if (!user) setLoading(true);
    setError("");
    try {
      setUser(await request<User>("/me"));
    } catch (err) {
      setUser(null);
      clearRequestState();
      if (!(err instanceof ApiError && err.status === 401))
        setError("Không kết nối được dịch vụ đơn hàng.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const expire = () => {
      setUser(null);
      clearRequestState();
    };
    window.addEventListener("account-session-expired", expire);
    return () => window.removeEventListener("account-session-expired", expire);
  }, []);
  return (
    <Session.Provider value={{ user, loading, error, refresh }}>
      {children}
    </Session.Provider>
  );
}
export const useOrdersSession = () => useContext(Session);
