/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import SubjectView from './pages/SubjectView';
import QuestionCreate from './pages/QuestionCreate';
import QuizView from './pages/QuizView';
import Results from './pages/Results';
import TopicHistory from './pages/TopicHistory';
import FullReport from './pages/FullReport';
import CalendarPage from './pages/Calendar';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen font-sans">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/report" element={<FullReport />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/subject/:id" element={<SubjectView />} />
            <Route path="/subject/:subjectId/topic/:topicId/add-question" element={<QuestionCreate />} />
            <Route path="/subject/:subjectId/topic/:topicId/history" element={<TopicHistory />} />
            <Route path="/quiz/:topicId" element={<QuizView />} />
            <Route path="/results" element={<Results />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}
