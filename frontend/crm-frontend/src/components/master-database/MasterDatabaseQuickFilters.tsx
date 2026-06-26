'use client';

import { useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Loader2, Mail, Phone, Search, SlidersHorizontal } from 'lucide-react';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import type {
  DynamicMasterDbFilters,
  MasterDataColumnFilterSchema,
} from './master-database-columns';
import {
  buildCuratedQuickFilters,
  filterAdvancedColumns,
  isExcludedDropdownColumn,
} from './master-database-columns';

interface MasterDatabaseQuickFiltersProps {
  columns: MasterDataColumnFilterSchema[];
  headers: string[];
  filters: DynamicMasterDbFilters;
  onChange: (next: DynamicMasterDbFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  searching: boolean;
  resultCount?: number;
  variant?: 'inline' | 'sidebar';
}

export function MasterDatabaseQuickFilters({
  columns,
  headers,
  filters,
  onChange,
  onSearch,
  onClear,
  searching,
  resultCount,
  variant = 'inline',
}: MasterDatabaseQuickFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreQuery, setMoreQuery] = useState('');

  const curatedFields = useMemo(() => buildCuratedQuickFilters(columns), [columns]);
  const curatedHeaders = useMemo(
    () => new Set(curatedFields.map((f) => f.column.header)),
    [curatedFields],
  );

  const advancedColumns = useMemo(() => {
    const rest = filterAdvancedColumns(columns).filter(
      (c) => !curatedHeaders.has(c.header) && !isExcludedDropdownColumn(c.header),
    );
    const q = moreQuery.trim().toLowerCase();
    if (!q) return rest;
    return rest.filter((c) => c.header.toLowerCase().includes(q));
  }, [columns, curatedHeaders, moreQuery]);

  const setColumnValue = (header: string, value: string) => {
    const columnValues = { ...filters.columnValues };
    if (value) columnValues[header] = new Set([value]);
    else delete columnValues[header];
    onChange({ ...filters, columnValues });
    onSearch();
  };

  const setColumnText = (header: string, value: string) => {
    const columnText = { ...filters.columnText, [header]: value };
    if (!value.trim()) delete columnText[header];
    onChange({ ...filters, columnText });
  };

  const setDateRange = (header: string, part: 'from' | 'to', value: string) => {
    const current = filters.columnDateRanges[header] ?? {};
    const next = { ...current, [part]: value || undefined };
    const columnDateRanges = { ...filters.columnDateRanges };
    if (!next.from && !next.to) delete columnDateRanges[header];
    else columnDateRanges[header] = next;
    onChange({ ...filters, columnDateRanges });
    onSearch();
  };

  const toggleMustExist = (header: string, checked: boolean) => {
    const mustExist = new Set(filters.mustExist);
    if (checked) mustExist.add(header);
    else mustExist.delete(header);
    onChange({ ...filters, mustExist });
    onSearch();
  };

  const placeholder = headers.length
    ? `Search all fields — company, email, name…`
    : 'Search master data…';

  const selectOptions = (col: MasterDataColumnFilterSchema) => [
    { value: '', label: 'All' },
    ...col.options.slice(0, 60).map((opt) => ({
      value: opt,
      label: opt.length > 42 ? `${opt.slice(0, 40)}…` : opt,
    })),
  ];

  return (
    <div className={`mdb-quick${variant === 'sidebar' ? ' mdb-quick--sidebar' : ''}`}>
      {variant !== 'sidebar' && (
        <div className="mdb-quick__head">
          <div className="mdb-quick__head-left">
            <Search className="h-4 w-4" />
            <span>Search &amp; filter</span>
          </div>
          {searching && (
            <span className="mdb-quick__loading">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </span>
          )}
        </div>
      )}

      {variant === 'sidebar' && searching && (
        <div className="mdb-quick__sidebar-status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching…
        </div>
      )}

      <div className="mdb-quick__search">
        <Search className="mdb-quick__search-icon h-4 w-4" />
        <input
          type="text"
          placeholder={placeholder}
          value={filters.globalQuery}
          onChange={(e) => onChange({ ...filters, globalQuery: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
        <button
          type="button"
          className="mdb-btn mdb-btn--green mdb-quick__search-btn"
          onClick={onSearch}
          disabled={searching}
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
        </button>
      </div>

      {curatedFields.length > 0 && (
        <div className="mdb-quick__curated">
          {curatedFields.map((field) => {
            const { column } = field;

            if (field.type === 'dateRange') {
              const range = filters.columnDateRanges[column.header] ?? {};
              return (
                <div key={column.header} className="mdb-filter-block">
                  <span className="mdb-filter-block__label">
                    <Calendar className="h-3.5 w-3.5" />
                    {column.header}
                  </span>
                  <div className="mdb-date-range">
                    <label className="mdb-date-range__field">
                      <span>From</span>
                      <input
                        type="date"
                        value={range.from ?? ''}
                        onChange={(e) => setDateRange(column.header, 'from', e.target.value)}
                      />
                    </label>
                    <label className="mdb-date-range__field">
                      <span>To</span>
                      <input
                        type="date"
                        value={range.to ?? ''}
                        onChange={(e) => setDateRange(column.header, 'to', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              );
            }

            if (field.type === 'text') {
              const value = filters.columnText[column.header] ?? '';
              return (
                <div key={column.header} className="mdb-filter-block">
                  <span className="mdb-filter-block__label">{column.header}</span>
                  <input
                    type="text"
                    className="mdb-filter-block__input"
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(e) => setColumnText(column.header, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    onBlur={() => value.trim() && onSearch()}
                  />
                </div>
              );
            }

            const selected = filters.columnValues[column.header];
            const value = selected?.size === 1 ? [...selected][0] : '';

            return (
              <div key={column.header} className="mdb-filter-block">
                <span className="mdb-filter-block__label">{column.header}</span>
                <XlToolbarSelect
                  tone="light"
                  className="mdb-filter-block__select"
                  menuMinWidth={260}
                  value={value}
                  placeholder="All"
                  onChange={(v) => setColumnValue(column.header, v)}
                  options={selectOptions(column)}
                />
              </div>
            );
          })}

          <button type="button" className="mdb-btn mdb-btn--ghost mdb-quick__clear" onClick={onClear}>
            Clear all
          </button>
        </div>
      )}

      {typeof resultCount === 'number' && resultCount > 0 && (
        <div className="mdb-quick__results">
          <span className="mdb-quick__results-badge">{resultCount.toLocaleString('en-US')}</span>
          <span>companies matched</span>
        </div>
      )}

      {advancedColumns.length > 0 && (
        <div className="mdb-quick__more">
          <button type="button" className="mdb-quick__more-toggle" onClick={() => setMoreOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            More filters ({advancedColumns.length})
            {moreOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {moreOpen && (
            <div className="mdb-quick__more-panel">
              <div className="mdb-quick__more-search">
                <Search className="h-3.5 w-3.5" />
                <input
                  type="text"
                  placeholder="Find a field…"
                  value={moreQuery}
                  onChange={(e) => setMoreQuery(e.target.value)}
                />
              </div>
              <div className="mdb-advanced-filters">
                {advancedColumns.map((col) => {
                  const selected = filters.columnValues[col.header] ?? new Set<string>();
                  const value = selected?.size === 1 ? [...selected][0] : '';

                  if (col.kind === 'email' || col.kind === 'phone') {
                    const checked = filters.mustExist.has(col.header);
                    return (
                      <label key={col.header} className="mdb-advanced-filters__toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleMustExist(col.header, e.target.checked)}
                        />
                        {col.kind === 'email' ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        Has {col.header}
                      </label>
                    );
                  }

                  return (
                    <div key={col.header} className="mdb-advanced-filters__field">
                      <span className="mdb-advanced-filters__label">{col.header}</span>
                      <XlToolbarSelect
                        tone="light"
                        className="mdb-filter-block__select"
                        menuMinWidth={260}
                        value={value}
                        placeholder="All"
                        onChange={(v) => setColumnValue(col.header, v)}
                        options={selectOptions(col)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
