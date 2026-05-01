export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-[24px] font-semibold text-grey-dark">{title}</h2>
        <p className="text-[14px] text-grey-medium">Раздел в разработке</p>
      </div>
    </div>
  );
}
