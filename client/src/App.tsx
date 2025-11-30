import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import {LoginPage} from './components/authentication-pages/login/login-page'
import {RegisterPage} from './components/authentication-pages/register/register-page'
import {TeacherPage} from './components/pages/teacher/teacher-page'
import {StudentPage} from './components/pages/student/student-page'
import {TeacherSessionPage} from './components/pages/teacher/teacher-session-page'
import { PrimeReactProvider } from 'primereact/api';
import {SocketProvider} from './components/socketContext'

export const App = () => {



    return (
            <SocketProvider>
                <PrimeReactProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<LoginPage />} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route path="/student" element={
                                    <StudentPage data-testid="student-page" />
                            } />
                            <Route path="/teacher" element={
                                    <TeacherPage />
                            } />
                            <Route path="/session" element={
                                <TeacherSessionPage/>
                            } />
                        </Routes>
                    </Router>
                </PrimeReactProvider>
            </SocketProvider>
    );
};


