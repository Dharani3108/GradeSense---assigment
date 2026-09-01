import { Router } from 'express'
import { getAnnotations, patchAnnotation, postAnnotation, removeAnnotation } from '../controllers/annotation.controller.js'
import { exportReport, getReportDetail, getReports, getSessionAnswerFile, getUploadFile, removeReport } from '../controllers/report.controller.js'
import { getConfig, getSessionState, patchSession, postGrade, postSession, postUpload } from '../controllers/session.controller.js'
import { uploadFields } from '../middleware/upload.middleware.js'
import { asyncHandler } from '../utils/async-handler.js'

export const apiRouter = Router()

apiRouter.get('/config', getConfig)

// A session ties the three documents, the report and its annotations together.
apiRouter.post('/sessions', postSession)
apiRouter.get('/sessions/:id', getSessionState)
apiRouter.patch('/sessions/:id', patchSession)
apiRouter.post('/sessions/:id/uploads', uploadFields, postUpload)
apiRouter.post('/sessions/:id/grade', asyncHandler(postGrade))
apiRouter.get('/sessions/:id/answer-file', asyncHandler(getSessionAnswerFile))

// Annotations are edited independently of grading: no regrade on change.
apiRouter.get('/sessions/:id/annotations', getAnnotations)
apiRouter.post('/sessions/:id/annotations', postAnnotation)
apiRouter.patch('/annotations/:annotationId', patchAnnotation)
apiRouter.delete('/annotations/:annotationId', removeAnnotation)

apiRouter.get('/reports', getReports)
apiRouter.get('/reports/:id', getReportDetail)
apiRouter.delete('/reports/:id', removeReport)
apiRouter.get('/reports/:id/export', asyncHandler(exportReport))

apiRouter.get('/uploads/:uploadId/file', asyncHandler(getUploadFile))
