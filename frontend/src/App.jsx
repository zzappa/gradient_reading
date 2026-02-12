import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/layout/Header';
import Landing from './pages/Landing';
import Tutorial from './pages/Tutorial';
import Assessment from './pages/Assessment';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import Processing from './pages/Processing';
import Reader from './pages/Reader';
import Dictionary from './pages/Dictionary';
import { stop as stopSpeech } from './utils/speech';

function StopSpeechOnNavigate() {
  const location = useLocation();
  useEffect(() => { stopSpeech(); }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <UserProvider>
        <StopSpeechOnNavigate />
        <Header />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/new" element={<NewProject />} />
          <Route path="/project/:projectId/processing" element={<Processing />} />
          <Route path="/project/:projectId/read" element={<Reader />} />
          <Route path="/dictionary" element={<Dictionary />} />
        </Routes>
      </UserProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
