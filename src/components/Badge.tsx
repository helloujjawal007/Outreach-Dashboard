import type { ReactNode } from 'react';

interface BadgeProps {
  variant?: 'gray' | 'green' | 'blue' | 'yellow' | 'red' | 'purple';
  children: ReactNode;
  className?: string;
}

const variantMap: Record<NonNullable<BadgeProps['variant']>, string> = {
  gray: 'badge-gray',
  green: 'badge-green',
  blue: 'badge-blue',
  yellow: 'badge-yellow',
  red: 'badge-red',
  purple: 'badge-purple',
};

export function Badge({ variant = 'gray', children, className = '' }: BadgeProps) {
  return <span className={`${variantMap[variant]} ${className}`}>{children}</span>;
}
