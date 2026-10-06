import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import "./admin.css";

export function AdminHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <span className="section-kicker">KHÔNG GIAN QUẢN TRỊ</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="admin-toolbar">{actions}</div>}
    </header>
  );
}
export function AdminBadge({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const tone = [
    "completed",
    "converted",
    "confirmed",
    "approved",
    "resolved",
    "valid",
  ].includes(value)
    ? "positive"
    : ["cancelled", "rejected", "failed", "withdrawn", "missing"].includes(
          value,
        )
      ? "negative"
      : ["closed"].includes(value)
        ? "neutral"
        : "pending";
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}
export function AdminFeedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <p className="admin-feedback error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="admin-feedback success" role="status">
          {success}
        </p>
      )}
    </>
  );
}
export function AdminTable({
  headers,
  children,
  caption,
}: {
  headers: string[];
  children: ReactNode;
  caption: string;
}) {
  return (
    <div
      className="admin-table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="admin-table">
        <caption className="admin-sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function AdminPager({
  page,
  size,
  total,
  change,
  busy = false,
}: {
  page: number;
  size: number;
  total: number;
  change: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <nav className="admin-pagination" aria-label="Phân trang">
      <span>
        {total && (page - 1) * size < total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} / ${total}`
          : total
            ? `0 / ${total}`
            : "0 kết quả"}
      </span>
      <div>
        <button
          className="mini-button"
          disabled={busy || page <= 1}
          onClick={() => change(page - 1)}
        >
          Trang trước
        </button>
        <span>
          Trang {page} / {Math.max(1, Math.ceil(total / size))}
        </span>
        <button
          className="mini-button"
          disabled={busy || page * size >= total}
          onClick={() => change(page + 1)}
        >
          Trang sau
        </button>
      </div>
    </nav>
  );
}
export function AdminEmpty({
  text,
  clear,
}: {
  text: string;
  clear?: () => void;
}) {
  return (
    <div className="admin-empty">
      <strong>{text}</strong>
      {clear && (
        <button className="mini-button" onClick={clear}>
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}
export function useAdminListQuery(statuses: string[] = []) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [draft, setDraft] = useState(params.get("query") || "");
  const draftRef = useRef(draft);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    const value = params.get("query") || "";
    draftRef.current = value;
    setDraft(value);
  }, [location.key]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function update(key: string, value: string, replace = false) {
    clearTimeout(timer.current);
    const next = new URLSearchParams(paramsRef.current);
    const queryChanged = draftRef.current.trim() !== (next.get("query") || "");
    if (draftRef.current.trim()) next.set("query", draftRef.current.trim());
    else next.delete("query");
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page" || queryChanged) next.set("page", "1");
    setParams(next, { replace });
  }
  function input(value: string) {
    setDraft(value);
    draftRef.current = value;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update("query", value.trim(), true), 300);
  }
  function clear() {
    clearTimeout(timer.current);
    draftRef.current = "";
    setDraft("");
    const next = new URLSearchParams(paramsRef.current);
    ["query", "status", "delayed", "page"].forEach((key) => next.delete(key));
    setParams(next);
  }
  const rawPage = Number(params.get("page"));
  return {
    params,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    query: params.get("query") || "",
    status: statuses.includes(params.get("status") || "")
      ? params.get("status")!
      : "",
    draft,
    input,
    update,
    apply: () => update("query", draftRef.current.trim()),
    clear,
  };
}
