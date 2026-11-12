import { afterLoginPath } from '@/features/auth/model/after-login';
import OwnerLoginScreen from '@/features/auth/ui/OwnerLoginScreen';

interface OwnerLoginPageProps {
  searchParams: Promise<{ verify?: string; next?: string }>;
}

/** 사장님 휴대폰 인증 — docs/specs/auth/README.md §4. `?verify=1` 은 지금 기기에 번호만 붙인다 (§4.2) */
export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const query = await searchParams;
  return <OwnerLoginScreen attach={query.verify === '1'} nextPath={afterLoginPath(query.next)} />;
}
