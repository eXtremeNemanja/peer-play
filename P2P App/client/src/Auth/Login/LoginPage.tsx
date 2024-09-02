import React, { useState, ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import './LoginPage.css'; // Optional: for custom styling
import Button from '../../Components/Button/Button.tsx';
import InputField from '../../Components/InputField/InputField.tsx';
import { AuthService } from '../Service/AuthService.tsx';

// TypeScript types for component state
interface LoginResponse {
    token: string;
}

const LoginPage = () => {
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [token, setToken] = useState<string>('');

    const login = async (e:any) => {
        e.preventDefault();
        try {
            const response = await AuthService.login(username, password);
            localStorage.setItem('token', response.token);
            // navigate('/campaigns');
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setToken('');

        try {
            const response = await axios.post<LoginResponse>('http://localhost:3001/login', {
                username,
                password,
            });

            // Handle the response, e.g., save the token in local storage
            setToken(response.data.token);
            localStorage.setItem('authToken', response.data.token);
            alert('Login successful!');
        } catch (err) {
            console.error('Login failed:', err);
            setError('Invalid username or password');
        }
    };

    const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setUsername(event.target.value);
    };

    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPassword(event.target.value);
    };

    return (
        <div className="login-container">
            <h1>Login</h1>
            <form onSubmit={handleSubmit} className="login-form">
                <div className="form-group">
                    <InputField value={username} onChange={handleUsernameChange} type="text" label="Username" id="username" required={true} />
                </div>
                <div className="form-group">
                    <InputField value={password} onChange={handlePasswordChange} type="password" label="Password" id="password" required={true} />
                </div>
                {error && <p className="error-message">{error}</p>}
                {/* <button type="submit">Login</button> */}
                <Button onClick={login}/>
                {token && <p className="success-message">Logged in successfully!</p>}
            </form>
        </div>
    );
}

export default LoginPage;
