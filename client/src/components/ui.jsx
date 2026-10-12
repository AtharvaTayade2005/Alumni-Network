import { useId } from 'react'
import { Link } from 'react-router-dom'

export function cx(...values) {
  return values.filter(Boolean).join(' ')
}

export function Card({ children, className, as = 'section' }) {
  const Element = as
  return (
    <Element className={cx(
      'rounded-sm border border-swiss-border bg-swiss-surface', className,
    )}>
      {children}
    </Element>
  )
}

export function CardHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-swiss-border px-5 py-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-swiss-text">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-swiss-muted">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}

export function Button({
  as: Component = 'button',
  children, variant = 'primary', size = 'md', className, type = 'button', ...rest
}) {
  const variants = {
    primary: 'bg-swiss-accent text-white hover:opacity-80 disabled:bg-swiss-border disabled:text-swiss-muted',
    secondary: 'border border-swiss-border bg-transparent text-swiss-text hover:bg-swiss-surface-hover disabled:text-swiss-muted',
    danger: 'border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900/40 disabled:opacity-50',
    ghost: 'text-swiss-muted hover:text-swiss-text hover:bg-swiss-surface-hover disabled:text-swiss-label',
  }
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-4 py-2.5 text-sm',
  }
  const typeProp = Component === 'button' ? { type } : {}
  return (
    <Component
      {...typeProp}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-swiss-text',
        'disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function Field({ label, hint, error, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-mono tracking-widest text-swiss-label uppercase">
          {label}
          {required ? <span className="ml-0.5 text-swiss-accent">*</span> : null}
        </span>
        {hint ? <span className="text-xs text-swiss-label">{hint}</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-mono text-red-500">{error}</span>
      ) : null}
    </label>
  )
}

const inputBase = 'w-full rounded-sm border bg-transparent px-3 py-2 text-sm text-swiss-text transition-colors focus:outline-none focus:border-swiss-text disabled:bg-swiss-surface-alt disabled:text-swiss-label placeholder:text-swiss-label'

export function Input({ className, invalid, ...rest }) {
  return (
    <input
      className={cx(
        inputBase,
        invalid
          ? 'border-red-900 focus:border-red-500'
          : 'border-swiss-border',
        className,
      )}
      {...rest}
    />
  )
}

export function Textarea({ className, invalid, rows = 3, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={cx(
        inputBase,
        invalid
          ? 'border-red-900 focus:border-red-500'
          : 'border-swiss-border',
        className,
      )}
      {...rest}
    />
  )
}

export function Select({ className, invalid, children, ...rest }) {
  return (
    <select
      className={cx(
        inputBase,
        invalid ? 'border-red-900' : 'border-swiss-border',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Checkbox({ label, description, ...rest }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded-sm border-swiss-border bg-transparent text-swiss-text focus:ring-swiss-text/20 focus:ring-offset-swiss-base"
        {...rest}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-swiss-text">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-swiss-muted">{description}</span>
        ) : null}
      </label>
    </div>
  )
}

export function Alert({ tone = 'error', title, children, onDismiss }) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-green-200 bg-green-50 text-green-700',
    info: 'border-swiss-border bg-swiss-surface text-swiss-text',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
  }
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-sm border px-4 py-3 text-sm', tones[tone])}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {title ? <p className="font-mono text-xs uppercase tracking-widest mb-1 opacity-80">{title}</p> : null}
          {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-sm p-0.5 text-current/70 hover:bg-white/5 font-mono"
            aria-label="Dismiss"
          >
            [x]
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Renders a 422 field-errors map from the API. */
export function FieldErrorSummary({ error, fallback = 'Please correct the highlighted fields.' }) {
  if (!error) return null
  const entries = Object.entries(error.fields ?? {})
  if (!entries.length) {
    return error.message ? <Alert tone="error">{error.message}</Alert> : null
  }
  return (
    <Alert tone="error" title={error.message ?? fallback}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {entries.map(([field, detail]) => (
          <li key={field}>
            <span className="font-mono text-xs">{field}</span>: {detail}
          </li>
        ))}
      </ul>
    </Alert>
  )
}

export function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-swiss-border border-t-swiss-text',
        className,
      )}
    />
  )
}

export function LoadingBlock({ label = 'Loading', rows = 3 }) {
  return (
    <div className="space-y-3 p-5 border border-swiss-border bg-swiss-surface rounded-sm" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="font-mono text-xs text-swiss-label mb-2 uppercase">{label}...</div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-2 rounded-sm bg-swiss-border"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="px-5 py-10 text-center border border-swiss-border border-dashed rounded-sm bg-transparent">
      <p className="font-mono text-xs tracking-widest text-swiss-label uppercase">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-swiss-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const isAuth = error?.status === 401 ||
    error?.code === 'UNAUTHORIZED' ||
    error?.code === 'UNAUTHENTICATED' ||
    error?.message?.toLowerCase?.().includes('token is missing') ||
    error?.message?.toLowerCase?.().includes('session is no longer valid')

  const isForbidden = error?.status === 403 || error?.code === 'FORBIDDEN'
  const isNotFound = error?.status === 404 || error?.code === 'NOT_FOUND'
  const isNetwork = error?.status === 0 || error?.code === 'NETWORK_ERROR'

  let title = error?.code || 'ERR_REQUEST_FAILED'
  let description = error?.message ?? 'An unexpected error occurred.'

  if (isAuth) {
    title = 'AUTHENTICATION_REQUIRED'
    description = error?.message || 'Your session has expired or authentication is required. Please sign in to continue.'
  } else if (isForbidden) {
    title = 'ACCESS_DENIED'
    description = error?.message || 'You do not have permission to view or modify this resource.'
  } else if (isNotFound) {
    title = 'NOT_FOUND'
  } else if (isNetwork) {
    title = 'NETWORK_ERROR'
  }

  const action = isAuth ? (
    <Link to="/login">
      <Button>SIGN IN →</Button>
    </Link>
  ) : onRetry ? (
    <Button variant="secondary" onClick={onRetry}>RETRY</Button>
  ) : null

  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
    />
  )
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'border-swiss-border bg-swiss-surface-hover text-swiss-muted',
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-[var(--color-swiss-accent)] bg-orange-50 text-[var(--color-swiss-accent)]',
  }
  return (
    <span className={cx(
      'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase', tones[tone],
    )}>
      {children}
    </span>
  )
}

export function Avatar({ name, src, size = 'md' }) {
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-lg' }
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cx('shrink-0 rounded-sm object-cover border border-swiss-border grayscale', sizes[size])}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-sm bg-swiss-border font-mono text-swiss-text',
        sizes[size],
      )}
    >
      {initials || '?'}
    </span>
  )
}

export function Pagination({ meta, onChange }) {
  if (!meta || !meta.totalPages || meta.totalPages < 1) return null
  const { page, totalPages, total, limit } = meta
  if (total === 0) return null
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-swiss-border px-5 py-3 font-mono text-xs text-swiss-label">
      <p>
        SHOWING <span className="text-swiss-text">{from}</span>-
        <span className="text-swiss-text">{to}</span> OF{' '}
        <span className="text-swiss-text">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasPrev && page <= 1}
          onClick={() => onChange(page - 1)}
          className="font-mono text-[10px]"
        >
          PREV
        </Button>
        <span className="text-[10px] uppercase">PAGE {page}/{totalPages}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasNext && page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="font-mono text-[10px]"
        >
          NEXT
        </Button>
      </div>
    </div>
  )
}
