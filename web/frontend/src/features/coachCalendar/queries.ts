import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { auth } from "../../firebase";
import {
  createCoachSlot,
  createSlotType,
  deleteCoachSlot,
  deleteSlotType,
  listCoachSlots,
  listSlotTypes,
  updateCoachSlot,
  updateSlotType,
  type CoachSlotInput,
} from "./api";

const SLOT_TYPES_KEY = "slot-types" as const;
const COACH_SLOTS_KEY = "coach-slots" as const;

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

// Slot types ----------------------------------------------------------------

export function useSlotTypes() {
  return useQuery({
    queryKey: [SLOT_TYPES_KEY] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listSlotTypes(token);
    },
  });
}

function useInvalidateSlotTypes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [SLOT_TYPES_KEY] });
    // Slot rows embed `slotType.{name,color}` — refresh the calendar grid
    // so the rename / recolor lands without a manual reload.
    qc.invalidateQueries({ queryKey: [COACH_SLOTS_KEY] });
  };
}

export function useCreateSlotType() {
  const invalidate = useInvalidateSlotTypes();
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      const token = await getIdToken();
      return createSlotType(token, input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateSlotType() {
  const invalidate = useInvalidateSlotTypes();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      input: { name?: string; color?: string; sortOrder?: number };
    }) => {
      const token = await getIdToken();
      return updateSlotType(token, vars.id, vars.input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSlotType() {
  const invalidate = useInvalidateSlotTypes();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deleteSlotType(token, id);
    },
    onSuccess: () => invalidate(),
  });
}

// Coach slots ---------------------------------------------------------------

export function useCoachSlots(params: {
  from: string;
  to: string;
  slotTypeId?: string | null;
}) {
  return useQuery({
    queryKey: [COACH_SLOTS_KEY, params] as const,
    queryFn: async () => {
      const token = await getIdToken();
      return listCoachSlots(token, params);
    },
    placeholderData: (prev) => prev,
  });
}

function useInvalidateCoachSlots() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [COACH_SLOTS_KEY] });
}

export function useCreateCoachSlot() {
  const invalidate = useInvalidateCoachSlots();
  return useMutation({
    mutationFn: async (input: CoachSlotInput) => {
      const token = await getIdToken();
      return createCoachSlot(token, input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCoachSlot() {
  const invalidate = useInvalidateCoachSlots();
  return useMutation({
    mutationFn: async (vars: { id: string; input: Partial<CoachSlotInput> }) => {
      const token = await getIdToken();
      return updateCoachSlot(token, vars.id, vars.input);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCoachSlot() {
  const invalidate = useInvalidateCoachSlots();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getIdToken();
      await deleteCoachSlot(token, id);
    },
    onSuccess: () => invalidate(),
  });
}
