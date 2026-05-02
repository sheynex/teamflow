import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import UpdatePassword from './pages/UpdatePassword';
import Users from './pages/Users';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Documents from './pages/Documents';
import TimeTracking from './pages/TimeTracking';
import TimeHistory from './pages/TimeHistory';
import ActivityLog from './pages/ActivityLog';
import Search from './pages/Search';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
        <Sidebar />
        <main className="lg:ml-64 p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <AppLayout>
            <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
            <Route path="/time" element={<ProtectedRoute><TimeTracking /></ProtectedRoute>} />
            <Route path="/time-history" element={<ProtectedRoute><TimeHistory /></ProtectedRoute>} />
            <Route path="/activity" element={<ProtectedRoute><ActivityLog /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={['Admin', 'Super Admin']}><Analytics /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={['Admin', 'Super Admin']}><Reports /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={['Admin', 'Super Admin']}><Users /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={['Admin', 'Super Admin']}><Settings /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}
