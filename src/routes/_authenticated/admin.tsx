import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardV2 } from "@/components/dashboard/AdminDashboardV2";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Dashboard · SEGEMPAT" }] }),
  component: AdminDashboardV2,
});
