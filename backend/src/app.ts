import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { resolve } from 'node:path'
import { initializeDatabase } from './db/database.js'
import { errorMiddleware } from './middleware/error.middleware.js'
import { apiRouter } from './routes/api.routes.js'

dotenv.config()
initializeDatabase()

export const app = express()
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

app.use(cors({ origin: [frontendOrigin, 'http://localhost:4173'], credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(resolve(process.cwd(), 'uploads')))
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'gradesense-backend' }))
app.use('/api', apiRouter)
app.use(errorMiddleware)
