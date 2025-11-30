import {TerminalViewer} from './terminal-viewer'
import React, {useEffect, useRef} from 'react'
import {useSocket} from '../../socketContext'
import './teacher-session-page.css'
import {useNavigate} from 'react-router-dom'
import {Button} from 'primereact/button'
import {Toast} from 'primereact/toast'

export const TeacherSessionPage = () => {
    const {socket} = useSocket();
    // const [students, setStudents] = useState<string[]>([]);
    const sessionId = localStorage.getItem('sessionId');
    const task = localStorage.getItem('task');
    const navigate = useNavigate();
    const toast = useRef<Toast>(null)

    const showToast = (severity: 'success' | 'info' | 'warn' | 'error' | undefined, summary: string, detail: string) => {
        toast.current?.show({severity, summary, detail})
    }
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    useEffect(() => {
        if (!localStorage.getItem('sessionId')) {
            navigate('/teacher');
        }
    }, [socket, navigate])

    const endSession = async () => {
        if (!localStorage.getItem('sessionId')) {
            showToast('info', 'No current session', 'Create a session to get started');
            return;
        }

        // Confirm with the teacher
        if (!window.confirm('Are you sure you want to end the session? All students will be disconnected.')) {
            return;
        }

        const teacherId = localStorage.getItem('username')?.replace(/^"(.*)"$/, '$1');
        
        // Notify server to end session and clean up
        socket?.emit('endSession', {
            teacherId,
            sessionId: localStorage.getItem('sessionId')
        });

        // Clear local storage
        localStorage.removeItem('sessionId');
        localStorage.removeItem('task');
        localStorage.removeItem('students');

        showToast('success', 'Session Ended', 'All students have been notified');
        
        // Wait briefly before redirecting
        await delay(1500);
        navigate('/teacher');
    }

    return (
        <div className="main-container">
            <Toast ref={toast} />
            <div className="sessioninfo">
                <div className="session-pin">
                    Session Pin: {sessionId}
                </div>
                <div className="session-task">
                    Task: {task}
                </div>
                <Button 
                    label="End Session" 
                    onClick={endSession}
                    className="p-button-danger"
                />
            </div>
            <div>
                <TerminalViewer />
            </div>
        </div>
    )
}