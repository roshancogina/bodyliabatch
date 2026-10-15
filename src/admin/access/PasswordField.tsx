import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '../../components/ui/input'

/** Password input with show/hide. Paste and password managers allowed (WCAG 3.3.8). */
export const PasswordField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} ref={ref} type={show ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-md text-muted hover:text-burgundy"
      >
        {show ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  )
})
PasswordField.displayName = 'PasswordField'
