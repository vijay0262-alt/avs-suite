/**
 * Privacy Cleaner types
 */

export interface PrivacyItem {
  category: string;
  path: string;
  size: number;
  description: string;
  safeToDelete: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  canRestore: boolean;
}

export interface PrivacyScanResult {
  items: PrivacyItem[];
  totalSize: number;
  categoriesFound: string[];
  browsersDetected: string[];
  itemCount: number;
  categoryBreakdown: Record<string, number>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface PrivacyCleanResult {
  status: string;
  itemsCleaned: number;
  spaceFreed: number;
  categoriesCleaned: string[];
  errors: string[];
  durationMs: number;
  currentCategory: string;
  itemsRemaining: number;
  estimatedTimeRemainingMs: number;
  backupCreated: boolean;
  backupPath: string;
}

export interface PrivacyState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  scanResult: PrivacyScanResult | null;
  scanning: boolean;
  cleaning: boolean;
  selectedCategories: Set<string>;
  browsersDetected: string[];
  cleanResult: PrivacyCleanResult | null;
}
