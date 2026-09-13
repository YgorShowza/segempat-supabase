import type { Route as AuthenticatedRoute } from "@/routes/_authenticated/route";
import type { Route as CertificateRoute } from "@/routes/_authenticated/certificado.$attemptId";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/_authenticated/certificado/$attemptId": {
      id: "/_authenticated/certificado/$attemptId";
      path: "/certificado/$attemptId";
      fullPath: "/certificado/$attemptId";
      preLoaderRoute: typeof CertificateRoute;
      parentRoute: typeof AuthenticatedRoute;
    };
  }
}
