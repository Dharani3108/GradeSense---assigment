import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AppLayout } from './components/layout/AppLayout'
import { PageTransition } from './components/layout/PageTransition'
import { HistoryPage } from './pages/HistoryPage'
import { ProcessingPage } from './pages/ProcessingPage'
import { ResultsPage } from './pages/ResultsPage'
import { UploadWizardPage } from './pages/UploadWizardPage'

function App() {
  const location = useLocation()
  return <AppLayout><AnimatePresence mode="wait"><PageTransition key={location.pathname}><Routes location={location}><Route path="/" element={<UploadWizardPage />} /><Route path="/processing" element={<ProcessingPage />} /><Route path="/results" element={<ResultsPage />} /><Route path="/history" element={<HistoryPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></PageTransition></AnimatePresence></AppLayout>
}
export default App
