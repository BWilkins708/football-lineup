import { useEffect, useState, type ReactNode } from 'react';
import type { Lineup, Player } from './db';
import { FORMATIONS_BY_SIZE, TEAM_SIZES, sizeOf, slotsFor } from './formations';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PlayerChip({ player, captain, dim }: { player?: Player; captain?: boolean; dim?: boolean }) {
  if (!player) return <span className="chip empty">+</span>;
  return (
    <span className={`chip${dim ? ' dim' : ''}`}>
      <b>{player.number ?? '–'}</b>
      {captain && <i className="armband">C</i>}
    </span>
  );
}

export const shortName = (p?: Player) => {
  if (!p) return '';
  const parts = p.name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

export function PlayerList({
  players,
  onPick,
  selectedIds = [],
  note,
}: {
  players: Player[];
  onPick: (p: Player) => void;
  selectedIds?: string[];
  note?: (p: Player) => ReactNode;
}) {
  if (players.length === 0) return <p className="muted">No players available.</p>;
  return (
    <ul className="pick-list">
      {players.map((p) => (
        <li key={p.id}>
          <button className={selectedIds.includes(p.id) ? 'picked' : ''} onClick={() => onPick(p)}>
            <span className="num">{p.number ?? '–'}</span>
            <span className="grow">{p.name}</span>
            <span className="muted small">{note ? note(p) : p.positions.join(' / ')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface PitchProps {
  formation: string;
  slots: Lineup['slots'];
  players: Map<string, Player>;
  captainId?: string;
  selectedSlot?: number;
  highlightIds?: Set<string>;
  onSlotClick?: (index: number) => void;
  /** Overrides who is shown in each slot (used in live mode after subs). */
  labelFor?: (index: number, playerId?: string) => ReactNode;
}

export function Pitch({ formation, slots, players, captainId, selectedSlot, highlightIds, onSlotClick, labelFor }: PitchProps) {
  const layout = slotsFor(formation);
  return (
    <div className="pitch" aria-label={`Pitch, ${formation}`}>
      <div className="pitch-lines">
        <span className="halfway" />
        <span className="circle" />
        <span className="box top" />
        <span className="box bottom" />
      </div>
      {layout.map((s, i) => {
        const pid = slots[i];
        const p = pid ? players.get(pid) : undefined;
        const cls = ['slot', selectedSlot === i ? 'selected' : '', pid && highlightIds?.has(pid) ? 'hl' : ''].join(' ');
        return (
          <button
            key={i}
            className={cls}
            style={{ left: `${s.x}%`, bottom: `${s.y}%` }}
            onClick={() => onSlotClick?.(i)}
            aria-label={p ? `${s.label}: ${p.name}` : `${s.label}: empty`}
          >
            <PlayerChip player={p} captain={!!pid && pid === captainId} />
            <span className="slot-name">{labelFor ? labelFor(i, pid) : p ? shortName(p) : s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Reassign slots when the formation changes, keeping players in order of role. */
export function changeFormation(lineup: Lineup, formation: string): Lineup {
  const oldLayout = slotsFor(lineup.formation);
  const newLayout = slotsFor(formation);
  const byRole = new Map<string, string[]>();
  oldLayout.forEach((s, i) => {
    const pid = lineup.slots[i];
    if (pid) byRole.set(s.role, [...(byRole.get(s.role) ?? []), pid]);
  });
  const leftovers: string[] = [];
  const slots: Lineup['slots'] = {};
  newLayout.forEach((s, i) => {
    const q = byRole.get(s.role);
    if (q?.length) slots[i] = q.shift();
  });
  for (const q of byRole.values()) leftovers.push(...q);
  newLayout.forEach((_, i) => {
    if (!slots[i] && leftovers.length) slots[i] = leftovers.shift();
  });
  return { ...lineup, formation, slots, bench: [...lineup.bench, ...leftovers] };
}

export function TeamSizePicker({ value, onChange }: { value: number; onChange: (n: (typeof TEAM_SIZES)[number]) => void }) {
  return (
    <div className="field">
      <span>Team size</span>
      <div className="toggle-group">
        {TEAM_SIZES.map((n) => (
          <button type="button" key={n} className={value === n ? 'on' : ''} onClick={() => value !== n && onChange(n)}>{n}-a-side</button>
        ))}
      </div>
    </div>
  );
}

export function LineupEditor({
  lineup,
  players,
  onChange,
}: {
  lineup: Lineup;
  players: Player[];
  onChange: (l: Lineup) => void;
}) {
  const [slot, setSlot] = useState<number | undefined>();
  const [benchOpen, setBenchOpen] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const layout = slotsFor(lineup.formation);
  const size = sizeOf(lineup.formation);
  const onField = new Set(Object.values(lineup.slots).filter(Boolean) as string[]);
  const available = players.filter((p) => p.active).sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

  const assign = (p: Player) => {
    if (slot === undefined) return;
    const slots = { ...lineup.slots };
    const current = slots[slot];
    // If the picked player is already in another slot, swap them.
    const otherSlot = Object.entries(slots).find(([, id]) => id === p.id)?.[0];
    if (otherSlot !== undefined) slots[Number(otherSlot)] = current;
    slots[slot] = p.id;
    const bench = lineup.bench.filter((id) => id !== p.id);
    onChange({ ...lineup, slots, bench });
    setSlot(undefined);
  };

  const clearSlot = () => {
    if (slot === undefined) return;
    const slots = { ...lineup.slots };
    const captainId = lineup.captainId === slots[slot] ? undefined : lineup.captainId;
    delete slots[slot];
    onChange({ ...lineup, slots, captainId });
    setSlot(undefined);
  };

  const makeCaptain = () => {
    if (slot === undefined) return;
    onChange({ ...lineup, captainId: lineup.slots[slot] });
    setSlot(undefined);
  };

  const toggleBench = (p: Player) => {
    const bench = lineup.bench.includes(p.id) ? lineup.bench.filter((id) => id !== p.id) : [...lineup.bench, p.id];
    onChange({ ...lineup, bench });
  };

  const autoFill = () => {
    const used = new Set(onField);
    const slots = { ...lineup.slots };
    layout.forEach((s, i) => {
      if (slots[i]) return;
      const pick =
        available.find((p) => !used.has(p.id) && p.positions[0] === s.role) ??
        available.find((p) => !used.has(p.id) && p.positions.includes(s.role)) ??
        available.find((p) => !used.has(p.id) && s.role !== 'GK' && !p.positions.includes('GK'));
      if (pick) { slots[i] = pick.id; used.add(pick.id); }
    });
    const bench = available.filter((p) => !used.has(p.id)).map((p) => p.id);
    onChange({ ...lineup, slots, bench });
  };

  const filled = onField.size;
  const slotPlayer = slot !== undefined ? lineup.slots[slot] : undefined;

  return (
    <div className="lineup-editor">
      <TeamSizePicker value={size} onChange={(n) => onChange(changeFormation(lineup, FORMATIONS_BY_SIZE[n][0]))} />
      <div className="row wrap">
        <label className="field inline">
          <span>Formation</span>
          <select value={lineup.formation} onChange={(e) => onChange(changeFormation(lineup, e.target.value))}>
            {FORMATIONS_BY_SIZE[size].map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <span className="muted small">{filled}/{layout.length} picked</span>
        <span className="grow" />
        <button className="btn ghost" onClick={autoFill}>Auto-fill</button>
      </div>
      <p className="muted small">Tap a position to pick a player.</p>

      <Pitch formation={lineup.formation} slots={lineup.slots} players={byId} captainId={lineup.captainId} selectedSlot={slot} onSlotClick={setSlot} />

      <div className="section-head">
        <h3>Bench ({lineup.bench.length})</h3>
        <button className="btn ghost" onClick={() => setBenchOpen(true)}>Edit bench</button>
      </div>
      <div className="bench">
        {lineup.bench.length === 0 && <span className="muted small">No substitutes.</span>}
        {lineup.bench.map((id) => byId.get(id)).filter(Boolean).map((p) => (
          <span key={p!.id} className="bench-chip"><b>{p!.number ?? '–'}</b> {shortName(p)}</span>
        ))}
      </div>

      {slot !== undefined && (
        <Modal title={`Pick ${layout[slot].label}`} onClose={() => setSlot(undefined)}>
          {slotPlayer && (
            <div className="row gap">
              <button className="btn ghost" onClick={makeCaptain}>Make captain</button>
              <button className="btn ghost danger" onClick={clearSlot}>Clear position</button>
            </div>
          )}
          <PlayerList
            players={[...available].sort((a, b) => Number(b.positions.includes(layout[slot].role)) - Number(a.positions.includes(layout[slot].role)))}
            selectedIds={slotPlayer ? [slotPlayer] : []}
            onPick={assign}
            note={(p) => (onField.has(p.id) ? 'in XI · swap' : lineup.bench.includes(p.id) ? 'bench' : p.positions.join(' / '))}
          />
        </Modal>
      )}

      {benchOpen && (
        <Modal title="Bench" onClose={() => setBenchOpen(false)}>
          <PlayerList
            players={available.filter((p) => !onField.has(p.id))}
            selectedIds={lineup.bench}
            onPick={toggleBench}
          />
          <button className="btn primary block" onClick={() => setBenchOpen(false)}>Done</button>
        </Modal>
      )}
    </div>
  );
}
