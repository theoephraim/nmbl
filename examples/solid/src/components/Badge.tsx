interface BadgeProps {
  text: string;
  color?: 'green' | 'blue' | 'red' | 'gray';
}

const COLORS: Record<string, string> = {
  green: '#10b981',
  blue: '#3b82f6',
  red: '#ef4444',
  gray: '#6b7280',
};

export function Badge(props: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.5rem',
        'font-size': '0.75rem',
        'font-weight': 600,
        'text-transform': 'uppercase',
        'border-radius': '9999px',
        color: 'white',
        background: COLORS[props.color ?? 'blue'] ?? COLORS.blue,
      }}
    >
      {props.text}
    </span>
  );
}
