import { PASSWORD_RULES } from '@/lib/passwordStrength'

interface PasswordRequirementsProps {
  password: string
}

/** Live checklist shown under a new-password field — guides toward a strong password rather than just rejecting a weak one after submit. */
export default function PasswordRequirements({ password }: PasswordRequirementsProps) {
  return (
    <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const met = password.length > 0 && rule.test(password)
        return (
          <li
            key={rule.label}
            className={['flex items-center gap-1.5', met ? 'text-verified' : 'text-ink/40'].join(' ')}
          >
            <span
              className={[
                'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full text-[9px]',
                met ? 'bg-verified/15' : 'bg-ink/10',
              ].join(' ')}
              aria-hidden="true"
            >
              {met ? '✓' : ''}
            </span>
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
