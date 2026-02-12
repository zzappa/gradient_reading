export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-bg border border-border rounded-lg shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
