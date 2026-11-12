-- 데이터만: 비활성화 때 권한을 비우기 전(이 브랜치 이전)에 비활성화된 직원의 권한을 비운다 (docs/specs/staff §4.2)
UPDATE "Membership" SET "permissions" = '{}' WHERE "status" = 'INACTIVE';
