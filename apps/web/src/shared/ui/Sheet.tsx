'use client';

import { Text } from '@seed-design/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import {
  SHEET_BACKDROP_TRANSITION,
  SHEET_ENTER_TRANSITION,
  SHEET_EXIT_TRANSITION,
  SHEET_PANEL_HIDDEN,
  SHEET_PANEL_SHOWN,
  SHEET_REDUCED_TRANSITION,
  SHEET_RESIZE_EASING,
  SHEET_RESIZE_MS,
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
            <AutoHeight animate={!reduceMotion}>
              <div className="sheet__body">
                <Text as="h2" textStyle="t7Bold">
                  {title}
                </Text>
                {children}
              </div>
            </AutoHeight>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}

interface AutoHeightProps {
  animate: boolean;
  children: ReactNode;
}

/**
 * 열린 시트의 내용 높이가 바뀌면(늦게 오는 데이터·오류 문구) 툭 튀지 않고 늘거나 준다.
 * 처음 잰 높이는 전환 없이 바로 적용해 올라오는 애니메이션과 겹치지 않는다.
 * ponytail: 닫힌 dialog 안에서는 높이가 0 으로 재져서, 0 은 건너뛰고 실제로 보일 때의 높이부터 따른다.
 * ResizeObserver 가 없는 환경(jsdom 등)은 auto 로 둔다
 */
function AutoHeight({ animate, children }: AutoHeightProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  // changed: 두 번째 측정부터 true → 그때부터만 전환을 건다
  const [size, setSize] = useState<{ height: number; changed: boolean } | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const height = inner.offsetHeight;
      if (height > 0) setSize((prev) => ({ height, changed: prev !== null }));
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        height: size?.height ?? 'auto',
        overflow: 'hidden',
        transition: animate && size?.changed ? `height ${SHEET_RESIZE_MS}ms ${SHEET_RESIZE_EASING}` : 'none',
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
