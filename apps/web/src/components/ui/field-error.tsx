/** Field error: colour plus a ⚠ sign and words, never colour alone (design rule 8). */
export function FieldError({ id, message }: { readonly id: string; readonly message: string }) {
  return (
    <p id={id} className="flex gap-1.5 text-sm text-erreur">
      <span aria-hidden="true">⚠</span>
      {message}
    </p>
  );
}
