import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { initializeDatabase } from './db/database.js'
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js'
import { apiRouter } from './routes/api.routes.js'

initializeDatabase()

export const app = express()

// Uploads are served through an authenticated-by-id route, not as a static tree.
app.use(cors({ origin: [env.frontendOrigin, 'http://localhost:4173'], credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'gradesense-backend' }))
app.use('/api', apiRouter)
app.use(notFoundMiddleware)
app.use(errorMiddleware)
