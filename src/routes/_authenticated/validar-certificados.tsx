import { createFileRoute } from "@tanstack/react-router";
import { CertificateValidationWorkspace } from "@/components/certificates/CertificateValidationWorkspace";

export const Route = createFileRoute("/_authenticated/validar-certificados")({
  head: () => ({
    meta: [
      { title: "Validar Certificados · SEGEMPAT" },
      { name: "description", content: "Validação administrativa de certificados e comprovantes emitidos pelo SEGEMPAT." },
    ],
  }),
  component: CertificateValidationWorkspace,
});
