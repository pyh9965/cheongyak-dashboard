/**
 * Custom Hooks 배럴 Export
 *
 * 모든 hooks를 중앙에서 export하여 import 경로를 단순화합니다.
 *
 * @example
 * ```typescript
 * // 개별 import 대신
 * import { useCompetitionStats } from '@/hooks/useCompetitionStats';
 * import { useRateSelector } from '@/hooks/useRateSelector';
 *
 * // 하나의 import로 간편하게
 * import { useCompetitionStats, useRateSelector } from '@/hooks';
 * ```
 */

// 타입 exports
export * from './types';

// Hook exports
export { useCompetitionStats } from './useCompetitionStats';
export { useRateSelector } from './useRateSelector';
export { useWeightedAverage } from './useWeightedAverage';

// Utility exports
export { getCompetitionStagesSync } from './utils';
