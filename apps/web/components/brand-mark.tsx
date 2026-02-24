type BrandMarkVariant = "compact" | "hero";

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  className?: string;
  decorative?: boolean;
  title?: string;
}

function cx(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

export function BrandMark({
  variant = "compact",
  className,
  decorative = true,
  title = "Hive Mind mark"
}: BrandMarkProps) {
  const sharedProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": title };

  return (
    <span className={cx("brand-mark", `brand-mark--${variant}`, className)}>
      <svg viewBox="0 0 56 60" focusable="false" {...sharedProps}>
        <path
          className="brand-mark-bubble"
          d="M35.8 24.7 43.6 20.5l6.9 4.5v14.2q0 4.2-2.7 5.8L33.4 52l-5.6 7 2.2-8.2-3.2-1.9V38.8l9-5.1Z"
        />
        <polygon className="brand-mark-hex brand-mark-hex--a" points="17,5.6 23.4,9.3 23.4,16.7 17,20.4 10.6,16.7 10.6,9.3" />
        <polygon className="brand-mark-hex brand-mark-hex--b" points="35,5.6 41.4,9.3 41.4,16.7 35,20.4 28.6,16.7 28.6,9.3" />
        <polygon className="brand-mark-hex brand-mark-hex--c" points="8,20.6 14.4,24.3 14.4,31.7 8,35.4 1.6,31.7 1.6,24.3" />
        <polygon className="brand-mark-hex brand-mark-hex--a" points="26,20.6 32.4,24.3 32.4,31.7 26,35.4 19.6,31.7 19.6,24.3" />
        <polygon className="brand-mark-hex brand-mark-hex--b" points="17,35.6 23.4,39.3 23.4,46.7 17,50.4 10.6,46.7 10.6,39.3" />
      </svg>
    </span>
  );
}
