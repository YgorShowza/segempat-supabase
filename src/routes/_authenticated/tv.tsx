import { createFileRoute } from "@tanstack/react-router";
import { TvOperationalDashboard } from "@/components/tv/TvOperationalDashboard";

export const Route = createFileRoute("/_authenticated/tv")({
  head: () => ({ meta: [{ title: "Sala Operacional · SEGEMPAT" }] }),
  component: TvOperationalDashboard,
});
