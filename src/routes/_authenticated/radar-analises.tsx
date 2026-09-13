import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/radar-analises")({
  beforeLoad: () => {
    throw redirect({ to: "/analytics" });
  },
});
