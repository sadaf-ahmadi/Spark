import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doSignInWithEmailAndPassword, doCreateUserWithEmailAndPassword } from '../firebase/auth';
import { useAuth } from '../contexts/authContext';

export default function LoginPage() {
  const { userLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!isSigningIn) {
      setIsSigningIn(true);
      try {
        await doSignInWithEmailAndPassword(email, password);
        navigate('/gallery');
      } catch (error) {
        setErrorMessage(error.message);
      } finally {
        setIsSigningIn(false);
      }
    }
  };

  const handleSignup = async () => {
    if (!isSigningIn) {
      setIsSigningIn(true);
      try {
        await doCreateUserWithEmailAndPassword(email, password);
        navigate('/gallery');
      } catch (error) {
        setErrorMessage(error.message);
      } finally {
        setIsSigningIn(false);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Login Page</h1>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ margin: '10px', padding: '10px', width: '300px' }}
      />
      <input
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ margin: '10px', padding: '10px', width: '300px' }}
      />
      {errorMessage && (
        <div style={{ color: 'red', margin: '10px' }}>
          {errorMessage}
        </div>
      )}
      <button
        onClick={handleLogin}
        style={{ margin: '10px', padding: '10px 20px' }}
        disabled={isSigningIn}
      >
        Login
      </button>
      <button
        onClick={handleSignup}
        style={{ margin: '10px', padding: '10px 20px' }}
        disabled={isSigningIn}
      >
        Sign Up
      </button>
    </div>
  );
}
