import { Link } from 'react-router-dom'
import Button from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-3xl font-bold text-ink">Page not found</h1>
      <p className="text-ink/60">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link to="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  )
}
