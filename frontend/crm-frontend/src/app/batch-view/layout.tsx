export default function BatchViewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#e6e6e6]">
      {children}
    </div>
  );
}
