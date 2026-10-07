import Image from "next/image";
import Link from "next/link";

const SIZES = {
  header: { icon: 40, wordmark: { width: 128, height: 27 } },
  panel: { icon: 36, wordmark: { width: 116, height: 25 } },
} as const;

/**
 * Logo of the site, linking home: the red icon and the wordmark, white on Abysse and
 * black on Aube (apps/design/README.md, Logo). Philippe's SVG files are served unchanged
 * (`unoptimized`): never recoloured, stretched or framed.
 */
export function LogoLink({ label, size = "header" }: { readonly label: string; readonly size?: keyof typeof SIZES }) {
  const { icon, wordmark } = SIZES[size];
  return (
    <Link href="/" aria-label={label} className="flex min-h-11 shrink-0 items-center gap-3 self-start rounded-bouton">
      <Image src="/brand/ico-red.svg" alt="" width={icon} height={icon} unoptimized />
      <Image src="/brand/wm-white.svg" alt="" {...wordmark} unoptimized className="only-abysse" />
      <Image src="/brand/wm-black.svg" alt="" {...wordmark} unoptimized className="only-aube" />
    </Link>
  );
}
