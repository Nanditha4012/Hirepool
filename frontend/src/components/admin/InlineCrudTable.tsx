import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import PageLoader from '@/components/ui/PageLoader'

export type CrudFieldType = 'text' | 'number' | 'checkbox' | 'select'

export interface CrudColumn {
  key: string
  label: string
  type?: CrudFieldType
  options?: { value: string; label: string }[]
  placeholder?: string
}

export type CrudValues = Record<string, string | number | boolean>

interface InlineCrudTableProps {
  columns: CrudColumn[]
  rows: Record<string, unknown>[]
  loading?: boolean
  error?: string | null
  emptyLabel?: string
  onCreate: (values: CrudValues) => Promise<void>
  onUpdate: (id: string, values: CrudValues) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function defaultValuesFor(columns: CrudColumn[]): CrudValues {
  const values: CrudValues = {}
  columns.forEach((col) => {
    values[col.key] = col.type === 'checkbox' ? false : ''
  })
  return values
}

function rowToValues(row: Record<string, unknown>, columns: CrudColumn[]): CrudValues {
  const values: CrudValues = {}
  columns.forEach((col) => {
    const raw = row[col.key]
    if (col.type === 'checkbox') values[col.key] = Boolean(raw)
    else values[col.key] = raw === null || raw === undefined ? '' : String(raw)
  })
  return values
}

function CrudFieldInput({
  column,
  value,
  onChange,
}: {
  column: CrudColumn
  value: string | number | boolean
  onChange: (v: string | number | boolean) => void
}) {
  if (column.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
      />
    )
  }
  if (column.type === 'select' && column.options) {
    return (
      <Select options={column.options} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    )
  }
  return (
    <Input
      type={column.type === 'number' ? 'number' : 'text'}
      placeholder={column.placeholder}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * One small reusable add-row / edit-row / delete-row pattern shared by every
 * master-data tab in MasterDataPage — seven near-identical CRUD tables would
 * otherwise be seven bespoke UIs.
 */
export default function InlineCrudTable({
  columns,
  rows,
  loading,
  error,
  emptyLabel,
  onCreate,
  onUpdate,
  onDelete,
}: InlineCrudTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<CrudValues>({})
  const [creating, setCreating] = useState(false)
  const [newValues, setNewValues] = useState<CrudValues>(defaultValuesFor(columns))
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const startEdit = (row: Record<string, unknown>) => {
    setEditingId(String(row.id))
    setEditValues(rowToValues(row, columns))
    setLocalError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValues({})
  }

  const saveEdit = async () => {
    if (!editingId) return
    setBusy(true)
    setLocalError(null)
    try {
      await onUpdate(editingId, editValues)
      setEditingId(null)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this row?')) return
    setBusy(true)
    setLocalError(null)
    try {
      await onDelete(id)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      await onCreate(newValues)
      setNewValues(defaultValuesFor(columns))
      setCreating(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {localError && <p className="mb-2 text-sm text-danger">{localError}</p>}
      {loading && <PageLoader compact label="Loading…" />}
      {!loading && error && <p className="text-danger">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/60">
                {columns.map((col) => (
                  <th key={col.key} className="py-2 pr-4 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !creating && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-6 text-center text-ink/50">
                    {emptyLabel || 'No rows yet.'}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const id = String(row.id)
                const isEditing = editingId === id
                return (
                  <tr key={id} className="border-b border-line transition-colors last:border-0 hover:bg-surface/60">
                    {columns.map((col) => (
                      <td key={col.key} className="py-2 pr-4">
                        {isEditing ? (
                          <CrudFieldInput
                            column={col}
                            value={editValues[col.key]}
                            onChange={(v) => setEditValues((prev) => ({ ...prev, [col.key]: v }))}
                          />
                        ) : col.type === 'checkbox' ? (
                          row[col.key] ? (
                            'Yes'
                          ) : (
                            'No'
                          )
                        ) : (
                          String(row[col.key] ?? '—')
                        )}
                      </td>
                    ))}
                    <td className="py-2 pr-4">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" loading={busy} onClick={saveEdit}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(row)}>
                            Edit
                          </Button>
                          <Button type="button" size="sm" variant="danger" onClick={() => handleDelete(id)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {creating && (
                <tr className="border-b border-line">
                  {columns.map((col) => (
                    <td key={col.key} className="py-2 pr-4">
                      <CrudFieldInput
                        column={col}
                        value={newValues[col.key]}
                        onChange={(v) => setNewValues((prev) => ({ ...prev, [col.key]: v }))}
                      />
                    </td>
                  ))}
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <Button type="button" size="sm" loading={busy} onClick={handleCreate}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCreating(false)
                          setNewValues(defaultValuesFor(columns))
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!creating && (
        <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setCreating(true)}>
          + Add row
        </Button>
      )}
    </div>
  )
}
