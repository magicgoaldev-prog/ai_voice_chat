import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/conversation');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center md:max-w-lg">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-2">🗣️</h1>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Practice Spoken English
          </h2>
          <p className="text-lg text-gray-600">
            Talk naturally. Improve instantly.
          </p>
        </div>

        <button
          onClick={handleStart}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors mb-4"
        >
          Start Practicing
        </button>

        <p className="text-sm text-gray-500">
          <button
            onClick={() => {
              // For MVP, simulate Google login
              // In production, integrate with Google OAuth
              const mockUser = {
                id: 'user-' + Date.now(),
                email: 'user@example.com',
                name: 'Test User',
              };
              // This would call actual Google OAuth in production
              console.log('Google login would be implemented here');
            }}
            className="underline hover:text-gray-700"
          >
            Login with Google
          </button>
        </p>
      </div>
    </div>
  );
}
