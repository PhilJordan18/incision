export function SkipLink({ label }: { readonly label: string }) {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-bouton focus:bg-ecume focus:px-4 focus:py-3 focus:font-semibold focus:text-abysse"
    >
      {label}
    </a>
  );
}
