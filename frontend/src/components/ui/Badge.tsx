import type { ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'progress'
  | 'waiting'
  | 'review'
  | 'ready'
  | 'done'
  | 'urgent'
  | 'admin'
  | 'qa';

export type BadgeVariant = 'soft' | 'outline';

interface BadgeProps {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: 'sm' | 'xs';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneClassMap: Record<BadgeVariant, Record<BadgeTone, string>> = {
  soft: {
    neutral:  'dt-soft-pill-neutral',
    progress: 'dt-soft-pill-progress',
    waiting:  'dt-soft-pill-waiting',
    review:   'dt-soft-pill-review',
    ready:    'dt-soft-pill-ready',
    done:     'dt-soft-pill-done',
    urgent:   'dt-soft-pill-urgent',
    admin:    'dt-soft-pill-admin',
    qa:       'dt-soft-pill-qa',
  },
  outline: {
    neutral:  'dt-soft-pill-outline-neutral',
    progress: 'dt-soft-pill-outline-progress',
    waiting:  'dt-soft-pill-outline-waiting',
    review:   'dt-soft-pill-outline-review',
    ready:    'dt-soft-pill-outline-ready',
    done:     'dt-soft-pill-outline-done',
    urgent:   'dt-soft-pill-outline-urgent',
    admin:    'dt-soft-pill-outline-admin',
    qa:       'dt-soft-pill-outline-qa',
  },
};

const Badge = ({
  tone = 'neutral',
  variant = 'soft',
  size = 'sm',
  icon,
  children,
  className = '',
}: BadgeProps) => {
  const classes = [
    'dt-soft-pill',
    toneClassMap[variant][tone],
    size === 'xs' ? 'dt-soft-pill-xs' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {icon}
      <span>{children}</span>
    </span>
  );
};

export default Badge;
