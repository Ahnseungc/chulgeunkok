interface KokMarkProps {
  size?: number;
}

/** 출근콕 "콕" 마크 (assets/brand/출근콕-출근완료화면.png). 장식용이라 스크린리더에서 숨긴다 */
export default function KokMark({ size = 96 }: KokMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <g stroke="var(--color-brand-kok)" strokeWidth="10" strokeLinecap="round">
        <line x1="48" y1="8" x2="48" y2="24" />
        <line x1="14" y1="22" x2="26" y2="34" />
        <line x1="82" y1="22" x2="70" y2="34" />
      </g>
      <circle cx="48" cy="62" r="26" fill="var(--color-brand-kok)" />
    </svg>
  );
}
