import { Router } from 'express'
import { createAnnotationPlaceholder, createGrade, createOcr, getHistoryPlaceholder, getReportPlaceholder } from '../controllers/workflow.controller.js'
import { uploadDocuments } from '../controllers/upload.controller.js'
import { upload } from '../middleware/upload.middleware.js'

export const apiRouter = Router()
apiRouter.post('/upload', upload.fields([{ name: 'questionPaper', maxCount: 1 }, { name: 'modelAnswer', maxCount: 1 }, { name: 'studentAnswer', maxCount: 1 }]), uploadDocuments)
apiRouter.post('/ocr', createOcr)
apiRouter.post('/grade', createGrade)
apiRouter.post('/annotate', createAnnotationPlaceholder)
apiRouter.get('/history', getHistoryPlaceholder)
apiRouter.get('/report/:id', getReportPlaceholder)
