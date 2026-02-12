export default function PageLayout({ children, wide = false, className = '' }) {
  return (
    <main
      className={`mx-auto px-6 py-10 ${wide ? 'max-w-6xl' : 'max-w-3xl'} ${className}`}
    >
      {children}
    </main>
  );
}
