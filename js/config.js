/**
 * SafePatrol 환경 설정
 * - workerUrl이 비어있으면: 브라우저 로컬 저장소(IndexedDB) 데모 모드로 작동
 * - workerUrl을 입력하면: Cloudflare Worker를 거쳐 GitHub 비공개 저장소(safepatrol-data-2026)와 실시간 동기화
 */
window.SAFEPATROL_CONFIG = {
  workerUrl: '' // 배포된 Cloudflare Worker 주소 (예: https://safepatrol-relay.<subdomain>.workers.dev)
};
