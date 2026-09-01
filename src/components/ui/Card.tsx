import type { HTMLAttributes, ReactNode } from 'react'
interface CardProps extends HTMLAttributes<HTMLDivElement> { children: ReactNode }
export function Card({ children, className = '', ...props }: CardProps) { return <section {...props} className={`rounded-[20px] border bg-white shadow-[0_8px_30px_rgb(67,48,39,0.05)] ${className}`}>{children}</section> }
