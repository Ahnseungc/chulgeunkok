import { PlaceSearchQuery } from '@/features/store/schema';
import { defineRoute } from '@/server/http/define-route';
import { searchPlaces } from '@/server/integrations/kakao-local';

/** GET /api/v1/places/search — 카카오 키를 클라이언트에 두지 않으려고 서버가 대신 검색. docs/specs/store/README.md §3.1 */
export const GET = defineRoute({ query: PlaceSearchQuery }, async ({ query }) => ({
  places: await searchPlaces(query.query),
}));
