import { createFileRoute } from "@tanstack/react-router";
import { MyProfileWorkspace } from "@/components/profile/MyProfileWorkspace";

export const Route = createFileRoute("/_authenticated/meu-perfil")({
  head: () => ({
    meta: [
      { title: "Meu Perfil · SEGEMPAT" },
      { name: "description", content: "Identidade, nível, desempenho, ciclo de treinamento e histórico individual no SEGEMPAT." },
    ],
  }),
  component: MyProfileWorkspace,
});
