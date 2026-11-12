'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import QrRotateSheet from '@/features/store/ui/QrRotateSheet';
import InlineAlert from '@/shared/ui/InlineAlert';
import ScreenHeader from '@/shared/ui/ScreenHeader';

import QrCardControls from './QrCardControls';
import QrCardPreview from './QrCardPreview';
import { useQrCard, type QrCardSaveState } from './useQrCard';

const SAVE_STATE_TEXT: Record<QrCardSaveState, string | null> = {
  idle: null,
  saving: '저장하고 있어요',
  saved: '저장했어요',
  error: null,
};

/** `/owner/[storeId]/qr-card` — docs/specs/qr-card §5 */
export default function QrCardScreen({ storeId }: { storeId: string }) {
  const card = useQrCard(storeId);
  const { design } = card;
  const qrUrl = card.qr.url;
  const ctaLoading = !design && !card.loadError;

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}/settings`} backLabel="매장 설정" title="QR 카드 만들기" />
      <Text as="h1" textStyle="t8Bold">
        QR 카드 만들기
      </Text>
      <InlineAlert message={card.loadError ?? card.qr.error} />
      <div className="qr-card-stage">
        {qrUrl && design ? (
          <QrCardPreview design={design} qrUrl={qrUrl} logo={card.logo.image} wordmark={card.wordmark} />
        ) : null}
        {!card.qr.loading && !card.qr.error && !qrUrl ? (
          <ReissueNotice storeId={storeId} onRotated={card.setRotatedUrl} />
        ) : null}
      </div>
      {design ? (
        <QrCardControls
          design={design}
          onChange={card.setDesign}
          logo={card.logo}
          onUploadLogo={(file) => void card.uploadLogo(file)}
          onRemoveLogo={() => void card.removeLogo()}
        />
      ) : null}
      <InlineAlert message={SAVE_STATE_TEXT[card.saveState]} textStyle="t4Regular" color="fg.neutralMuted" role="status" />
      <InlineAlert message={card.saveError ?? card.downloadError} textStyle="t4Regular" />
      <div className="qr-card-bottom">
        <div className="punch-bottom store-qr__actions">
          <ActionButton
            variant="neutralSolid"
            size="large"
            flexGrow
            loading={ctaLoading || card.downloading === 'pdf'}
            disabled={!card.canDownload || card.downloading !== null}
            onClick={() => void card.download('pdf')}
          >
            PDF 받기
          </ActionButton>
          <ActionButton
            variant="neutralWeak"
            size="large"
            flexGrow
            loading={ctaLoading || card.downloading === 'png'}
            disabled={!card.canDownload || card.downloading !== null}
            onClick={() => void card.download('png')}
          >
            이미지 받기
          </ActionButton>
        </div>
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          인쇄할 때 &apos;실제 크기&apos;로 찍어 주세요
        </Text>
      </div>
    </main>
  );
}

/** 이 기능 전에 만든 QR은 원문이 없어 카드를 그릴 수 없다. 재발급을 안내한다 (§3.2, §5.6·§5.7) */
function ReissueNotice({ storeId, onRotated }: { storeId: string; onRotated: (url: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleRotated = (url: string) => {
    setConfirmOpen(false);
    onRotated(url);
  };

  return (
    <section className="qr-card-reissue" aria-label="QR 다시 만들기">
      <Text as="p" textStyle="t5Bold">
        QR을 새로 만들어야 카드를 만들 수 있어요
      </Text>
      <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
        지금 붙어 있는 QR과 NFC 스티커는 새로 만들면 바로 쓸 수 없어요.
      </Text>
      <ActionButton variant="neutralWeak" size="medium" onClick={() => setConfirmOpen(true)}>
        새 QR 만들기
      </ActionButton>
      <QrRotateSheet storeId={storeId} open={confirmOpen} onClose={() => setConfirmOpen(false)} onRotated={handleRotated} />
    </section>
  );
}
