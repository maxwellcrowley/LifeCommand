import type { ReactNode } from 'react';
export function PhaseDrag({ id, enabled, onMove, children }: { id: string; enabled: boolean; onMove: (from: string, to: string) => void; children: ReactNode }) {
  return <div draggable={enabled} onDragStart={event => { if (enabled) { event.dataTransfer.setData('application/x-lifecommand-phase', id); event.dataTransfer.effectAllowed = 'move'; } }} onDragOver={event => { if (enabled && event.dataTransfer.types.includes('application/x-lifecommand-phase')) event.preventDefault(); }} onDrop={event => { const from = event.dataTransfer.getData('application/x-lifecommand-phase'); if (enabled && from && from !== id) { event.preventDefault(); onMove(from, id); } }}>{children}</div>;
}
