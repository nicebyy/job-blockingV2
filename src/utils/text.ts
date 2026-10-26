/**
 * 회사명 문자열 정규화 (괄호, 주식회사, 공백, 특수문자 제거 및 소문자화)
 * 다양한 채용 사이트 간 표기 차이 (예: (주)카카오, 주식회사 카카오, 카카오)를 통일하여
 * 정확한 필터링 및 중복 차단 방지를 지원합니다.
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[㈜㈲㈳㈴㈵㈶㈇]/g, '')
    .replace(/\(주\)|주식회사|\(유\)|유한회사/g, '')
    .replace(/[\s\-_.,()[\]]/g, '')
    .toLowerCase()
    .trim();
}
