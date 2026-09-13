import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/resumos")({
  beforeLoad: () => {
    throw redirect({ to: "/conteudos" });
  },
});
