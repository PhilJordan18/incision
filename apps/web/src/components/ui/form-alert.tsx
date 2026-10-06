/** Form-level error: a sign and words with the colour, announced as an alert. */
export function FormAlert({ message }: { readonly message: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-bouton border border-erreur bg-erreur-fond px-4 py-3 text-erreur">
      <span aria-hidden="true">⚠</span>
      {message}
    </p>
  );
}
