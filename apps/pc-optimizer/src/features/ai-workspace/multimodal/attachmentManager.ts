/**
 * Multimodal AI Interaction Platform — Attachment Manager
 *
 * EPIC 5 PHASE A PART 6
 *
 * Manages file attachments: multiple attachments, metadata, validation,
 * temporary storage. Uses attachment policies from configuration.
 */
import type {
  Attachment,
  AttachmentPolicy,
  AttachmentStatus,
  InputModality,
  MultimodalConfiguration,
} from './types';
import { generateAttachmentId } from './types';

export class AttachmentManager {
  private _config: MultimodalConfiguration;
  private _attachments: Map<string, Attachment> = new Map();
  private _byInput: Map<string, string[]> = new Map();

  constructor(config: MultimodalConfiguration) {
    this._config = config;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  add(
    inputId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number,
    modality: InputModality,
    metadata?: Record<string, unknown>,
  ): Attachment {
    const policy = this._config.attachmentPolicies;

    const validation = this._validate(filename, mimeType, sizeBytes, modality, policy);
    const status: AttachmentStatus = validation.valid ? 'validated' : 'rejected';

    const attachment: Attachment = {
      id: generateAttachmentId(),
      inputId,
      filename,
      mimeType,
      sizeBytes,
      status,
      storagePath: validation.valid ? `tmp://attachments/${inputId}/${filename}` : null,
      metadata: { ...metadata, validationError: validation.error ?? null },
      createdAt: new Date().toISOString(),
      expiresAt: validation.valid ? new Date(Date.now() + policy.retentionMs).toISOString() : null,
      futureMetadata: {},
    };

    this._attachments.set(attachment.id, attachment);
    if (validation.valid) {
      const list = this._byInput.get(inputId) ?? [];
      list.push(attachment.id);
      this._byInput.set(inputId, list);
    }

    return attachment;
  }

  get(attachmentId: string): Attachment | null {
    return this._attachments.get(attachmentId) ?? null;
  }

  getByInput(inputId: string): Attachment[] {
    const ids = this._byInput.get(inputId) ?? [];
    return ids.map((id) => this._attachments.get(id)).filter((a): a is Attachment => a !== undefined);
  }

  remove(attachmentId: string): boolean {
    const attachment = this._attachments.get(attachmentId);
    if (!attachment) return false;
    this._attachments.delete(attachmentId);
    const ids = this._byInput.get(attachment.inputId);
    if (ids) {
      this._byInput.set(attachment.inputId, ids.filter((id) => id !== attachmentId));
    }
    return true;
  }

  removeAllForInput(inputId: string): number {
    const ids = this._byInput.get(inputId) ?? [];
    let count = 0;
    for (const id of ids) {
      if (this._attachments.delete(id)) count++;
    }
    this._byInput.delete(inputId);
    return count;
  }

  count(): number {
    return this._attachments.size;
  }

  countForInput(inputId: string): number {
    return this._byInput.get(inputId)?.length ?? 0;
  }

  getTotalSize(): number {
    let total = 0;
    for (const attachment of this._attachments.values()) {
      if (attachment.status !== 'rejected') {
        total += attachment.sizeBytes;
      }
    }
    return total;
  }

  expireStale(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, attachment] of this._attachments) {
      if (attachment.expiresAt) {
        const expiry = new Date(attachment.expiresAt).getTime();
        if (now > expiry) {
          attachment.status = 'expired';
          this._attachments.delete(id);
          const ids = this._byInput.get(attachment.inputId);
          if (ids) {
            this._byInput.set(attachment.inputId, ids.filter((x) => x !== id));
          }
          count++;
        }
      }
    }
    return count;
  }

  clear(): void {
    this._attachments.clear();
    this._byInput.clear();
  }

  getAll(): Attachment[] {
    return Array.from(this._attachments.values());
  }

  private _validate(
    filename: string,
    mimeType: string,
    sizeBytes: number,
    modality: InputModality,
    policy: AttachmentPolicy,
  ): { valid: boolean; error: string | null } {
    if (this.countForInput(modality) >= policy.maxAttachments) {
      return { valid: false, error: `Max attachments (${policy.maxAttachments}) exceeded` };
    }
    if (this.getTotalSize() + sizeBytes > policy.maxTotalSizeBytes) {
      return { valid: false, error: 'Total attachment size limit exceeded' };
    }
    if (policy.allowedMimeTypes.length > 0 && !policy.allowedMimeTypes.includes(mimeType)) {
      return { valid: false, error: `MIME type ${mimeType} not allowed` };
    }
    if (policy.allowedModalities.length > 0 && !policy.allowedModalities.includes(modality)) {
      return { valid: false, error: `Modality ${modality} not allowed for attachments` };
    }
    if (!filename || filename.trim().length === 0) {
      return { valid: false, error: 'Filename is required' };
    }
    return { valid: true, error: null };
  }
}
