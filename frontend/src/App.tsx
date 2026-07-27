import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/lib/authStore'
import { APP_NAME } from '@/lib/config'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'

import LandingPage from '@/pages/LandingPage'
import SignupPage from '@/pages/SignupPage'
import LoginPage from '@/pages/LoginPage'
import CategoryPage from '@/pages/onboarding/CategoryPage'
import TotpPage from '@/pages/onboarding/TotpPage'
import CandidateEntryPoint from '@/pages/candidate/CandidateEntryPoint'
import ProfileBuilderPage from '@/pages/candidate/ProfileBuilderPage'
import CompanyStub from '@/pages/stubs/CompanyStub'
import VerifierStub from '@/pages/stubs/VerifierStub'
import AdminStub from '@/pages/stubs/AdminStub'
import NotFoundPage from '@/pages/NotFoundPage'

function AppShell() {
  useEffect(() => {
    document.title = APP_NAME
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/onboarding/category"
            element={
              <ProtectedRoute allow={['candidate']}>
                <CategoryPage />
              </ProtectedRoute>
            }
          />
          <Route path="/onboarding/2fa" element={<TotpPage />} />

          <Route
            path="/candidate"
            element={
              <ProtectedRoute allow={['candidate']}>
                <CandidateEntryPoint />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidate/edit"
            element={
              <ProtectedRoute allow={['candidate']}>
                <ProfileBuilderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company"
            element={
              <ProtectedRoute allow={['company']}>
                <CompanyStub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verify"
            element={
              <ProtectedRoute allow={['verifier']}>
                <VerifierStub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={['admin']}>
                <AdminStub />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
