import Home from '../pages/Home.jsx'
import Login from '../pages/Login.jsx'
import Register from '../pages/Register.jsx'
import ForgotPassword from '../pages/ForgotPassword.jsx'
import ResetPassword from '../pages/ResetPassword.jsx'
import VerifyEmail from '../pages/VerifyEmail.jsx'
import Dashboard from '../pages/Dashboard.jsx'
import Profile from '../pages/Profile.jsx'
import Directory from '../pages/Directory.jsx'
import AlumniProfile from '../pages/AlumniProfile.jsx'
import Messages from '../pages/Messages.jsx'
import Notifications from '../pages/Notifications.jsx'
import Jobs from '../pages/Jobs.jsx'
import Events from '../pages/Events.jsx'
import EventDetails from '../pages/EventDetails.jsx'
import Mentorship from '../pages/Mentorship.jsx'
import Resume from '../pages/Resume.jsx'
import Donations from '../pages/Donations.jsx'
import Students from '../pages/Students.jsx'
import Announcements from '../pages/Announcements.jsx'
import Admin from '../pages/Admin.jsx'
import Settings from '../pages/Settings.jsx'
import Assistant from '../pages/Assistant.jsx'
import ResumeAnalyzer from '../pages/ResumeAnalyzer.jsx'
import JobReadiness from '../pages/JobReadiness.jsx'
import SemanticSearch from '../pages/SemanticSearch.jsx'
import NotFound from '../pages/NotFound.jsx'
import { Forbidden, Unauthorized, ServerError, Offline, Maintenance } from '../pages/SystemScreens.jsx'
import { RequireAnonymous, RequireAuth, RequireRoleAccess } from './guards.jsx'

const auth = (element) => <RequireAuth><RequireRoleAccess>{element}</RequireRoleAccess></RequireAuth>
const anonymous = (element) => <RequireAnonymous>{element}</RequireAnonymous>

const routes = [
  { path: '/', element: <Home /> },
  { path: '/login', element: anonymous(<Login />) },
  { path: '/register', element: anonymous(<Register />) },
  { path: '/forgot-password', element: anonymous(<ForgotPassword />) },
  { path: '/reset-password', element: anonymous(<ResetPassword />) },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/dashboard', element: auth(<Dashboard />) },
  { path: '/profile', element: auth(<Profile />) },
  { path: '/directory', element: auth(<Directory />) },
  { path: '/alumni/:userId', element: auth(<AlumniProfile />) },
  { path: '/messages', element: auth(<Messages />) },
  { path: '/messages/:peerId', element: auth(<Messages />) },
  { path: '/notifications', element: auth(<Notifications />) },
  
  // Jobs & Applications
  { path: '/jobs', element: auth(<Jobs />) },
  { path: '/jobs/company/:id', element: auth(<Jobs view="company" />) },
  { path: '/jobs/review/:id', element: auth(<Jobs view="review" />) },
  { path: '/jobs/saved', element: auth(<Jobs view="saved" />) },
  { path: '/jobs/applications', element: auth(<Jobs view="applications" />) },
  { path: '/jobs/:id', element: auth(<Jobs view="job" />) },

  // Events
  { path: '/events', element: auth(<Events />) },
  { path: '/events/:id', element: auth(<EventDetails />) },

  // Mentorship
  { path: '/mentorship', element: auth(<Mentorship />) },

  // Role Specific Pages
  { path: '/resume', element: auth(<Resume />) },
  { path: '/donations', element: auth(<Donations />) },
  { path: '/students', element: auth(<Students />) },
  { path: '/announcements', element: auth(<Announcements />) },

  // AI Career Intelligence
  { path: '/assistant', element: auth(<Assistant />) },
  { path: '/resume-analyzer', element: auth(<ResumeAnalyzer />) },
  { path: '/job-readiness', element: auth(<JobReadiness />) },
  { path: '/semantic-search', element: auth(<SemanticSearch />) },

  // Admin Area
  { path: '/admin', element: auth(<Admin initialTab="overview" />) },
  { path: '/admin/dashboard', element: auth(<Admin initialTab="overview" />) },
  { path: '/admin/users', element: auth(<Admin initialTab="users" />) },
  { path: '/admin/verification', element: auth(<Admin initialTab="verification" />) },
  { path: '/admin/jobs', element: auth(<Admin initialTab="jobs" />) },
  { path: '/admin/events', element: auth(<Admin initialTab="events" />) },
  { path: '/admin/donations', element: auth(<Admin initialTab="donations" />) },
  { path: '/admin/analytics', element: auth(<Admin initialTab="analytics" />) },
  { path: '/admin/audit-logs', element: auth(<Admin initialTab="audit_logs" />) },

  // Settings
  { path: '/settings', element: auth(<Settings />) },

  // Error & System Screens
  { path: '/403', element: <Forbidden /> },
  { path: '/401', element: <Unauthorized /> },
  { path: '/500', element: <ServerError /> },
  { path: '/offline', element: <Offline /> },
  { path: '/maintenance', element: <Maintenance /> },
  { path: '*', element: <NotFound /> },
]

export default routes
