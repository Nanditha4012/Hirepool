import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ListSkeleton from '@/components/ui/ListSkeleton'
import InlineCrudTable, { type CrudColumn, type CrudValues } from '@/components/admin/InlineCrudTable'
import {
  type AdminPlanMaster,
  createCompanyMaster,
  createDomainMaster,
  createPlanMaster,
  createPlatformBadgeMaster,
  createRejectionReasonMaster,
  createRoleMaster,
  createSkillMaster,
  deleteCompanyMaster,
  deleteDomainMaster,
  deletePlanMaster,
  deletePlatformBadgeMaster,
  deleteRejectionReasonMaster,
  deleteRoleMaster,
  deleteSkillMaster,
  listAllRejectionReasons,
  listCompanyMasters,
  listDomains,
  listPlanMasters,
  listPlatformBadgeMasters,
  listRoles,
  listSkills,
  updateCompanyMaster,
  updateDomainMaster,
  updatePlanMaster,
  updatePlatformBadgeMaster,
  updateRejectionReasonMaster,
  updateRoleMaster,
  updateSkillMaster,
  createRelevancyPriceBand,
  updateRelevancyPriceBand,
  deleteRelevancyPriceBand,
  listRelevancyPriceBands,
} from '@/lib/adminApi'

type TabKey = 'roles' | 'badges' | 'companies' | 'skills' | 'domains' | 'reasons' | 'plans' | 'relevancyPricing'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'roles', label: 'Roles' },
  { key: 'badges', label: 'Platform badges' },
  { key: 'companies', label: 'Companies' },
  { key: 'skills', label: 'Skills' },
  { key: 'domains', label: 'Domains' },
  { key: 'reasons', label: 'Rejection reasons' },
  { key: 'plans', label: 'Plans' },
  { key: 'relevancyPricing', label: 'Relevancy pricing' },
]

/**
 * Generic CRUD tab: loads a list once, wires InlineCrudTable's
 * add/edit/delete callbacks to the given API functions, and reloads after
 * every mutation. Every tab except Plans is one of these — see the Plans
 * section below for why that one is bespoke.
 */
function CrudTab({
  columns,
  list,
  create,
  update,
  remove,
  emptyLabel,
}: {
  columns: CrudColumn[]
  list: () => Promise<unknown[]>
  create: (values: CrudValues) => Promise<unknown>
  update: (id: string, values: CrudValues) => Promise<unknown>
  remove: (id: string) => Promise<void>
  emptyLabel: string
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await list()
      setRows(result as Record<string, unknown>[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <InlineCrudTable
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      emptyLabel={emptyLabel}
      onCreate={async (values) => {
        await create(values)
        await load()
      }}
      onUpdate={async (id, values) => {
        await update(id, values)
        await load()
      }}
      onDelete={async (id) => {
        await remove(id)
        await load()
      }}
    />
  )
}

/**
 * Plans get their own layout rather than sharing InlineCrudTable because
 * plans_master has more fields (unlocks/message cap/price/active) than the
 * other master tables. Backed by the real GET /admin/masters/plans list
 * endpoint, so the edit form is prefilled with each plan's actual current
 * values rather than issuing blind partial updates.
 */
function PlansTab() {
  const [plans, setPlans] = useState<AdminPlanMaster[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createName, setCreateName] = useState('')
  const [createUnlocks, setCreateUnlocks] = useState('')
  const [createCap, setCreateCap] = useState('')
  const [createPrice, setCreatePrice] = useState('')
  const [createActive, setCreateActive] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [editName, setEditName] = useState('')
  const [editUnlocks, setEditUnlocks] = useState('')
  const [editCap, setEditCap] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editActive, setEditActive] = useState<'' | 'true' | 'false'>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const planOptions = plans.map((plan) => ({ value: plan.id, label: plan.name }))

  const loadPlans = async () => {
    setLoadingPlans(true)
    setLoadError(null)
    try {
      const rows = await listPlanMasters()
      setPlans(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load plans')
    } finally {
      setLoadingPlans(false)
    }
  }

  useEffect(() => {
    loadPlans()
  }, [])

  const selectPlan = (id: string) => {
    setSelectedPlanId(id)
    setSaveError(null)
    const plan = plans.find((p) => p.id === id)
    if (!plan) {
      setEditName('')
      setEditUnlocks('')
      setEditCap('')
      setEditPrice('')
      setEditActive('')
      return
    }
    setEditName(plan.name)
    setEditUnlocks(String(plan.monthlyUnlocks))
    setEditCap(plan.monthlyMessageCap === null ? '' : String(plan.monthlyMessageCap))
    setEditPrice(String(plan.price))
    setEditActive(plan.isActive ? 'true' : 'false')
  }

  const handleCreate = async () => {
    if (!createName.trim() || !createUnlocks || !createPrice) {
      setCreateError('Name, monthly unlocks and price are required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await createPlanMaster({
        name: createName.trim(),
        monthlyUnlocks: Number(createUnlocks),
        monthlyMessageCap: createCap ? Number(createCap) : null,
        price: Number(createPrice),
        isActive: createActive,
      })
      setCreateName('')
      setCreateUnlocks('')
      setCreateCap('')
      setCreatePrice('')
      setCreateActive(true)
      await loadPlans()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create plan')
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!selectedPlanId) {
      setSaveError('Choose a plan first.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await updatePlanMaster(selectedPlanId, {
        name: editName.trim() || undefined,
        monthlyUnlocks: editUnlocks ? Number(editUnlocks) : undefined,
        monthlyMessageCap: editCap ? Number(editCap) : null,
        price: editPrice ? Number(editPrice) : undefined,
        isActive: editActive === '' ? undefined : editActive === 'true',
      })
      await loadPlans()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedPlanId) {
      setSaveError('Choose a plan first.')
      return
    }
    if (!window.confirm('Delete this plan?')) return
    setDeleting(true)
    setSaveError(null)
    try {
      await deletePlanMaster(selectedPlanId)
      selectPlan('')
      await loadPlans()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete plan')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="text-sm font-semibold text-ink">Create plan</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="Name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <Input
            label="Monthly unlocks"
            type="number"
            value={createUnlocks}
            onChange={(e) => setCreateUnlocks(e.target.value)}
          />
          <Input
            label="Message cap (blank = unlimited)"
            type="number"
            value={createCap}
            onChange={(e) => setCreateCap(e.target.value)}
          />
          <Input label="Price" type="number" value={createPrice} onChange={(e) => setCreatePrice(e.target.value)} />
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={createActive}
              onChange={(e) => setCreateActive(e.target.checked)}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            Active
          </label>
        </div>
        {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
        <Button type="button" size="sm" className="mt-4" loading={creating} onClick={handleCreate}>
          Create plan
        </Button>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink">All plans</h3>
        {loadError && <p className="mt-2 text-sm text-danger">{loadError}</p>}
        {loadingPlans ? (
          <ListSkeleton rows={3} />
        ) : plans.length === 0 ? (
          <p className="mt-3 py-4 text-center text-ink/50">No plans yet.</p>
        ) : (
          <>
            {/* Card list below `sm` — a 5-column table left plan rows cut off
                on a phone; tap targets are the same "select this plan" rows. */}
            <div className="mt-3 flex flex-col gap-2 sm:hidden">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => selectPlan(plan.id)}
                  className={`rounded-card border p-3 text-left transition-colors ${
                    selectedPlanId === plan.id ? 'border-primary bg-surface-subtle' : 'border-line/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">{plan.name}</p>
                    <span className="text-xs text-ink/60">{plan.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">
                    {plan.monthlyUnlocks} unlocks/mo · {plan.monthlyMessageCap ?? 'Unlimited'} messages · ₹
                    {plan.price}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-ink/50">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Monthly unlocks</th>
                    <th className="pb-2 pr-4">Message cap</th>
                    <th className="pb-2 pr-4">Price</th>
                    <th className="pb-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr
                      key={plan.id}
                      onClick={() => selectPlan(plan.id)}
                      className={`cursor-pointer border-t border-line/60 hover:bg-surface-subtle ${
                        selectedPlanId === plan.id ? 'bg-surface-subtle' : ''
                      }`}
                    >
                      <td className="py-2 pr-4 font-medium text-ink">{plan.name}</td>
                      <td className="py-2 pr-4">{plan.monthlyUnlocks}</td>
                      <td className="py-2 pr-4">{plan.monthlyMessageCap ?? 'Unlimited'}</td>
                      <td className="py-2 pr-4">{plan.price}</td>
                      <td className="py-2 pr-4">{plan.isActive ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink">Edit or delete a plan</h3>
        <p className="mt-1 text-xs text-ink/50">
          Click a row above, or choose it here — fields are prefilled with its current values.
        </p>
        {loadingPlans ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <Select
              label="Plan"
              placeholder="Choose a plan"
              options={planOptions}
              value={selectedPlanId}
              onChange={(e) => selectPlan(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Input label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <Input label="Monthly unlocks" type="number" value={editUnlocks} onChange={(e) => setEditUnlocks(e.target.value)} />
              <Input
                label="Message cap"
                type="number"
                value={editCap}
                onChange={(e) => setEditCap(e.target.value)}
              />
              <Input label="Price" type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              <Select
                label="Active"
                placeholder="Unchanged"
                options={[
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Inactive' },
                ]}
                value={editActive}
                onChange={(e) => setEditActive(e.target.value as '' | 'true' | 'false')}
              />
            </div>
            {saveError && <p className="text-sm text-danger">{saveError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" loading={saving} onClick={handleSave}>
                Save changes
              </Button>
              <Button type="button" size="sm" variant="danger" loading={deleting} onClick={handleDelete}>
                Delete plan
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default function MasterDataPage() {
  const [tab, setTab] = useState<TabKey>('roles')

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Master data</h1>
      <p className="mt-1 text-ink/60">Reference data used across roles, skills, domains, badges and plans.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-primary text-white' : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="mt-6">
        {tab === 'roles' && (
          <CrudTab
            columns={[{ key: 'roleName', label: 'Role name', type: 'text' }]}
            list={async () => listRoles()}
            create={(values) => createRoleMaster(String(values.roleName))}
            update={(id, values) => updateRoleMaster(id, String(values.roleName))}
            remove={(id) => deleteRoleMaster(id)}
            emptyLabel="No roles yet."
          />
        )}
        {tab === 'badges' && (
          <CrudTab
            columns={[
              { key: 'platformName', label: 'Platform', type: 'text' },
              { key: 'badgeName', label: 'Badge', type: 'text' },
              { key: 'sortOrder', label: 'Sort order', type: 'number' },
            ]}
            list={async () => listPlatformBadgeMasters()}
            create={(values) =>
              createPlatformBadgeMaster({
                platformName: String(values.platformName),
                badgeName: String(values.badgeName),
                sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
              })
            }
            update={(id, values) =>
              updatePlatformBadgeMaster(id, {
                platformName: String(values.platformName),
                badgeName: String(values.badgeName),
                sortOrder: values.sortOrder !== '' ? Number(values.sortOrder) : undefined,
              })
            }
            remove={(id) => deletePlatformBadgeMaster(id)}
            emptyLabel="No platform badges yet."
          />
        )}
        {tab === 'companies' && (
          <CrudTab
            columns={[
              { key: 'companyName', label: 'Company name', type: 'text' },
              { key: 'isMnc', label: 'MNC', type: 'checkbox' },
              { key: 'isFaangMaang', label: 'FAANG/MAANG', type: 'checkbox' },
            ]}
            list={async () => listCompanyMasters()}
            create={(values) =>
              createCompanyMaster({
                companyName: String(values.companyName),
                isMnc: Boolean(values.isMnc),
                isFaangMaang: Boolean(values.isFaangMaang),
              })
            }
            update={(id, values) =>
              updateCompanyMaster(id, {
                companyName: String(values.companyName),
                isMnc: Boolean(values.isMnc),
                isFaangMaang: Boolean(values.isFaangMaang),
              })
            }
            remove={(id) => deleteCompanyMaster(id)}
            emptyLabel="No companies yet."
          />
        )}
        {tab === 'skills' && (
          <CrudTab
            columns={[{ key: 'skillName', label: 'Skill name', type: 'text' }]}
            list={async () => listSkills()}
            create={(values) => createSkillMaster(String(values.skillName))}
            update={(id, values) => updateSkillMaster(id, String(values.skillName))}
            remove={(id) => deleteSkillMaster(id)}
            emptyLabel="No skills yet."
          />
        )}
        {tab === 'domains' && (
          <CrudTab
            columns={[{ key: 'domainName', label: 'Domain name', type: 'text' }]}
            list={async () => listDomains()}
            create={(values) => createDomainMaster(String(values.domainName))}
            update={(id, values) => updateDomainMaster(id, String(values.domainName))}
            remove={(id) => deleteDomainMaster(id)}
            emptyLabel="No domains yet."
          />
        )}
        {tab === 'reasons' && (
          <CrudTab
            columns={[
              {
                key: 'scope',
                label: 'Scope',
                type: 'select',
                options: [
                  { value: 'profile', label: 'Profile' },
                  { value: 'item', label: 'Item' },
                ],
              },
              { key: 'reasonText', label: 'Reason text', type: 'text' },
            ]}
            list={async () => listAllRejectionReasons()}
            create={(values) =>
              createRejectionReasonMaster({
                scope: values.scope as 'profile' | 'item',
                reasonText: String(values.reasonText),
              })
            }
            update={(id, values) =>
              updateRejectionReasonMaster(id, {
                scope: values.scope as 'profile' | 'item',
                reasonText: String(values.reasonText),
              })
            }
            remove={(id) => deleteRejectionReasonMaster(id)}
            emptyLabel="No rejection reasons yet."
          />
        )}
        {tab === 'plans' && <PlansTab />}
        {tab === 'relevancyPricing' && (
          <CrudTab
            columns={[
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'minCandidates', label: 'Min candidates', type: 'number' },
              { key: 'maxCandidates', label: 'Max candidates (blank = no limit)', type: 'number' },
              { key: 'price', label: 'Price (blank = contact sales)', type: 'number' },
              { key: 'isContactSales', label: 'Contact sales only', type: 'checkbox' },
              { key: 'sortOrder', label: 'Sort order', type: 'number' },
            ]}
            list={async () => listRelevancyPriceBands()}
            create={(values) =>
              createRelevancyPriceBand({
                label: String(values.label),
                minCandidates: Number(values.minCandidates),
                maxCandidates: values.maxCandidates !== '' ? Number(values.maxCandidates) : null,
                price: values.price !== '' ? Number(values.price) : null,
                isContactSales: Boolean(values.isContactSales),
                sortOrder: values.sortOrder !== '' ? Number(values.sortOrder) : undefined,
              })
            }
            update={(id, values) =>
              updateRelevancyPriceBand(id, {
                label: String(values.label),
                minCandidates: Number(values.minCandidates),
                maxCandidates: values.maxCandidates !== '' ? Number(values.maxCandidates) : null,
                price: values.price !== '' ? Number(values.price) : null,
                isContactSales: Boolean(values.isContactSales),
                sortOrder: values.sortOrder !== '' ? Number(values.sortOrder) : undefined,
              })
            }
            remove={(id) => deleteRelevancyPriceBand(id)}
            emptyLabel="No price bands yet."
          />
        )}
      </Card>
    </div>
  )
}
