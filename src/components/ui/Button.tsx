import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }
export function Button({ children, className = '', variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const variants = { primary: 'bg-[#D97757] text-white hover:bg-[#c56649]', secondary: 'border bg-white text-stone-700 hover:bg-stone-50', ghost: 'text-stone-600 hover:bg-stone-100' }
  const sizes = { sm: 'h-9 px-3 text-xs', md: 'h-11 px-4 text-sm' }
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}>{children}</button>
}
