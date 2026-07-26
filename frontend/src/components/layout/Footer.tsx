import { APP_NAME } from '@/lib/config'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-gray-200 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-ink/60 sm:flex-row sm:px-6">
        <p>
          &copy; {year} {APP_NAME}. All rights reserved.
        </p>
        <div className="flex gap-4">
          {/* Real legal pages are Phase 7 — placeholders for now */}
          <a href="#" className="hover:text-primary">
            Privacy
          </a>
          <a href="#" className="hover:text-primary">
            Terms
          </a>
        </div>
      </div>
    </footer>
  )
}
