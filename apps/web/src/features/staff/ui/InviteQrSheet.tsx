'use client';

import { ActionButton, Text } from '@seed-design/react';

import QrImage from '@/shared/ui/QrImage';
import Sheet from '@/shared/ui/Sheet';

import { useInviteQr, type InviteTarget } from './useInviteQr';

interface InviteQrSheetProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  target: InviteTarget;
  /** REREGISTER일 때 대상 직원 이름 */
  memberName?: string;
}

const QR_SIZE = 220;

const formatRemaining =(milliseconds: number) => {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

/** 사장님 화면을 직원이 그 자리에서 찍어 기기를 등록한다. docs/specs/staff §3.1 */
export default function InviteQrSheet({ open, onClose, storeId, target, memberName }: InviteQrSheetProps) {
  const invite = useInviteQr({ storeId, target, open });
  const isReregister = target.kind === 'REREGISTER';

  return (
    <Sheet open={open} onClose={onClose} title={isReregister ? `${memberName}님 기기 재등록` : '직원 등록'}>
      <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
        {isReregister
          ? '새 휴대폰 카메라로 찍어 주세요. 이전 휴대폰으로는 더 이상 출근할 수 없어요.'
          : '직원 휴대폰 카메라로 이 QR을 찍으면 바로 등록돼요.'}
      </Text>
      <div className="invite-qr" aria-live="polite">
        {invite.qr && !invite.expired ? (
          <>
            <QrImage value={invite.qr.url} alt="직원 등록 QR" size={QR_SIZE} />
            <Text as="p" textStyle="t4Medium" color="fg.neutralMuted">
              {formatRemaining(invite.remainingMs)} 후 만료
            </Text>
          </>
        ) : null}
        {/* QR을 받아 오는 동안 같은 크기로 자리를 잡아 둔다. 비워 두면 시트가 열리다 말고 길어진다 */}
        {!invite.qr && !invite.expired && !invite.errorMessage ? (
          <>
            <div className="qr-image" style={{ width: QR_SIZE, height: QR_SIZE }} aria-hidden="true" />
            <Text as="p" textStyle="t4Medium" aria-hidden="true" style={{ visibility: 'hidden' }}>
              0:00 후 만료
            </Text>
          </>
        ) : null}
        {invite.expired ? (
          <ActionButton variant="neutralSolid" size="medium" onClick={invite.refreshQr}>
            새 QR 만들기
          </ActionButton>
        ) : null}
        {invite.errorMessage ? (
          <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
            {invite.errorMessage}
          </Text>
        ) : null}
      </div>
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={invite.shareLink}>
          링크로 보내기
        </ActionButton>
        <ActionButton variant="neutralSolid" size="large" flexGrow onClick={onClose}>
          닫기
        </ActionButton>
      </div>
      {invite.linkMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted" role="status">
          {invite.linkMessage}
        </Text>
      ) : null}
    </Sheet>
  );
}
