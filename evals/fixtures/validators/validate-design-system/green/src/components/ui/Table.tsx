export function Table({ disabled }: { disabled?: boolean }) {
  return <table className="hover:bg-muted disabled:opacity-50" aria-disabled={disabled} />;
}
