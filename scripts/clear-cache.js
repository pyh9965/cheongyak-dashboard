// localStorage 캐시 클리어 스크립트
// 브라우저 콘솔에서 실행하세요

console.log('🧹 캐시 클리어 시작...');

// 청약 관련 모든 localStorage 키 제거
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('cheongyak') || key.includes('청약'))) {
        keysToRemove.push(key);
    }
}

keysToRemove.forEach(key => {
    console.log(`  - 삭제: ${key}`);
    localStorage.removeItem(key);
});

console.log(`✅ ${keysToRemove.length}개 캐시 항목 삭제 완료`);
console.log('🔄  페이지를 새로고침합니다...');

// 페이지 강제 새로고침 (캐시 무시)
setTimeout(() => {
    location.reload(true);
}, 1000);
