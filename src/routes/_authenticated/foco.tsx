import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/foco")({
  beforeLoad: () => {
    throw redirect({ to: "/treinamentos" });
  },
});
