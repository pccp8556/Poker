import { useMemo } from 'react';
import type { Library } from '../../domain/library';
import type { Format } from '../../domain/types';
import { Segmented } from './common';
import { spotGroups } from '../selection';

/** Format → spot → stack depth selector shared by the explorer and the marginal-hands editor. */
export function RangePicker({ library, value, onChange }: { library: Library; value: string; onChange: (id: string) => void }) {
  const current = library.get(value) ?? library.ranges[0]!;
  const formats = useMemo(() => [...new Set(library.ranges.map((r) => r.format))], [library]);
  const groups = useMemo(() => spotGroups(library.ranges.filter((r) => r.format === current.format)), [library, current.format]);
  const group = groups.find((g) => g.ranges.some((r) => r.id === current.id)) ?? groups[0]!;

  const pickFormat = (f: Format) => {
    if (f === current.format) return;
    const first = library.ranges.find((r) => r.format === f);
    if (first) onChange(first.id);
  };

  return (
    <div className="range-picker">
      {formats.length > 1 && (
        <Segmented<Format>
          label="Format"
          value={current.format}
          onChange={pickFormat}
          options={formats.map((f) => ({ value: f, label: f === '3max' ? '3-max' : 'Heads-Up' }))}
        />
      )}
      <div className="chips spot-chips" role="group" aria-label="Situation">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className="chip"
            aria-pressed={g.key === group.key}
            onClick={() => {
              // Keep the same depth when the new spot has it.
              const same = g.ranges.find((r) => r.stackBb === current.stackBb);
              onChange((same ?? g.ranges[0]!).id);
            }}
          >
            {g.title}
          </button>
        ))}
      </div>
      <Segmented<string>
        label="Profondeur"
        value={current.id}
        onChange={onChange}
        options={group.ranges.map((r) => ({ value: r.id, label: `${r.stackBb} BB${r.origin === 'custom' ? ' ★' : r.modified ? ' ✎' : ''}` }))}
      />
    </div>
  );
}
