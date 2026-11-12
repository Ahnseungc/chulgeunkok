'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';

import type { QrCardDesignDto } from '../model/qr-card-types';

import { downloadQrCard, isLogoType, loadImage, QrLogoResizeError, resizeLogo, type QrCardFileKind } from './qr-card-files';

/** 마지막 입력 뒤 이만큼 멈추면 저장한다 (docs/specs/qr-card §5.4) */
export const AUTOSAVE_DELAY_MS = 800;
const WORDMARK_SRC = '/brand/wordmark.png';
const TITLE_REQUIRED_MESSAGE = '매장 이름을 넣어 주세요';
const LOGO_TYPE_MESSAGE = 'PNG나 JPG 이미지만 올릴 수 있어요.';
const LOGO_LOAD_MESSAGE = '로고를 불러오지 못했어요. 다시 올려 주세요.';
const FILE_FAILED_MESSAGE = '파일을 만들지 못했어요. 다시 시도해 주세요.';

export type QrCardSaveState = 'idle' | 'saving' | 'saved' | 'error';
export type QrCardDesignPatch = Partial<Pick<QrCardDesignDto, 'layout' | 'color' | 'title' | 'message'>>;

interface StoreQrDto {
  url: string | null;
  issuedAt: string | null;
}

const bodyOf = ({ layout, color, title, message }: QrCardDesignDto) => ({ layout, color, title, message });

/** 화면 값은 바로 바꾸고, 입력이 멈춘 뒤 PUT 한 번. 화면을 떠나면 남은 저장을 바로 보낸다 */
function useAutosavedDesign(path: string, loaded: QrCardDesignDto | null) {
  const [design, setDesignState] = useState<QrCardDesignDto | null>(null);
  const [saveState, setSaveState] = useState<QrCardSaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef<QrCardDesignDto | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);

  useEffect(() => {
    if (!loaded || latest.current) return;
    latest.current = loaded;
    setDesignState(loaded);
  }, [loaded]);

  const save = useCallback(
    async (next: QrCardDesignDto) => {
      const seq = ++saveSeq.current;
      const failed = (message: string) => {
        if (seq !== saveSeq.current) return;
        setSaveState('error');
        setSaveError(message);
      };
      if (next.title.trim() === '') return failed(TITLE_REQUIRED_MESSAGE);
      setSaveState('saving');
      setSaveError(null);
      try {
        await apiFetch<QrCardDesignDto>(path, { method: 'PUT', body: JSON.stringify(bodyOf(next)) });
        if (seq === saveSeq.current) setSaveState('saved');
      } catch (error) {
        failed(errorMessageOf(error));
      }
    },
    [path],
  );

  const setDesign = useCallback(
    (patch: QrCardDesignPatch) => {
      if (!latest.current) return;
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setDesignState(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void save(next);
      }, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  useEffect(
    () => () => {
      if (!timer.current || !latest.current) return;
      clearTimeout(timer.current);
      void save(latest.current);
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

  const download = async (kind: QrCardFileKind) => {
    if (!autosave.design || !qrUrl) return;
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
    downloading,
    downloadError,
  };
}
