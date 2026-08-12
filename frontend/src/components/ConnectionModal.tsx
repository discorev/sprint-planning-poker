interface ConnectionModalProps {
  readonly connected: boolean;
}

export function ConnectionModal({ connected }: ConnectionModalProps) {
  if (connected) {
    return null;
  }

  return (
    <div aria-labelledby="connecting-label" aria-modal="true" className="connection-modal" role="dialog">
      <div className="connection-panel register-panel">
        <strong id="connecting-label">Connecting...</strong>
        <span aria-hidden="true" className="connection-pulse" />
        <span className="sr-only" role="status">Connecting</span>
      </div>
    </div>
  );
}
