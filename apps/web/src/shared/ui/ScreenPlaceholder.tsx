import { ActionButton } from '@seed-design/react';

interface ScreenPlaceholderProps {
  title: string;
  /** 저장소 기준 스펙 경로 (예: `docs/specs/attendance/README.md §3.1`) */
  spec: string;
  /** 화면에 들어갈 요소 요약 — 스펙 "화면" 절 */
  summary: string;
}

/** 스캐폴드 단계 화면 자리표시자. 화면 구현 시 페이지에서 지운다. */
export default function ScreenPlaceholder({ title, spec, summary }: ScreenPlaceholderProps) {
  return (
    <main className="screen">
      <h1>{title}</h1>
      <p>{summary}</p>
      <p>
        <small>스펙: {spec}</small>
      </p>
      <ActionButton variant="neutralWeak" size="medium" disabled>
        준비 중
      </ActionButton>
    </main>
  );
}
