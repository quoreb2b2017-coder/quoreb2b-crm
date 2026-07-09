'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
} from 'lucide-react';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import { XlToolbarMultiSelect } from '@/components/admin/XlToolbarMultiSelect';
import type {
  DynamicMasterDbFilters,
  MasterDataColumnFilterSchema,
} from './master-database-columns';
import {
  buildCombinedIndustryOptions,
  buildCuratedQuickFilters,
  buildEffectiveFilterColumns,
  COMBINED_INDUSTRY_FILTER_KEY,
  curatedFilterHeaders,
  filterAdvancedColumns,
  filterSidebarColumns,
  findExactEmployeeSizeColumn,
  isEmployeeSizeCategoryHeader,
  isExcludedDropdownColumn,
  isSizeCategoryHeader,
  pickQuickFilterColumns,
} from './master-database-columns';
import { CategoryRangeSlider } from './CategoryRangeSlider';

interface MasterDatabaseQuickFiltersProps {
  columns: MasterDataColumnFilterSchema[];
  headers: string[];
  filters: DynamicMasterDbFilters;
  onChange: (next: DynamicMasterDbFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  searching: boolean;
  schemaLoading?: boolean;
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
  schemaLoading = false,
  resultCount,
  variant = 'inline',
}: MasterDatabaseQuickFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(variant === 'sidebar');
  const [moreQuery, setMoreQuery] = useState('');

  const curatedFields = useMemo(() => buildCuratedQuickFilters(columns), [columns]);
  const fallbackColumns = useMemo(
    () => (curatedFields.length > 0 ? [] : pickQuickFilterColumns(columns, 8)),
    [columns, curatedFields.length],
  );
  const curatedHeaders = useMemo(() => curatedFilterHeaders(curatedFields), [curatedFields]);

  const advancedColumns = useMemo(() => {
    const pool =
      variant === 'sidebar'
        ? filterSidebarColumns(columns)
        : filterAdvancedColumns(columns);
    const rest = pool.filter(
      (c) => !curatedHeaders.has(c.header) && !isExcludedDropdownColumn(c.header),
    );
    const q = moreQuery.trim().toLowerCase();
    if (!q) return rest;
    return rest.filter((c) => c.header.toLowerCase().includes(q));
  }, [columns, curatedHeaders, moreQuery, variant]);

  const setColumnValue = (header: string, value: string) => {
    const columnValues = { ...filters.columnValues };
    if (value) columnValues[header] = new Set([value]);
    else delete columnValues[header];
    onChange({ ...filters, columnValues });
  };

  const setColumnMultiValues = (header: string, values: Set<string>) => {
    const columnValues = { ...filters.columnValues };
    if (values.size) columnValues[header] = values;
    else delete columnValues[header];
    onChange({ ...filters, columnValues });
  };

  const setColumnRangeValues = (header: string, values: string[]) => {
    const columnValues = { ...filters.columnValues };
    if (values.length) columnValues[header] = new Set(values);
    else delete columnValues[header];
    onChange({ ...filters, columnValues });
  };

  const setEmployeeExactNumeric = (categoryHeader: string, value: string) => {
    const columnText = { ...filters.columnText };
    const columnValues = { ...filters.columnValues };
    if (value.trim()) {
      delete columnValues[categoryHeader];
      if (exactEmployeeCol) columnText[exactEmployeeCol.header] = value.trim();
    } else if (exactEmployeeCol) {
      delete columnText[exactEmployeeCol.header];
    }
    onChange({ ...filters, columnText, columnValues });
  };

  const exactEmployeeCol = useMemo(() => findExactEmployeeSizeColumn(columns), [columns]);
  const employeeExactNumericValue = exactEmployeeCol
    ? (filters.columnText[exactEmployeeCol.header] ?? '')
    : '';

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
  };

  const toggleMustExist = (header: string, checked: boolean) => {
    const mustExist = new Set(filters.mustExist);
    if (checked) mustExist.add(header);
    else mustExist.delete(header);
    onChange({ ...filters, mustExist });
  };

  const placeholder = headers.length
    ? `Search company, email, name…`
    : 'Search master data…';

  const selectOptions = (col: MasterDataColumnFilterSchema) => [
    { value: '', label: 'All' },
    ...col.options.slice(0, 60).map((opt) => ({
      value: opt,
      label: opt.length > 42 ? `${opt.slice(0, 40)}…` : opt,
    })),
  ];

  const multiSelectOptions = (col: MasterDataColumnFilterSchema) =>
    col.options.slice(0, 80).map((opt) => ({
      value: opt,
      label: opt.length > 48 ? `${opt.slice(0, 46)}…` : opt,
    }));

  const shortFilterLabel = (header: string) => {
    if (/lead type/i.test(header)) return 'Lead type';
    if (/employee size category/i.test(header)) return 'Employee size';
    if (/revenue size category/i.test(header)) return 'Revenue size';
    if (/industry type/i.test(header)) return 'Industry type';
    if (/standard industry/i.test(header)) return 'Standard industry';
    if (/^country$/i.test(header)) return 'Country';
    if (/^state$/i.test(header)) return 'State';
    return header;
  };

  const fieldIcon = (header: string) => {
    if (/lead type/i.test(header)) return Tag;
    if (/industry/i.test(header)) return Building2;
    if (/employee size/i.test(header)) return Users;
    if (/revenue size/i.test(header)) return DollarSign;
    if (/^country$/i.test(header)) return Globe;
    if (/^state$/i.test(header)) return MapPin;
    return null;
  };

  const blockClass = (header: string, multi?: boolean, sizeCategory?: boolean) => {
    if (sizeCategory) return 'mdb-filter-block mdb-filter-block--category';
    if (multi) return 'mdb-filter-block mdb-filter-block--multi';
    return 'mdb-filter-block';
  };

  const renderChipMultiSelect = (
    header: string,
    selected: Set<string>,
    options: MasterDataColumnFilterSchema | MasterDataColumnFilterSchema['options'],
    menuMinWidth = 300,
  ) => {
    const opts = Array.isArray(options)
      ? options.slice(0, 80).map((opt) => ({
          value: opt,
          label: opt.length > 48 ? `${opt.slice(0, 46)}…` : opt,
        }))
      : multiSelectOptions(options as MasterDataColumnFilterSchema);

    return (
      <XlToolbarMultiSelect
        tone="light"
        displayMode="chips"
        className="mdb-filter-block__select"
        menuMinWidth={menuMinWidth}
        values={selected}
        placeholder="All"
        onChange={(next) => setColumnMultiValues(header, next)}
        onApply={(next) => {
          if (next.size > 0) onSearch();
        }}
        options={opts}
      />
    );
  };

  return (
    <div className={`mdb-quick${variant === 'sidebar' ? ' mdb-quick--sidebar' : ''}`}>
      {variant !== 'sidebar' && (
        <div className="mdb-quick__head">
          <div className="mdb-quick__head-left">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Quick filters</span>
          </div>
          {searching && (
            <span className="mdb-quick__loading">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </span>
          )}
        </div>
      )}

      {variant === 'sidebar' && schemaLoading && (
        <div className="mdb-quick__sidebar-status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading filter fields…
        </div>
      )}

      {variant === 'sidebar' && searching && !schemaLoading && (
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

      {curatedFields.length > 0 ? (
        <div className="mdb-quick__curated">
          {curatedFields.map((field) => {
            if (field.type === 'combinedIndustry') {
              const selected =
                filters.columnValues[COMBINED_INDUSTRY_FILTER_KEY] ?? new Set<string>();
              return (
                <div
                  key={COMBINED_INDUSTRY_FILTER_KEY}
                  className="mdb-filter-block mdb-filter-block--multi"
                >
                  <span className="mdb-filter-block__label">
                    <Building2 className="h-3 w-3" />
                    {field.label}
                    {selected.size > 0 && (
                      <span className="mdb-filter-block__count">{selected.size}</span>
                    )}
                  </span>
                  <XlToolbarMultiSelect
                    tone="light"
                    displayMode="chips"
                    className="mdb-filter-block__select"
                    menuMinWidth={300}
                    values={selected}
                    placeholder="All"
                    onChange={(next) => setColumnMultiValues(COMBINED_INDUSTRY_FILTER_KEY, next)}
                    onApply={(next) => {
                      if (next.size > 0) onSearch();
                    }}
                    options={buildCombinedIndustryOptions(field.columns)}
                  />
                </div>
              );
            }

            const { column } = field;

            if (field.type === 'dateRange') {
              const range = filters.columnDateRanges[column.header] ?? {};
              return (
                <div key={column.header} className="mdb-filter-block mdb-filter-block--date">
                  <span className="mdb-filter-block__label">
                    <Calendar className="h-3 w-3" />
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
              const Icon = fieldIcon(column.header);
              return (
                <div key={column.header} className={blockClass(column.header)}>
                  <span className="mdb-filter-block__label">
                    {Icon ? <Icon className="h-3 w-3" /> : null}
                    {shortFilterLabel(column.header)}
                  </span>
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

            const selected = filters.columnValues[column.header] ?? new Set<string>();
            const value = selected.size === 1 ? [...selected][0] : '';
            const isSizeCategory = isSizeCategoryHeader(column.header);
            const isMultiSelect = field.type === 'select' && field.multiple;
            const Icon = fieldIcon(column.header);

            return (
              <div
                key={column.header}
                className={blockClass(column.header, isMultiSelect, isSizeCategory)}
              >
                <span className="mdb-filter-block__label">
                  {Icon ? <Icon className="h-3 w-3" /> : null}
                  {shortFilterLabel(column.header)}
                  {isMultiSelect && selected.size > 0 && (
                    <span className="mdb-filter-block__count">{selected.size}</span>
                  )}
                </span>
                {isSizeCategory && column.options.length >= 2 ? (
                  <CategoryRangeSlider
                    options={column.options}
                    selected={selected}
                    onChange={(values) => {
                      if (isEmployeeSizeCategoryHeader(column.header)) {
                        setEmployeeExactNumeric(column.header, '');
                      }
                      setColumnRangeValues(column.header, values);
                    }}
                    onCommit={onSearch}
                    exactOnly={isEmployeeSizeCategoryHeader(column.header)}
                    exactNumericValue={
                      isEmployeeSizeCategoryHeader(column.header) ? employeeExactNumericValue : ''
                    }
                    onExactNumeric={
                      isEmployeeSizeCategoryHeader(column.header)
                        ? (value) => setEmployeeExactNumeric(column.header, value)
                        : undefined
                    }
                  />
                ) : isMultiSelect ? (
                  <div className="mdb-filter-block__select-wrap">
                    {renderChipMultiSelect(column.header, selected, column)}
                  </div>
                ) : (
                  <XlToolbarSelect
                    tone="light"
                    className="mdb-filter-block__select"
                    menuMinWidth={240}
                    value={value}
                    placeholder="All"
                    onChange={(v) => setColumnValue(column.header, v)}
                    options={selectOptions(column)}
                  />
                )}
              </div>
            );
          })}

          <button type="button" className="mdb-btn mdb-btn--ghost mdb-quick__clear" onClick={onClear}>
            Reset filters
          </button>
        </div>
      ) : fallbackColumns.length > 0 ? (
        <div className="mdb-quick__curated">
          {fallbackColumns.map((col) => {
            if (col.kind === 'email' || col.kind === 'phone') {
              const checked = filters.mustExist.has(col.header);
              return (
                <label key={col.header} className="mdb-quick__toggle">
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
            if (col.options.length >= 2) {
              const selected = filters.columnValues[col.header] ?? new Set<string>();
              return (
                <div key={col.header} className="mdb-filter-block mdb-filter-block--multi">
                  <span className="mdb-filter-block__label">{col.header}</span>
                  {renderChipMultiSelect(col.header, selected, col, 260)}
                </div>
              );
            }
            const value = filters.columnText[col.header] ?? '';
            return (
              <div key={col.header} className="mdb-filter-block">
                <span className="mdb-filter-block__label">{col.header}</span>
                <input
                  type="text"
                  className="mdb-filter-block__input"
                  placeholder={`Search ${col.header}…`}
                  value={value}
                  onChange={(e) => setColumnText(col.header, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                  onBlur={() => value.trim() && onSearch()}
                />
              </div>
            );
          })}
          <button type="button" className="mdb-btn mdb-btn--ghost mdb-quick__clear" onClick={onClear}>
            Reset filters
          </button>
        </div>
      ) : !schemaLoading && columns.length > 0 && advancedColumns.length === 0 ? (
        <p className="mdb-quick__empty-hint">
          Type in the search box above, or wait for filter fields to load.
        </p>
      ) : null}

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
                  const isSizeCategory = isSizeCategoryHeader(col.header);

                  if (col.kind === 'email' || col.kind === 'phone') {
                    const checked = filters.mustExist.has(col.header);
                    return (
                      <label key={col.header} className="mdb-filter-block mdb-filter-block--toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleMustExist(col.header, e.target.checked)}
                        />
                        {col.kind === 'email' ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        <span>Has {col.header}</span>
                      </label>
                    );
                  }

                  if (col.options.length < 2) {
                    const textValue = filters.columnText[col.header] ?? '';
                    return (
                      <div key={col.header} className="mdb-filter-block">
                        <span className="mdb-filter-block__label">{col.header}</span>
                        <input
                          type="text"
                          className="mdb-filter-block__input"
                          placeholder="Contains…"
                          value={textValue}
                          onChange={(e) => setColumnText(col.header, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                          onBlur={() => textValue.trim() && onSearch()}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={col.header}
                      className={blockClass(col.header, true, isSizeCategory)}
                    >
                      <span className="mdb-filter-block__label">
                        {col.header}
                        {selected.size > 0 && (
                          <span className="mdb-filter-block__count">{selected.size}</span>
                        )}
                      </span>
                      {isSizeCategory && col.options.length >= 2 ? (
                        <CategoryRangeSlider
                          options={col.options}
                          selected={selected}
                          onChange={(values) => {
                            if (isEmployeeSizeCategoryHeader(col.header)) {
                              setEmployeeExactNumeric(col.header, '');
                            }
                            setColumnRangeValues(col.header, values);
                          }}
                          onCommit={onSearch}
                          exactOnly={isEmployeeSizeCategoryHeader(col.header)}
                          exactNumericValue={
                            isEmployeeSizeCategoryHeader(col.header) ? employeeExactNumericValue : ''
                          }
                          onExactNumeric={
                            isEmployeeSizeCategoryHeader(col.header)
                              ? (value) => setEmployeeExactNumeric(col.header, value)
                              : undefined
                          }
                        />
                      ) : (
                        <div className="mdb-filter-block__select-wrap">
                          {renderChipMultiSelect(col.header, selected, col, 260)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {typeof resultCount === 'number' && resultCount > 0 && (
        <div className="mdb-quick__results">
          <span className="mdb-quick__results-badge">{resultCount.toLocaleString('en-US')}</span>
          <span>exact matches</span>
        </div>
      )}
    </div>
  );
}
