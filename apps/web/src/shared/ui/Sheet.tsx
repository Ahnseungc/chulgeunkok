'use client';

import { Text } from '@seed-design/react';
import { useEffect, useRef } from 'react';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * 하단 시트. 네이티브 <dialog>라 포커스 가두기·ESC 닫기·배경 비활성화를 브라우저가 맡는다.
 * ponytail: Seed BottomSheet(드래그 닫기·애니메이션)는 RN 셸 화면 작업 때 교체를 검토한다.
 */
export default function Sheet({ open, title, onClose, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 부모가 닫아서 생긴 close 이벤트는 무시하고, ESC 등 사용자가 닫은 경우만 onClose로 알린다
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={title}
      onClose={() => {
        if (openRef.current) onClose();
      }}
      onClick={(event) => {
        // 배경(dialog 자신)을 누르면 닫는다. 내용 클릭은 무시
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet__body">
        <Text as="h2" textStyle="t7Bold">
          {title}
        </Text>
        {children}
      </div>
    </dialog>
  );
}
