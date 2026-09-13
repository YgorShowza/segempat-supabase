import { createFileRoute } from "@tanstack/react-router";
import { TeamManagementWorkspace } from "@/components/team/TeamManagementWorkspace";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Gestão de Equipe · SEGEMPAT" },
      { name: "description", content: "Cadastre, edite e acompanhe os funcionários da equipe de segurança." },
      { property: "og:title", content: "Gestão de Equipe · SEGEMPAT" },
      { property: "og:description", content: "Cadastre, edite e acompanhe os funcionários da equipe de segurança." },
    ],
  }),
  component: TeamManagementWorkspace,
});
