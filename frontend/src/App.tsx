import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/Conversation/ErrorBoundary';
import Landing from './components/Landing';
import ConversationScreen from './components/Conversation/ConversationScreen';
import Settings from './components/Settings';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/conversation" element={<ConversationScreen />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
