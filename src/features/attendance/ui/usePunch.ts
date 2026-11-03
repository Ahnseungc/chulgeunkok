'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';

import type { AttendanceDto, PunchAction, PunchPreviewDto, PunchResultDto } from '../model/punch-types';

import { retryPunch } from './retry-punch';

const LOCATION_TIMEOUT_MS = 5000;
const LOCATION_MAX_AGE_MS = 60_000;
const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

/** 다시 시도해도 결과가 같은 오류. 새 QR을 찍어야 한다 */
const FINAL_ERROR_CODES: ReadonlySet<string> = new Set([
  'QR_TOKEN_INVALID',
  'QR_TOKEN_REVOKED',
  'VALIDATION_FAILED',
]);

export type PunchState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; canRetry: boolean }
  | { phase: 'ready'; preview: PunchPreviewDto }
  | { phase: 'submitting'; preview: PunchPreviewDto }
  | { phase: 'verifying'; preview: PunchPreviewDto }
  | { phase: 'done'; storeName: string; action: PunchAction; attendance: AttendanceDto | null };

type PunchLocation = { latitude: number; longitude: number; accuracyM: number };

const toErrorState = (error: unknown): Extract<PunchState, { phase: 'error' }> =>
  error instanceof ApiRequestError
    ? { phase: 'error', message: error.message, canRetry: !FINAL_ERROR_CODES.has(error.code) }
    : { phase: 'error', message: NETWORK_ERROR_MESSAGE, canRetry: true };

const isUnauthenticated = (error: unknown) =>
  error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED';

/**
 * QR 랜딩 상태. docs/specs/attendance §3.1·§3.5
 * 1. 미리보기로 출근/퇴근 판별 (미로그인이면 로그인 후 이 화면으로 복귀)
 * 2. 위치는 받을 수 있으면 받는다 (거부해도 진행)
 * 3. 같은 Idempotency-Key로 재시도 → 4. 그래도 실패면 미리보기를 다시 불러 기록 여부를 확인
 */
export function usePunch(qrToken: string) {
  const router = useRouter();
  const [state, setState] = useState<PunchState>({ phase: 'loading' });
  // 화면에 머무는 동안 한 번의 punch 시도 = 한 키. 연타·재시도 모두 같은 키.
  // crypto.randomUUID는 보안 컨텍스트(HTTPS·localhost)에서만 있어 마운트 후 만든다
  const idempotencyKey = useRef('');
  const location = useRef<PunchLocation | null>(null);
  const previewPath = `/api/v1/attendance/punch-preview?qrToken=${encodeURIComponent(qrToken)}`;

  const handleError = useCallback(
    (error: unknown) => {
      if (isUnauthenticated(error)) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/p/${qrToken}`)}`);
        return;
      }
      setState(toErrorState(error));
    },
    [router, qrToken],
  );

  const loadPreview = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ready', preview: await apiFetch<PunchPreviewDto>(previewPath) });
    } catch (error) {
      handleError(error);
    }
  }, [previewPath, handleError]);

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
    void loadPreview();
    requestLocation((value) => {
      location.current = value;
    });
  }, [loadPreview]);

  /** 응답을 끝내 못 받았을 때: 서버의 다음 동작이 바뀌었으면 기록된 것이다 */
  const verifyAfterFailure = useCallback(
    async (preview: PunchPreviewDto) => {
      setState({ phase: 'verifying', preview });
      try {
        const latest = await apiFetch<PunchPreviewDto>(previewPath);
        if (latest.nextAction === preview.nextAction) {
          setState({ phase: 'error', message: '기록되지 않았어요. 다시 시도해 주세요.', canRetry: true });
          return;
        }
        setState({
          phase: 'done',
          storeName: preview.store.name,
          action: preview.nextAction,
          attendance: null,
        });
      } catch (error) {
        handleError(error);
      }
    },
    [previewPath, handleError],
  );

  const submit = useCallback(
    async (preview: PunchPreviewDto) => {
      setState({ phase: 'submitting', preview });
      try {
        const result = await retryPunch(() =>
          apiFetch<PunchResultDto>('/api/v1/attendance/punch', {
            method: 'POST',
            headers: { 'idempotency-key': idempotencyKey.current },
            body: JSON.stringify({
              qrToken,
              expectedAction: preview.nextAction,
              location: location.current,
            }),
          }),
        );
        setState({ phase: 'done', storeName: preview.store.name, ...result });
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'PUNCH_ACTION_MISMATCH') {
          // 다른 기기에서 먼저 기록됨 → 새 시도로 보고 화면을 다시 판별
          idempotencyKey.current = crypto.randomUUID();
          await loadPreview();
          return;
        }
        if (error instanceof ApiRequestError && error.status < 500) {
          handleError(error);
          return;
        }
        await verifyAfterFailure(preview);
      }
    },
    [qrToken, loadPreview, handleError, verifyAfterFailure],
  );

  return { state, submit, reload: loadPreview };
}

function requestLocation(onLocation: (value: PunchLocation) => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) =>
      onLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: Math.round(position.coords.accuracy),
      }),
    // 위치 거부·실패는 출근을 막지 않는다 (docs/specs/attendance §3.1)
    () => undefined,
    { timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS },
  );
}
