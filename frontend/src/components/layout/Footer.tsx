import { APP_NAME, SUPPORT_EMAIL } from '@/lib/config'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-ink/60 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
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
        <p className="border-t border-line pt-3 text-center text-xs text-ink/50 sm:text-left">
          Anything urgent, or something the app doesn&apos;t cover? Write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </footer>
  )
}
