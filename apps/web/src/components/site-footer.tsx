export function SiteFooter({ text }: { readonly text: string }) {
  return (
    <footer className="mx-auto w-full max-w-page px-4 py-8 sm:px-8 lg:px-12 short:py-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-brume uppercase">{text}</p>
    </footer>
  );
}
