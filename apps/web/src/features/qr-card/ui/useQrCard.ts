'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';

import { QR_CARD_MESSAGE_MAX, QR_CARD_TITLE_MAX, type QrCardDesignDto } from '../model/qr-card-types';

import { downloadQrCard, isLogoType, loadImage, QrLogoResizeError, resizeLogo, type QrCardFileKind } from './qr-card-files';

/** 마지막 입력 뒤 이만큼 멈추면 저장한다 (docs/specs/qr-card §5.4) */
export const AUTOSAVE_DELAY_MS = 800;
const WORDMARK_SRC = '/brand/wordmark.png';
const TITLE_LENGTH_MESSAGE = `매장 이름은 1~${QR_CARD_TITLE_MAX}자로 적어 주세요`;
const MESSAGE_LENGTH_MESSAGE = `안내 문구는 ${QR_CARD_MESSAGE_MAX}자까지 적을 수 있어요`;
const LOGO_TYPE_MESSAGE = 'PNG나 JPG 이미지만 올릴 수 있어요.';
const LOGO_LOAD_MESSAGE = '로고를 불러오지 못했어요. 다시 올려 주세요.';
const FILE_FAILED_MESSAGE = '파일을 만들지 못했어요. 다시 시도해 주세요.';

export type QrCardSaveState = 'idle' | 'saving' | 'saved' | 'error';
export type QrCardDesignPatch = Partial<Pick<QrCardDesignDto, 'layout' | 'color' | 'title' | 'message'>>;

interface StoreQrDto {
  url: string | null;
  issuedAt: string | null;
}

/** 서버 검증(schema.ts, §4.1: title 1~20자·message 0~40자)과 같은 기준. 어긋나면 PUT 하지 않고 이 문구를 보인다 */
export function designInputError({ title, message }: Pick<QrCardDesignDto, 'title' | 'message'>): string | null {
  const titleLength = title.trim().length;
  if (titleLength < 1 || titleLength > QR_CARD_TITLE_MAX) return TITLE_LENGTH_MESSAGE;
  if (message.trim().length > QR_CARD_MESSAGE_MAX) return MESSAGE_LENGTH_MESSAGE;
  return null;
}

const bodyOf = ({ layout, color, title, message }: QrCardDesignDto) => ({ layout, color, title, message });

/**
 * PUT 은 한 번에 하나만 보낸다 (§5.4). 보내는 동안 값이 또 바뀌면 끝난 뒤 마지막 값으로 한 번 더 보낸다.
 * 화면의 저장 상태는 가장 나중에 보낸(또는 검증에서 막힌) 요청만 바꾼다 (saveSeq).
 */
function useSerialDesignSave(path: string) {
  const [saveState, setSaveState] = useState<QrCardSaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSeq = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef<QrCardDesignDto | null>(null);

  const showError = useCallback((seq: number, message: string) => {
    if (seq !== saveSeq.current) return;
    setSaveState('error');
    setSaveError(message);
  }, []);

  const put = useCallback(
    async function sendPut(next: QrCardDesignDto): Promise<void> {
      const seq = ++saveSeq.current;
      inFlight.current = true;
      setSaveState('saving');
      setSaveError(null);
      try {
        await apiFetch<QrCardDesignDto>(path, { method: 'PUT', body: JSON.stringify(bodyOf(next)) });
        if (seq === saveSeq.current) setSaveState('saved');
      } catch (error) {
        showError(seq, errorMessageOf(error));
      } finally {
        inFlight.current = false;
        const pending = queued.current;
        queued.current = null;
        if (pending) void sendPut(pending);
      }
    },
    [path, showError],
  );

  const save = useCallback(
    (next: QrCardDesignDto) => {
      const inputError = designInputError(next);
      if (inputError) {
        queued.current = null;
        return showError(++saveSeq.current, inputError);
      }
      if (inFlight.current) {
        queued.current = next;
        return;
      }
      void put(next);
    },
    [put, showError],
  );

  return { save, saveState, saveError };
}

/** 화면 값은 바로 바꾸고, 입력이 멈춘 뒤 저장. 화면을 떠나면 남은 저장을 바로 보낸다 */
function useAutosavedDesign(path: string, loaded: QrCardDesignDto | null) {
  const [design, setDesignState] = useState<QrCardDesignDto | null>(null);
  const { save, saveState, saveError } = useSerialDesignSave(path);
  const latest = useRef<QrCardDesignDto | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loaded || latest.current) return;
    latest.current = loaded;
    setDesignState(loaded);
  }, [loaded]);

  const setDesign = useCallback(
    (patch: QrCardDesignPatch) => {
      if (!latest.current) return;
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setDesignState(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        save(next);
      }, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  useEffect(
    () => () => {
      if (!timer.current || !latest.current) return;
      clearTimeout(timer.current);
      save(latest.current);
    },
    [save],
  );

  return { design, setDesign, saveState, saveError };
}

/** 저장된 로고를 불러오고, 올리기(긴 변 512px PNG)·지우기 (§4.3) */
function useQrLogo(path: string, hasSavedLogo: boolean) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSavedLogo) return;
    loadImage(path).then(setImage, () => setError(LOGO_LOAD_MESSAGE));
  }, [path, hasSavedLogo]);

  const run = async (task: () => Promise<HTMLImageElement | null>) => {
    setPending(true);
    setError(null);
    try {
      setImage(await task());
    } catch (cause) {
      setError(cause instanceof QrLogoResizeError ? cause.message : errorMessageOf(cause));
    } finally {
      setPending(false);
    }
  };

  const upload = (file: File) => {
    if (!isLogoType(file)) return setError(LOGO_TYPE_MESSAGE);
    return run(async () => {
      const dataUrl = await resizeLogo(file);
      await apiFetch<QrCardDesignDto>(path, { method: 'PUT', body: JSON.stringify({ dataUrl }) });
      return loadImage(dataUrl);
    });
  };
  const remove = () =>
    run(async () => {
      await apiFetch<QrCardDesignDto>(path, { method: 'DELETE' });
      return null;
    });

  return { image, pending, error, upload, remove };
}

/** 워드마크가 없으면 카드에서 빠질 뿐 그리기는 계속한다 (복구 가능) */
function useWordmark() {
  const [wordmark, setWordmark] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    loadImage(WORDMARK_SRC).then(setWordmark, () => setWordmark(null));
  }, []);
  return wordmark;
}

/** `/owner/[storeId]/qr-card` 상태 — docs/specs/qr-card §5 */
export function useQrCard(storeId: string) {
  const base = `/api/v1/stores/${storeId}`;
  const designResource = useApiResource<QrCardDesignDto>(`${base}/qr-design`);
  const qrResource = useApiResource<StoreQrDto>(`${base}/qr`);
  const [rotatedUrl, setRotatedUrl] = useState<string | null>(null);
  const autosave = useAutosavedDesign(`${base}/qr-design`, designResource.data);
  const logo = useQrLogo(`${base}/qr-design/logo`, designResource.data?.hasLogo ?? false);
  const wordmark = useWordmark();
  const [downloading, setDownloading] = useState<QrCardFileKind | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const qrUrl = rotatedUrl ?? qrResource.data?.url ?? null;

  const canDownload = Boolean(qrUrl && autosave.design && autosave.design.title.trim() !== '');

  /** 제목이 비면 카드에 이름이 빠지므로 받지 않는다 (§4.1 title 1자 이상) */
  const download = async (kind: QrCardFileKind) => {
    if (!autosave.design || !qrUrl || !canDownload) return;
    setDownloading(kind);
    setDownloadError(null);
    try {
      await downloadQrCard(autosave.design, { qrUrl, logo: logo.image, wordmark }, kind);
    } catch {
      setDownloadError(FILE_FAILED_MESSAGE);
    } finally {
      setDownloading(null);
    }
  };

  return {
    design: autosave.design,
    setDesign: autosave.setDesign,
    loadError: designResource.errorMessage,
    qr: { url: qrUrl, loading: !qrResource.data && !qrResource.errorMessage, error: qrResource.errorMessage },
    setRotatedUrl,
    saveState: autosave.saveState,
    saveError: autosave.saveError,
    logo: { image: logo.image, pending: logo.pending, error: logo.error },
    uploadLogo: logo.upload,
    removeLogo: logo.remove,
    wordmark,
    download,
    canDownload,
    downloading,
    downloadError,
  };
}
