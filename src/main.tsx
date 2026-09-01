import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { OcrProvider } from './context/ocr-context'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><OcrProvider><BrowserRouter><App /></BrowserRouter></OcrProvider></StrictMode>,
)
