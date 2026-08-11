interface ConnectionModalProps {
  readonly connected: boolean;
}

export function ConnectionModal({ connected }: ConnectionModalProps) {
  if (connected) {
    return null;
  }

  return (
    <div
      aria-labelledby="connecting-label"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
    >
      <div className="w-full max-w-[500px] rounded border border-black/20 bg-white shadow-lg">
        <div className="flex w-full items-center p-4">
          <strong id="connecting-label">Connecting...</strong>
          <span className="ml-auto h-8 w-8 animate-pulse rounded-full bg-[#007bff]" role="status">
            <span className="sr-only">Connecting</span>
          </span>
        </div>
      </div>
    </div>
  );
}
