'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Mail, Phone, Search, SlidersHorizontal, X } from 'lucide-react';
import type {
  DynamicMasterDbFilters,
  MasterDataColumnFilterSchema,
} from './master-database-columns';

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

interface MasterDatabaseFilterPanelProps {
  columns: MasterDataColumnFilterSchema[];
  filters: DynamicMasterDbFilters;
  onChange: (next: DynamicMasterDbFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  searching: boolean;
  filterQuery: string;
  onFilterQueryChange: (q: string) => void;
}

export function MasterDatabaseFilterPanel({
  columns,
  filters,
  onChange,
  onSearch,
  onClear,
  searching,
  filterQuery,
  onFilterQueryChange,
}: MasterDatabaseFilterPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const visibleColumns = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => c.header.toLowerCase().includes(q));
  }, [columns, filterQuery]);

  const patch = (partial: Partial<DynamicMasterDbFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="mdb-filters mdb-filters--dynamic">
      <div className="mdb-filters__toolbar">
        <div className="mdb-filters__toolbar-search">
          <Search className="h-3.5 w-3.5" />
          <input
            type="text"
            placeholder="Find a data field to filter…"
            value={filterQuery}
            onChange={(e) => onFilterQueryChange(e.target.value)}
          />
        </div>
        <button type="button" className="mdb-btn" onClick={onClear}>
          Clear All
        </button>
        <button
          type="button"
          className="mdb-btn mdb-btn--green"
          onClick={onSearch}
          disabled={searching}
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </button>
      </div>

      <div className="mdb-filters__meta">
        <button type="button" className="mdb-filters__toggle" onClick={() => setExpanded((v) => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Your data fields ({columns.length})
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <p className="mdb-filters__meta-hint">Filters match your uploaded spreadsheet columns</p>
      </div>

      {expanded && (
        <div className="mdb-field-grid">
          {visibleColumns.length === 0 ? (
            <p className="mdb-field-grid__empty">No fields match &quot;{filterQuery}&quot;</p>
          ) : (
            visibleColumns.map((col) => {
              const selected = filters.columnValues[col.header] ?? new Set<string>();
              const text = filters.columnText[col.header] ?? '';
              const mustExist = filters.mustExist.has(col.header);

              return (
                <div key={col.header} className="mdb-field-card">
                  <div className="mdb-field-card__head">
                    <span className="mdb-field-card__title" title={col.header}>
                      {col.header}
                    </span>
                    <span className="mdb-field-card__kind">{col.kind}</span>
                  </div>

                  {(col.kind === 'text' || col.kind === 'select' || col.kind === 'status') && (
                    <input
                      type="text"
                      className="mdb-field-card__input"
                      placeholder={`Contains in ${col.header}…`}
                      value={text}
                      onChange={(e) =>
                        patch({
                          columnText: { ...filters.columnText, [col.header]: e.target.value },
                        })
                      }
                      onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    />
                  )}

                  {(col.kind === 'email' || col.kind === 'phone') && (
                    <label className="mdb-field-card__presence">
                      <input
                        type="checkbox"
                        checked={mustExist}
                        onChange={(e) => {
                          const next = new Set(filters.mustExist);
                          if (e.target.checked) next.add(col.header);
                          else next.delete(col.header);
                          patch({ mustExist: next });
                        }}
                      />
                      {col.kind === 'email' ? (
                        <><Mail className="h-3.5 w-3.5" /> Has {col.header}</>
                      ) : (
                        <><Phone className="h-3.5 w-3.5" /> Has {col.header}</>
                      )}
                    </label>
                  )}

                  {col.options.length > 0 && (
                    <div className="mdb-field-card__options">
                      {(/^lead type$/i.test(col.header)
                        ? col.options
                        : col.options.slice(0, 12)
                      ).map((opt) => (
                        <label key={opt} className="mdb-option-chip">
                          <input
                            type="checkbox"
                            checked={selected.has(opt)}
                            onChange={() =>
                              patch({
                                columnValues: {
                                  ...filters.columnValues,
                                  [col.header]: toggleSet(selected, opt),
                                },
                              })
                            }
                          />
                          <span title={opt}>{opt}</span>
                        </label>
                      ))}
                      {!/^lead type$/i.test(col.header) && col.options.length > 12 && (
                        <span className="mdb-field-card__more">+{col.options.length - 12} more in data</span>
                      )}
                    </div>
                  )}

                  {col.kind === 'text' && col.filledCount > 0 && (
                    <label className="mdb-field-card__presence mdb-field-card__presence--subtle">
                      <input
                        type="checkbox"
                        checked={mustExist}
                        onChange={(e) => {
                          const next = new Set(filters.mustExist);
                          if (e.target.checked) next.add(col.header);
                          else next.delete(col.header);
                          patch({ mustExist: next });
                        }}
                      />
                      Not empty
                    </label>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function MasterDatabaseFilterTags({
  tags,
  onRemove,
  onSearch,
  onClearAll,
}: {
  tags: Array<{ key: string; label: string }>;
  onRemove: (key: string) => void;
  onSearch?: () => void;
  onClearAll?: () => void;
}) {
  if (!tags.length) return null;
  return (
    <div className="mdb-tags-wrap">
      <div className="mdb-tags-head">
        <span className="mdb-tags-title">Applied filters</span>
        {onClearAll ? (
          <button
            type="button"
            className="mdb-tags-clear"
            onClick={() => {
              onClearAll();
              onSearch?.();
            }}
          >
            Clear all filters
          </button>
        ) : null}
      </div>
      <div className="mdb-tags">
      {tags.map((t) => (
        <span key={t.key} className="mdb-tag">
          {t.label}
          <button
            type="button"
            onClick={() => {
              onRemove(t.key);
              onSearch?.();
            }}
            aria-label="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      </div>
    </div>
  );
}
