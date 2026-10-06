import { useEffect, useRef, useState } from "react";
import { ApiError } from "../orders/api";

export function useAdminWrite() {
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const blocked = useRef(false);
  async function run(
    operation: () => Promise<unknown>,
    label = "Đã lưu thay đổi.",
  ) {
    if (lock.current || blocked.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await operation();
      if (mounted.current) setSuccess(label);
      return true;
    } catch (err) {
      if (mounted.current) {
        if (err instanceof ApiError && err.status === 409) {
          blocked.current = true;
          setConflict(true);
          setError(
            "Dữ liệu đã thay đổi. Nội dung nhập vẫn được giữ; tải phiên bản mới và kiểm tra trước khi gửi lại.",
          );
        } else
          setError(
            err instanceof Error ? err.message : "Không thể lưu. Hãy thử lại.",
          );
      }
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await operation();
      if (mounted.current) {
        blocked.current = false;
        setConflict(false);
        setError("");
        setSuccess(
          "Đã tải phiên bản mới. Kiểm tra nội dung đang nhập trước khi gửi lại.",
        );
      }
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error ? err.message : "Không tải được dữ liệu mới.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    busy,
    error,
    success,
    conflict,
    run,
    refresh,
    disabled: busy || conflict,
  };
}
