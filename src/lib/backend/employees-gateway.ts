import { apiRequest } from "./api-client";
import type { EmployeeGateway, EmployeeRecord } from "./contracts";

export const employeesGateway: EmployeeGateway = {
  list: () => apiRequest<EmployeeRecord[]>("/api/employees"),
  create: (input) => apiRequest<void>("/api/employees", { method: "POST", body: JSON.stringify(input) }),
  update: (id, input) => apiRequest<void>(`/api/employees/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id) => apiRequest<void>(`/api/employees/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
