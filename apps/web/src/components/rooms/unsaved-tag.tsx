/**
 * The mark of a change that is not saved yet (DA2-5b, DA2-8): a sign and a word in a bordered tag,
 * never the colour alone. The caller supplies the word from its dictionary.
 */
export function UnsavedTag({ label, className = "" }: { readonly label: string; readonly className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-puce border border-or px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-[0.14em] whitespace-nowrap text-ecume uppercase ${className}`}>
      <span aria-hidden="true">⚠</span><span>{label}</span>
    </span>
  );
}
