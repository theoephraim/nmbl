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

export function Badge({ text, color = 'blue' }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.5rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        borderRadius: 9999,
        color: 'white',
        background: COLORS[color] ?? COLORS.blue,
      }}
    >
      {text}
    </span>
  );
}
