/**
 * SQLite DB 연결 관리
 *
 * better-sqlite3를 사용하여 cheongyak.db에 싱글톤 연결을 제공합니다.
 * 서버 사이드 전용 — "use client" 컴포넌트에서 임포트하지 마세요.
 */

import Database from 'better-sqlite3';
import path from 'path';

/** DB 파일 경로: 환경변수 우선, 없으면 public/data/cheongyak.db 폴백 */
const DB_PATH = process.env.CHEONGYAK_DB_PATH
    || path.join(process.cwd(), 'public', 'data', 'cheongyak.db');

let db: Database.Database | null = null;

/**
 * SQLite DB 연결을 반환합니다 (싱글톤).
 *
 * 처음 호출 시 DB 파일을 열고 이후 호출에서는 동일한 연결을 재사용합니다.
 * 읽기 전용으로 열리므로 데이터 변경이 불가능합니다.
 */
export function getDb(): Database.Database {
    if (!db) {
        db = new Database(DB_PATH, { readonly: true });
        // WAL 모드: 읽기 성능 최적화 (여러 요청 동시 처리 가능)
        db.pragma('journal_mode = WAL');
    }
    return db;
}
