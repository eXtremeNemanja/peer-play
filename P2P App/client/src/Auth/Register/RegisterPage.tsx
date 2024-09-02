import React, { useState, ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import './RegisterPage.css'; // Optional: for custom styling
import InputField from '../../Components/InputField/InputField.tsx';
import Button from '../../Components/Button/Button.tsx';
import { AuthService } from '../Service/AuthService.tsx';
import { Link } from 'react-router-dom';

// Define the types for the component state and response
interface RegisterResponse {
    message: string;
}

const RegisterPage = () => {
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSuccessMessage('');

        try {
            const response = await axios.post<RegisterResponse>('http://localhost:3001/register', {
                username,
                password,
            });

            setSuccessMessage(response.data.message);
            setUsername('');
            setPassword('');
        } catch (err) {
            console.error('Registration failed:', err);
            setError('Registration failed. Please try again.');
        }
    };

    const register = async (e:any) => {
        e.preventDefault();
        try {
            const response = await AuthService.register({username, password});
            // localStorage.setItem('token', response.token);
            // navigate('/campaigns');
        } catch (error) {
            console.error('Registration failed:', error);
            setError('Registration failed. Please try again.');
        }
    };

    const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setUsername(event.target.value);
    };

    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPassword(event.target.value);
    };

    return (
        <div className="register-container">
            <h1>Register</h1>
            <form onSubmit={handleSubmit} className="register-form">
                <div className="form-group">
                    <InputField value={username} onChange={handleUsernameChange} type="text" label="Username" id="username" required={true} />
                </div>
                <div className="form-group">
                    <InputField value={password} onChange={handlePasswordChange} type="password" label="Password" id="password" required={true} />
                </div>
                {error && <p className="error-message">{error}</p>}
                <Button onClick={register} text={"Register"}/>
                {successMessage && <p className="success-message">{successMessage}</p>}
            </form>
            <p>
                Already have an account? <Link to="/login">Login here</Link>
            </p>
        </div>
    );
}

export default RegisterPage;
