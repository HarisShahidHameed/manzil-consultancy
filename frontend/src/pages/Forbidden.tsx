import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Button } from '../components/ui/Button';

const Forbidden: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <ShieldOff className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-4xl font-bold text-gray-900 mb-2">403</h1>
      <p className="text-lg text-gray-600 mb-6">You don't have permission to access this page.</p>
      <Link to="/dashboard">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  </div>
);

export default Forbidden;
