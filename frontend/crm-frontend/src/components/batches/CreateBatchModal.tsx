'use client';

import { useState, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CreateBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; rowCount?: number }) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function CreateBatchModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error,
}: CreateBatchModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rowCount: '',
  });
  const [validationError, setValidationError] = useState('');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setValidationError('');
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setValidationError('Campaign name is required');
      return;
    }

    if (formData.name.trim().length < 3) {
      setValidationError('Campaign name must be at least 3 characters');
      return;
    }

    try {
      await onSubmit({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        rowCount: formData.rowCount ? parseInt(formData.rowCount, 10) : undefined,
      });
      
      setFormData({ name: '', description: '', rowCount: '' });
      onClose();
    } catch (err) {
      // Error is handled by parent component
    }
  }, [formData, onSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Modal */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div className="pointer-events-auto w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create Campaign</h2>
              <p className="mt-0.5 text-xs text-slate-400">Add a new campaign to organize leads</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-6 sm:px-6">
            {/* Error Messages */}
            {(error || validationError) && (
              <div className="flex gap-3 rounded-lg bg-red-50 p-3 sm:p-4">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    {error || validationError}
                  </p>
                </div>
              </div>
            )}

            {/* Batch Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Q1 2024 Leads"
                disabled={loading}
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg border text-sm transition-colors',
                  'placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  validationError && formData.name === '' ? 'border-red-300 bg-red-50' : 'border-slate-200'
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                {formData.name.length}/100 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                Description <span className="text-slate-400">(Optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Add notes about this campaign..."
                disabled={loading}
                rows={3}
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg border text-sm transition-colors resize-none',
                  'placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'border-slate-200'
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                {formData.description.length}/500 characters
              </p>
            </div>

            {/* Row Count */}
            <div>
              <label htmlFor="rowCount" className="block text-sm font-medium text-slate-700 mb-2">
                Expected Rows <span className="text-slate-400">(Optional)</span>
              </label>
              <input
                id="rowCount"
                type="number"
                name="rowCount"
                value={formData.rowCount}
                onChange={handleChange}
                placeholder="e.g., 1000"
                disabled={loading}
                min="1"
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg border text-sm transition-colors',
                  'placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'border-slate-200'
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                Approximate number of leads in this batch
              </p>
            </div>

            {/* Info Box */}
            <div className="rounded-lg bg-blue-50 p-3 sm:p-4">
              <p className="text-xs text-blue-900">
                <span className="font-medium">💡 Tip:</span> Campaigns help organize and track leads. You can share campaigns with team members and monitor progress.
              </p>
            </div>
          </form>

          {/* Footer */}
          <div className="sticky bottom-0 z-10 flex gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={cn(
                'flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium',
                'text-slate-700 transition-colors',
                'hover:bg-slate-50 disabled:opacity-50'
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading || !formData.name.trim()}
              className={cn(
                'flex-1 rounded-lg bg-[#2e7ad1] py-2.5 text-sm font-medium text-white',
                'transition-colors hover:bg-[#2568b8]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
