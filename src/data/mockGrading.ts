import type { Annotation, Evidence, HistoryItem, RubricItem, Score } from '../types/grading'

export const mockScore: Score = { total: 17, maximum: 20, percentage: 85, grade: 'A−', summary: 'A thoughtful response with strong evidence and a clear central argument.' }
export const mockRubric: RubricItem[] = [
  { criterion: 'Historical understanding', score: 5, maximum: 5, feedback: 'Accurately connects industrialisation to urban migration.' },
  { criterion: 'Use of evidence', score: 4, maximum: 5, feedback: 'Uses the source well; add one more specific detail.' },
  { criterion: 'Analysis', score: 4, maximum: 5, feedback: 'Strong cause-and-effect reasoning.' },
  { criterion: 'Communication', score: 4, maximum: 5, feedback: 'Clear and well structured throughout.' },
]
export const mockAnnotations: Annotation[] = [
  { id: 'a1', label: 'Strong evidence', excerpt: 'factories drew workers into growing cities', page: 1, x: '24%', y: '35%', tone: 'success' },
  { id: 'a2', label: 'Clarify this link', excerpt: 'living conditions changed quickly', page: 1, x: '48%', y: '52%', tone: 'warning' },
  { id: 'a3', label: 'Useful conclusion', excerpt: 'a more connected but unequal society', page: 1, x: '31%', y: '72%', tone: 'success' },
]
export const mockEvidence: Evidence[] = [
  { id: 'e1', claim: 'Uses a concrete historical cause', detail: 'Links factory work with city growth.', annotationId: 'a1' },
  { id: 'e2', claim: 'Develop the social impact', detail: 'Explain whose living conditions changed and why.', annotationId: 'a2' },
  { id: 'e3', claim: 'Returns to the core question', detail: 'Concludes with a balanced judgment.', annotationId: 'a3' },
]
export const mockOcrText = [
  'The Industrial Revolution changed society because factories drew workers into growing cities.',
  'This created new jobs, but it also meant that many families faced difficult housing and sanitation conditions.',
  'Over time, railways and trade connected people more closely. Overall, industrialisation produced a more connected but unequal society.',
]
export const mockHistory: HistoryItem[] = [
  { id: 'g-1048', student: 'Amara Patel', assignment: 'Industrial Revolution: social change', date: 'Today, 10:42 AM', score: '17 / 20', status: 'Complete' },
  { id: 'g-1047', student: 'Noah Williams', assignment: 'Industrial Revolution: social change', date: 'Today, 10:28 AM', score: '15 / 20', status: 'Complete' },
  { id: 'g-1046', student: 'Sofia Chen', assignment: 'Industrial Revolution: social change', date: 'Yesterday', score: '—', status: 'Needs review' },
  { id: 'g-1045', student: 'Ethan Martin', assignment: 'Causes of World War I', date: 'Aug 28, 2026', score: '18 / 20', status: 'Complete' },
  { id: 'g-1044', student: 'Maya Johnson', assignment: 'Causes of World War I', date: 'Aug 28, 2026', score: '—', status: 'Processing' },
]
