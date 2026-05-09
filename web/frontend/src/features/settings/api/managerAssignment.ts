import { ApiClient, apiClient } from "../../../api/client";
import type { Role } from "../../../auth/api";

export type AssignmentStrategy =
  | "any_admin"
  | "any_senior_manager"
  | "any_manager"
  | "specific";

export type AssignmentTarget = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  deactivated: boolean;
};

export type AssignmentScopeConfig = {
  strategy: AssignmentStrategy;
  targetUserId: string | null;
  target: AssignmentTarget | null;
};

export type ManagerAssignmentSettings = {
  onRegister: AssignmentScopeConfig;
  onDelete: AssignmentScopeConfig;
};

export class AssignmentApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const code = await ApiClient.parseErrorCode(res.clone());
  throw new AssignmentApiError(code, res.status);
}

export async function getManagerAssignment(
  idToken: string,
): Promise<ManagerAssignmentSettings> {
  const res = await apiClient.get("/settings/manager-assignment", idToken);
  await ensureOk(res);
  return (await res.json()) as ManagerAssignmentSettings;
}

export async function saveManagerAssignment(
  idToken: string,
  payload: {
    onRegister: { strategy: AssignmentStrategy; targetUserId: string | null };
    onDelete: { strategy: AssignmentStrategy; targetUserId: string | null };
  },
): Promise<void> {
  // apiClient has no native PUT — backend route accepts PUT but we use the
  // method-flexible helper. apiClient.patchJson would change semantics, so
  // we use the underlying fetch via apiClient's PUT-equivalent.
  const res = await apiClient.put(
    "/settings/manager-assignment",
    payload,
    idToken,
  );
  await ensureOk(res);
}
