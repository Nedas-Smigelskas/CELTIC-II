import React, {useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import './register-page.css'
import axios from 'axios'
import {Toast} from 'primereact/toast'

export const RegisterPage = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const toast = useRef<Toast>(null)
    const navigate = useNavigate();

    const showToast = (severity: 'success' | 'info' | 'warn' | 'error' | undefined, summary: string, detail: string) => {
        toast.current?.show({severity, summary, detail})
    }

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            showToast('error', 'Password Mismatch', 'Passwords do not match.');
            return;
        }

        axios
            .post('http://localhost:8000/api/teacher-register', {
                name,
                email,
                password,
            })
            .then((response) => {
                if (response.status === 201) {
                    showToast('success', 'Registration Successful', 'You can now log in.');
                    setTimeout(() => navigate('/'), 1500);
                }
            })
            .catch((error) => {
                if (error.response?.status === 400) {
                    showToast('error', 'Email Already Registered', 'Please use a different email address.');
                } else {
                    showToast('error', 'Registration Failed', 'Please try again.');
                }
            });
    };

    return (
        <div className="main-container-register">
            <Toast ref={toast}/>
            <div className="container-register">
                <form onSubmit={handleRegister}>
                    <div className="title">Teacher Registration</div>
                    <div className="input-box underline">
                        <input 
                            type="text" 
                            placeholder="Full Name" 
                            required={true} 
                            value={name}
                            onChange={(e) => setName(e.target.value)} 
                        />
                        <div className="underline"></div>
                    </div>
                    <div className="input-box underline">
                        <input 
                            type="email" 
                            placeholder="Email Address" 
                            required={true} 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)} 
                        />
                        <div className="underline"></div>
                    </div>
                    <div className="input-box underline">
                        <input 
                            type="password" 
                            placeholder="Password" 
                            required={true} 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)} 
                        />
                        <div className="underline"></div>
                    </div>
                    <div className="input-box">
                        <input 
                            type="password" 
                            placeholder="Confirm Password" 
                            required={true} 
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                        />
                        <div className="underline"></div>
                    </div>
                    <div className="input-box button">
                        <input type="submit" value="Register"/>
                    </div>
                    <div className="redirect-to-login">
                        <p>Have an account already?</p>
                        <button type="button" onClick={() => navigate('/')} className="redirect-to-login-button">Login</button>
                    </div>
                </form>
            </div>
        </div>
    )
}