'use client';

import { useEffect } from 'react';
import { Filter, PanelLeftOpen, X } from 'lucide-react';
import { MasterDatabaseFilterTags } from './MasterDatabaseFilterPanel';
import { MasterDatabaseQuickFilters } from './MasterDatabaseQuickFilters';
import type {
  DynamicMasterDbFilters,
  MasterDataColumnFilterSchema,
} from './master-database-columns';

interface MasterDatabaseFilterSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: MasterDataColumnFilterSchema[];
  headers: string[];
  filters: DynamicMasterDbFilters;
  onChange: (next: DynamicMasterDbFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  searching: boolean;
  schemaLoading?: boolean;
  resultCount?: number;
  tags: Array<{ key: string; label: string }>;
  onRemoveTag: (key: string) => void;
  activeFilterCount: number;
}

export function MasterDatabaseFilterSidebar({
  open,
  onOpenChange,
  columns,
  headers,
  filters,
  onChange,
  onSearch,
  onClear,
  searching,
  schemaLoading,
  resultCount,
  tags,
  onRemoveTag,
  activeFilterCount,
}: MasterDatabaseFilterSidebarProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {open && (
        <button
          type="button"
          className="mdb-sidebar-backdrop"
          aria-label="Close filters"
          onClick={() => onOpenChange(false)}
        />
      )}

      <aside className={`mdb-sidebar${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="mdb-sidebar__head">
          <div className="mdb-sidebar__head-title">
            <Filter className="h-4 w-4" />
            <span>Search &amp; filter</span>
          </div>
          <button
            type="button"
            className="mdb-sidebar__close"
            onClick={() => onOpenChange(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mdb-sidebar__body">
          <MasterDatabaseQuickFilters
            variant="sidebar"
            columns={columns}
            headers={headers}
            filters={filters}
            onChange={onChange}
            onSearch={onSearch}
            onClear={onClear}
            searching={searching}
            schemaLoading={schemaLoading}
            resultCount={resultCount}
          />
          <MasterDatabaseFilterTags tags={tags} onRemove={onRemoveTag} onSearch={onSearch} />
        </div>
      </aside>

      <button
        type="button"
        className={`mdb-sidebar-fab${open ? ' is-hidden' : ''}`}
        onClick={() => onOpenChange(true)}
        title="Open search & filters"
      >
        <PanelLeftOpen className="h-4 w-4" />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="mdb-sidebar-fab__badge">{activeFilterCount}</span>
        )}
      </button>
    </>
  );
}
