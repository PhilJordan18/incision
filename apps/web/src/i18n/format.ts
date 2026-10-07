/** Fills `{name}` placeholders of a dictionary string; unknown placeholders stay as is. */
export function format(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : placeholder));
}
