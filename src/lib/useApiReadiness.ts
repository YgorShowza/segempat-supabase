import { useEffect, useState } from "react";
import { checkSegempatApiReadiness, isSegempatApiConfigured } from "@/lib/backend/api-client";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export type ApiReadinessStatus = "demo" | "checking" | "ready" | "unavailable";

export function useApiReadiness() {
  const demo = isDemoModeEnabled();
  const configured = isSegempatApiConfigured();
  const [status, setStatus] = useState<ApiReadinessStatus>(() =>
    demo ? "demo" : configured ? "checking" : "unavailable",
  );

  useEffect(() => {
    if (demo) {
      setStatus("demo");
      return undefined;
    }

    if (!configured) {
      setStatus("unavailable");
      return undefined;
    }

    let active = true;

    const check = async () => {
      const ready = await checkSegempatApiReadiness();
      if (active) setStatus(ready ? "ready" : "unavailable");
    };

    const handleOnline = () => {
      setStatus("checking");
      void check();
    };
    const handleOffline = () => setStatus("unavailable");

    void check();
    const interval = window.setInterval(() => void check(), 30_000);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [configured, demo]);

  return status;
}
