import type { BackupImportPlan, BackupValidation, ConflictInfo, ConflictPolicy, DanglingReference } from '../backup';
import type { ExcelImportCounts, ExcelNormalization, ExerciseDecision } from '../excelImport';

/** Shown to the user before anything is changed. */
export interface BackupImportPreview {
  validation: BackupValidation;
  plan: BackupImportPlan;
  dangling: DanglingReference[];
  conflicts: ConflictInfo[];
  /** Opaque marker of the database state the preview was built on. */
  stateToken: string;
}

export interface BackupImportResult {
  inserted: number;
  updated: number;
  skippedIdentical: number;
  keptExisting: number;
}

export interface Confirmation {
  confirmed: boolean;
}

export interface BackupService {
  exportJson(): Promise<string>;
  previewImport(json: string, policy?: ConflictPolicy): Promise<BackupImportPreview>;
  applyImport(preview: BackupImportPreview, confirmation: Confirmation): Promise<BackupImportResult>;
}

export interface ExcelImportPreview {
  normalization: ExcelNormalization;
  /** What will really be created after comparing with the existing data. */
  counts: ExcelImportCounts;
  /** Already in the database: skipped, never overwritten. */
  skippedExisting: { setLogs: number; weights: number; foodDays: number; dailyLogs: number };
  stateToken: string;
}

export interface ExcelImportResult {
  created: ExcelImportCounts;
}

export interface ExcelImportService {
  preview(file: ArrayBuffer, decisions?: Record<string, ExerciseDecision>): Promise<ExcelImportPreview>;
  apply(preview: ExcelImportPreview, confirmation: Confirmation): Promise<ExcelImportResult>;
}
