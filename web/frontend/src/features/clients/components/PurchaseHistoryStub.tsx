import { ShoppingBag } from "lucide-react";

export function PurchaseHistoryStub() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-grey-lighter">
        <ShoppingBag size={28} strokeWidth={1.5} className="text-grey-medium" />
      </div>
      <p className="text-[14px] text-grey-medium">
        История покупок появится позже,
        <br />
        когда подключим заказы.
      </p>
    </div>
  );
}
