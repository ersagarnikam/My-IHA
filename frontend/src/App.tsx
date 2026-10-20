import { Navigate, Outlet, createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider, ROLE_HOME, useAuth } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { ComingSoon, PortalLayout } from './components/PortalLayout'
import { ToastProvider } from './components/Toasts'
import { I18nProvider, useT } from './i18n/I18nContext'
import { LoginPage } from './pages/auth/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordResetPages'
import { RegisterPage } from './pages/auth/RegisterPage'
import { VerifyPage } from './pages/auth/VerifyPage'
import { CaseDetailPage } from './portals/patient/CaseDetailPage'
import { CasesPage } from './portals/patient/CasesPage'
import { DashboardPage } from './portals/patient/DashboardPage'
import { DocumentsPage } from './portals/patient/DocumentsPage'
import { MessagesPage } from './portals/patient/MessagesPage'
import { NewCasePage } from './portals/patient/NewCasePage'
import { NotificationsPage } from './portals/patient/NotificationsPage'
import { PatientLayout } from './portals/patient/PatientLayout'
import { PatientProvider, RequireCompleteProfile } from './portals/patient/PatientContext'
import {
  ConsultationPaymentPage,
  TreatmentPaymentPage,
} from './portals/patient/payments/PaymentPages'
import { PaymentsPage } from './portals/patient/payments/PaymentsPage'
import { ProfilePage } from './portals/patient/profile/ProfilePage'
import { ProfileSetupPage } from './portals/patient/profile/ProfileSetupPage'
import { TreatmentsPage } from './portals/patient/treatments/TreatmentsPage'
import { VisaApplicationPage } from './portals/patient/visa/VisaApplicationPage'
import { VisaDetailPage } from './portals/patient/visa/VisaDetailPage'
import { VisaTravelPage } from './portals/patient/visa/VisaTravelPage'

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}

function NotFound() {
  const t = useT('errors.notFound')
  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <h1>{t('title')}</h1>
        <p className="muted">{t('body')}</p>
        <a href="/">{t('backToDashboard')}</a>
      </section>
    </div>
  )
}

/** Shown instead of React Router's developer error screen when a page throws. */
function RouteError() {
  const t = useT('errors')
  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <h1>{t('title')}</h1>
        <p className="muted">{t('body')}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {t('tryAgain')}
        </button>
      </section>
    </div>
  )
}

function PatientRoot() {
  return (
    <PatientProvider>
      <Outlet />
    </PatientProvider>
  )
}

// One app, one route tree per role, each guarded by the role in the JWT —
// replacing the five separate Next.js portals.
const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/verify', element: <VerifyPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        path: '/patient',
        element: <RequireRole role="PATIENT" />,
        children: [
          {
            element: <PatientRoot />,
            children: [
              { path: 'profile/setup', element: <ProfileSetupPage /> },
              {
                element: <PatientLayout />,
                children: [
                  {
                    element: <RequireCompleteProfile />,
                    children: [
                      { index: true, element: <Navigate to="dashboard" replace /> },
                      { path: 'dashboard', element: <DashboardPage /> },
                      { path: 'cases', element: <CasesPage /> },
                      { path: 'cases/new', element: <NewCasePage /> },
                      { path: 'cases/:caseId', element: <CaseDetailPage /> },
                      { path: 'cases/:caseId/payment', element: <TreatmentPaymentPage /> },
                      {
                        path: 'cases/:caseId/consultations/:requestId/payment',
                        element: <ConsultationPaymentPage />,
                      },
                      { path: 'cases/:caseId/visa', element: <VisaApplicationPage /> },
                      { path: 'treatments', element: <TreatmentsPage /> },
                      { path: 'documents', element: <DocumentsPage /> },
                      { path: 'messages', element: <MessagesPage /> },
                      { path: 'notifications', element: <NotificationsPage /> },
                      { path: 'payments', element: <PaymentsPage /> },
                      { path: 'visa-travel', element: <VisaTravelPage /> },
                      { path: 'visa-travel/:submissionId', element: <VisaDetailPage /> },
                      { path: 'profile', element: <ProfilePage /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      portal('/doctor', 'DOCTOR', 'MTA Doctor Portal'),
      portal('/hospital', 'HOSPITAL', 'MTA Hospital Portal'),
      portal('/lawyer', 'LAWYER', 'MTA Visa Lawyer Portal'),
      portal('/admin', 'ADMIN', 'MTA Admin Portal'),
      { path: '*', element: <NotFound /> },
    ],
  },
])

/** Placeholder area for a role whose screens haven't been ported yet. */
function portal(path: string, role: 'DOCTOR' | 'HOSPITAL' | 'LAWYER' | 'ADMIN', title: string) {
  return {
    path,
    element: <RequireRole role={role} />,
    children: [
      {
        element: <PortalLayout title={title} nav={[]} />,
        children: [{ index: true, element: <ComingSoon area={title} /> }],
      },
    ],
  }
}

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
