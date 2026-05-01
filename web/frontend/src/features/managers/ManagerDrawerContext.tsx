import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ManagerDrawer } from "./components/ManagerDrawer";
import type { Manager } from "./api";

type Ctx = {
  openCreate: () => void;
  openEdit: (manager: Manager) => void;
  close: () => void;
};

const ManagerDrawerCtx = createContext<Ctx | null>(null);

export function ManagerDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Manager | null>(null);

  const openCreate = useCallback(() => {
    setTarget(null);
    setOpen(true);
  }, []);
  const openEdit = useCallback((m: Manager) => {
    setTarget(m);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setTarget(null);
  }, []);

  return (
    <ManagerDrawerCtx.Provider value={{ openCreate, openEdit, close }}>
      {children}
      <ManagerDrawer open={open} manager={target} onClose={close} />
    </ManagerDrawerCtx.Provider>
  );
}

export function useManagerDrawer(): Ctx {
  const ctx = useContext(ManagerDrawerCtx);
  if (!ctx) {
    throw new Error("useManagerDrawer must be used within ManagerDrawerProvider");
  }
  return ctx;
}
