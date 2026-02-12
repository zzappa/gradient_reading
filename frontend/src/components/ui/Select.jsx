export default function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  className = '',
  ...props
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-text mb-1">
          {label}
        </label>
      )}
      <select
        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
