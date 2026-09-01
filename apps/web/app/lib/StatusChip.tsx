export type ChipTone = "green" | "amber" | "red" | "blue" | "gray";

export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  return <span className={`chip-dot chip-dot-${tone}`}>{label}</span>;
}
