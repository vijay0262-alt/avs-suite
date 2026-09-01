/**
 * Duplicate Intelligence service — wraps backend duplicate_intel.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface KeepFile {
  path: string;
  name: string;
  score: number;
  reasons: string[];
}

export interface DeleteFile {
  path: string;
  name: string;
  score: number;
  reasons: string[];
}

export interface DuplicateGroup {
  id: string;
  hash: string;
  fileType: string;
  fileCount: number;
  fileSize: number;
  wastedBytes: number;
  keepFile: KeepFile;
  deleteFiles: DeleteFile[];
  timestamp: string;
  dismissed: boolean;
}

export interface DupIntelConfig {
  enabled: boolean;
  minFileSizeKB: number;
  maxFileSizeMB: number;
  scanPaths: string[];
  excludePaths: string[];
  hashAlgorithm: 'md5' | 'sha256';
  maxGroups: number;
}

export interface DupIntelStatus {
  enabled: boolean;
  config: DupIntelConfig;
  stats: {
    totalScans: number;
    totalGroups: number;
    totalFilesDeleted: number;
    totalBytesFreed: number;
    activeGroups: number;
    totalWastedBytes: number;
    byFileType: Record<string, number>;
  };
  supported: boolean;
}

export interface ScanResult {
  success: boolean;
  groups: DuplicateGroup[];
  count: number;
  totalFilesScanned: number;
  totalDuplicateBytes: number;
  totalWastedBytes: number;
  message: string;
}

export interface ListGroupsResponse {
  groups: DuplicateGroup[];
  count: number;
  totalActive: number;
}

export interface DeleteResult {
  success: boolean;
  message: string;
  bytesFreed?: number;
  deletedCount?: number;
  failedCount?: number;
}

export interface ConfigResult {
  success: boolean;
  config: DupIntelConfig;
  message: string;
}

export const duplicateIntelService = {
  async scan(paths?: string[]): Promise<ScanResult> {
    return client().call(RPC_METHODS.DUP_INTEL_SCAN, paths ? { paths } : undefined);
  },

  async getStatus(): Promise<DupIntelStatus> {
    return client().call(RPC_METHODS.DUP_INTEL_STATUS);
  },

  async listGroups(params?: { limit?: number; dismissed?: boolean; fileType?: string }): Promise<ListGroupsResponse> {
    return client().call(RPC_METHODS.DUP_INTEL_LIST_GROUPS, params);
  },

  async dismissGroup(id: string): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.DUP_INTEL_DISMISS_GROUP, { id });
  },

  async deleteFile(path: string): Promise<DeleteResult> {
    return client().call(RPC_METHODS.DUP_INTEL_DELETE_FILE, { path });
  },

  async deleteRecommended(): Promise<DeleteResult> {
    return client().call(RPC_METHODS.DUP_INTEL_DELETE_RECOMMENDED);
  },

  async clearAll(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.DUP_INTEL_CLEAR_ALL);
  },

  async configure(config: Partial<DupIntelConfig>): Promise<ConfigResult> {
    return client().call(RPC_METHODS.DUP_INTEL_CONFIGURE, config);
  },
};
