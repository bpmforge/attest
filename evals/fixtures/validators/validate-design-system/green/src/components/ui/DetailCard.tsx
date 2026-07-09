export function DetailCard({ disabled }: { disabled?: boolean }) {
  return <div className="hover:shadow-md" data-disabled={disabled} />;
}
