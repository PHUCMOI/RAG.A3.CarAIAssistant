import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminWrite } from "../src/features/admin/useAdminWrite";
import { ApiError } from "../src/features/orders/api";
describe("admin writes", () => {
  it("locks synchronously against duplicate submissions", async () => {
    const { result } = renderHook(() => useAdminWrite());
    let release!: () => void;
    const operation = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.run(operation);
      void result.current.run(operation);
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      release();
      await first;
    });
    expect(result.current.busy).toBe(false);
  });
  it("blocks a conflict until a successful explicit refresh, never automatically retries", async () => {
    const { result } = renderHook(() => useAdminWrite());
    const write = vi.fn().mockRejectedValue(new ApiError(409, "Conflict"));
    await act(async () => {
      await result.current.run(write);
    });
    expect(result.current.conflict).toBe(true);
    await act(async () => {
      await result.current.run(write);
    });
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refresh(async () => {
        throw new Error("Offline");
      });
    });
    expect(result.current.conflict).toBe(true);
    await act(async () => {
      await result.current.refresh(async () => {});
    });
    expect(result.current.conflict).toBe(false);
    const next = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.run(next);
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
  it("allows manual retry after a server error and clears the previous feedback", async () => {
    const { result } = renderHook(() => useAdminWrite());
    const write = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "Offline"))
      .mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.run(write);
    });
    expect(result.current.error).toBe("Offline");
    expect(result.current.conflict).toBe(false);
    await act(async () => {
      await result.current.run(write);
    });
    expect(result.current.error).toBe("");
    expect(result.current.success).not.toBe("");
  });
});
