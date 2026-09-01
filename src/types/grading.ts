export type ProcessingStatus = 'complete' | 'active' | 'pending'
export type GradingStatus = 'Complete' | 'Processing' | 'Needs review'

export interface RubricItem { criterion: string; score: number; maximum: number; feedback: string }
export interface Annotation { id: string; label: string; excerpt: string; page: number; x: string; y: string; tone: 'success' | 'warning' | 'error' }
export interface Evidence { id: string; claim: string; detail: string; annotationId: string }
export interface Score { total: number; maximum: number; percentage: number; grade: string; summary: string }
export interface HistoryItem { id: string; student: string; assignment: string; date: string; score: string; status: GradingStatus }
export interface UploadFile { name: string; size: string }
