'use client';

import { Text } from '@seed-design/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_ENTER_TRANSITION,
  SHEET_EXIT_TRANSITION,
  SHEET_PANEL_HIDDEN,
  SHEET_PANEL_SHOWN,
  SHEET_REDUCED_TRANSITION,
} from '@/shared/motion/sheetMotion';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 하단 시트. 네이티브 <dialog>라 포커스 가두기·배경 비활성화를 브라우저가 맡는다.
 * 열 때 아래에서 올라오고 배경이 어두워지며, 닫을 땐 내려가는 애니메이션이 끝난 뒤 dialog.close() 한다.
 * ESC·배경 누름은 바로 닫지 않고 onClose로 알려 부모가 open=false 로 내리게 한다 (같은 닫힘 애니메이션).
 * 닫히는 동안엔 AnimatePresence 가 마지막으로 그린 내용을 그대로 보여 줘, 부모 상태가 먼저 비워져도 깜빡이지 않는다.
 * ponytail: 드래그로 닫기는 필요해지면 Seed BottomSheet 교체와 함께 검토한다.
 */
export default function Sheet({ open, title, onClose, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reduceMotion = useReducedMotion();
  // 부모가 닫아서 생긴 close 이벤트는 무시하고, 브라우저가 강제로 닫은 경우만 onClose로 알린다
  const openRef = useRef(open);
  openRef.current = open;

  // 내용이 DOM에 붙은 뒤 페인트 전에 열어야 showModal 이 첫 포커스 대상을 찾고, 올라오는 첫 프레임이 보인다
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  const enter = reduceMotion ? SHEET_REDUCED_TRANSITION : SHEET_ENTER_TRANSITION;
  const exit = reduceMotion ? SHEET_REDUCED_TRANSITION : SHEET_EXIT_TRANSITION;
  const fade = reduceMotion ? SHEET_REDUCED_TRANSITION : SHEET_BACKDROP_TRANSITION;

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={title}
      onCancel={(event) => {
        // ESC: 바로 닫지 않고 닫힘 애니메이션을 거친다
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (openRef.current) onClose();
      }}
    >
      <AnimatePresence
        onExitComplete={() => {
          // 닫는 도중 다시 열렸으면 닫지 않는다
          if (!openRef.current) dialogRef.current?.close();
        }}
      >
        {open ? (
          <motion.div
            key="backdrop"
            className="sheet__backdrop"
            data-testid="sheet-backdrop"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: fade }}
            transition={fade}
            onClick={onClose}
          />
        ) : null}
        {open ? (
          <motion.div
            key="panel"
            className="sheet__panel"
            initial={SHEET_PANEL_HIDDEN}
            animate={SHEET_PANEL_SHOWN}
            exit={{ ...SHEET_PANEL_HIDDEN, transition: exit }}
            transition={enter}
          >
            <div className="sheet__body">
              <Text as="h2" textStyle="t7Bold">
                {title}
              </Text>
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}
