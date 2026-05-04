import { ApiClient, apiClient } from "../../api/client";

export type SlotType = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachSlotStatus = "active" | "cancelled";

export type CoachBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  orderItemId: string | null;
  orderId: string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
};

export type CoachSlot = {
  id: string;
  slotTypeId: string;
  startsAt: string;
  endsAt: string;
  status: CoachSlotStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  slotType: { id: string; name: string; color: string };
  bookings: CoachBooking[];
};

export class ApiError extends Error {
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
  const code = await ApiClient.parseErrorCode(res);
  throw new ApiError(code, res.status);
}

// Slot types ----------------------------------------------------------------

export async function listSlotTypes(idToken: string): Promise<SlotType[]> {
  const res = await apiClient.get("/slot-types", idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slotTypes: SlotType[] };
  return body.slotTypes;
}

export async function createSlotType(
  idToken: string,
  input: { name: string; color: string },
): Promise<SlotType> {
  const res = await apiClient.postJson("/slot-types", input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slotType: SlotType };
  return body.slotType;
}

export async function updateSlotType(
  idToken: string,
  id: string,
  input: { name?: string; color?: string; sortOrder?: number },
): Promise<SlotType> {
  const res = await apiClient.patchJson(`/slot-types/${id}`, input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slotType: SlotType };
  return body.slotType;
}

export async function deleteSlotType(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/slot-types/${id}`, idToken);
  await ensureOk(res);
}

// Coach slots ---------------------------------------------------------------

export type CoachSlotInput = {
  slotTypeId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
};

export async function listCoachSlots(
  idToken: string,
  params: { from: string; to: string; slotTypeId?: string | null },
): Promise<CoachSlot[]> {
  const usp = new URLSearchParams();
  usp.set("from", params.from);
  usp.set("to", params.to);
  if (params.slotTypeId) usp.set("slotTypeId", params.slotTypeId);
  const res = await apiClient.get(`/coach-slots?${usp.toString()}`, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slots: CoachSlot[] };
  return body.slots;
}

export async function createCoachSlot(
  idToken: string,
  input: CoachSlotInput,
): Promise<CoachSlot> {
  const res = await apiClient.postJson("/coach-slots", input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slot: CoachSlot };
  return body.slot;
}

export async function updateCoachSlot(
  idToken: string,
  id: string,
  input: Partial<CoachSlotInput>,
): Promise<CoachSlot> {
  const res = await apiClient.patchJson(`/coach-slots/${id}`, input, idToken);
  await ensureOk(res);
  const body = (await res.json()) as { slot: CoachSlot };
  return body.slot;
}

export async function deleteCoachSlot(
  idToken: string,
  id: string,
): Promise<void> {
  const res = await apiClient.delete(`/coach-slots/${id}`, idToken);
  await ensureOk(res);
}
