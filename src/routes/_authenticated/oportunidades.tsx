import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/oportunidades")({
  beforeLoad: () => {
    throw redirect({ to: "/treinamentos" });
  },
});
