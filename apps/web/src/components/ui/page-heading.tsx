type PageHeadingProps = {
  readonly bold: string;
  /** The single Instrument Serif word of a title (design rule 6), if any. */
  readonly serif?: string;
  readonly size?: "page" | "panel";
};

/** Big Shoulders in capitals, with one word in Instrument Serif italic. */
export function PageHeading({ bold, serif, size = "page" }: PageHeadingProps) {
  const scale = size === "page" ? "text-5xl sm:text-[64px] leading-[0.9]" : "text-[44px] sm:text-[56px] leading-[0.95]";
  return (
    <h1 className={`font-display font-black uppercase ${scale}`}>
      {bold}
      {serif ? (
        <>
          {" "}
          <em className="font-serif font-normal normal-case italic">{serif}</em>
        </>
      ) : null}
    </h1>
  );
}
