import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/health": {
      id: "/health";
      path: "/health";
      fullPath: "/health";
      preLoaderRoute: typeof import("./routes/health").Route;
      parentRoute: typeof import("./routes/__root").Route;
    };
    "/api/$": {
      id: "/api/$";
      path: "/api/$";
      fullPath: "/api/$";
      preLoaderRoute: typeof import("./routes/api/$").Route;
      parentRoute: typeof import("./routes/__root").Route;
    };
  }
}
