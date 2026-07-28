import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAuth, CandidateCategory } from '@/lib/authStore'

const CATEGORIES: { value: CandidateCategory; title: string; description: string }[] = [
  {
    value: 'fresher',
    title: 'Fresher',
    description: '0-1 years of experience, just starting out.',
  },
  {
    value: 'experienced',
    title: 'Experienced',
    description: 'A few years in, with a track record to show.',
  },
  {
    value: 'executive',
    title: 'Executive',
    description: 'Senior leadership or specialist-level experience.',
  },
]

// Route access (candidate-only, redirect otherwise) is enforced by the
// <ProtectedRoute allow={['candidate']}> wrapper in App.tsx.
export default function CategoryPage() {
  const [selected, setSelected] = useState<CandidateCategory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { setCategory } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) {
      setError('Pick a category to continue.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await setCategory(selected)
      navigate('/candidate')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your category')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">Which best describes you?</h1>
        <p className="mt-1 text-ink/60">This helps companies find candidates at the right level.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CATEGORIES.map((category) => {
            const isSelected = selected === category.value
            return (
              <button
                key={category.value}
                type="button"
                onClick={() => setSelected(category.value)}
                className="text-left"
              >
                <Card
                  className={[
                    'h-full cursor-pointer border-2 transition-colors',
                    isSelected ? 'border-primary' : 'border-transparent',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        'mt-1 h-4 w-4 flex-shrink-0 rounded-full border-2',
                        isSelected ? 'border-primary bg-primary' : 'border-line',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-semibold text-ink">{category.title}</p>
                      <p className="mt-1 text-sm text-ink/60">{category.description}</p>
                    </div>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>

        {error && <p className="text-center text-sm text-danger">{error}</p>}

        <Button type="submit" loading={loading} className="mx-auto">
          Continue
        </Button>
      </form>
    </div>
  )
}
