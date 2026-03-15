import {TerminalViewer} from './terminal-viewer'
import React, {useEffect, useRef, useState} from 'react'
import {useSocket} from '../../socketContext'
import './teacher-session-page.css'
import {useNavigate} from 'react-router-dom'
import {Button} from 'primereact/button'
import {Toast} from 'primereact/toast'
import {Dialog} from 'primereact/dialog'
import axios from 'axios'

interface TaskAnalytics {
    taskId: string;
    taskIndex: number;
    title: string;
    totalStudents: number;
    successfulCount: number;
    failedCount: number;
    notCompletedCount: number;
    unsuccessfulCount: number;
    completionRate: number;
}

interface SessionSummaryInfo {
    code?: string;
    teacherName?: string;
    mode?: string;
    totalTasks?: number;
    totalStudents?: number;
}

export const TeacherSessionPage = () => {
    const {socket} = useSocket();
    const [sessionState, setSessionState] = useState<'lobby' | 'active' | 'ended'>('active');
    const [sessionMode, setSessionMode] = useState<string>('empty');
    const [isEndingSession, setIsEndingSession] = useState(false);
    const [showSessionSummary, setShowSessionSummary] = useState(false);
    const [taskAnalytics, setTaskAnalytics] = useState<TaskAnalytics[]>([]);
    const [sessionSummaryInfo, setSessionSummaryInfo] = useState<SessionSummaryInfo | null>(null);
    const sessionId = sessionStorage.getItem('sessionId');
    const task = sessionStorage.getItem('task');
    const navigate = useNavigate();
    const toast = useRef<Toast>(null)

    const showToast = (severity: 'success' | 'info' | 'warn' | 'error' | undefined, summary: string, detail: string) => {
        toast.current?.show({severity, summary, detail})
    }

    useEffect(() => {
        if (!sessionStorage.getItem('sessionId')) {
            navigate('/teacher');
        }
        
        // Join the session room for targeted socket events
        if (socket && sessionId) {
            const teacherId = sessionStorage.getItem('username')?.replace(/^"(.*)"$/, '$1');
            socket.emit("joinSession", {
                sessionCode: sessionId,
                userId: teacherId,
            });
        }
        
        // Fetch session details to check state
        const fetchSessionDetails = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/api/session/${sessionId}`);
                setSessionState(response.data.session.sessionState || 'active');
                setSessionMode(response.data.session.mode || 'empty');
            } catch (error) {
                console.error('Error fetching session details:', error);
            }
        };
        
        fetchSessionDetails();
    }, [socket, navigate, sessionId])

    useEffect(() => {
        if (!socket || !sessionId) return;

        const handleSessionEnded = (data: {
            teacherId?: string;
            sessionId: string;
            message?: string;
            sessionInfo?: SessionSummaryInfo;
            taskAnalytics?: TaskAnalytics[];
        }) => {
            if (data.sessionId !== sessionId) return;

            setSessionState('ended');
            setIsEndingSession(false);
            setSessionSummaryInfo(data.sessionInfo || null);
            setTaskAnalytics(data.taskAnalytics || []);
            setShowSessionSummary(true);
            showToast('info', 'Session Ended', 'Task summary is ready.');
        };

        socket.on('sessionEnded', handleSessionEnded);

        return () => {
            socket.off('sessionEnded', handleSessionEnded);
        };
    }, [socket, sessionId]);

    const startSession = async () => {
        try {
            await axios.post(`http://localhost:8000/api/session/${sessionId}/start`);
            setSessionState('active');
            showToast('success', 'Session Started', 'All students can now begin!');
        } catch (error) {
            console.error('Error starting session:', error);
            showToast('error', 'Error', 'Failed to start session');
        }
    };

    const endSession = async () => {
        if (!sessionStorage.getItem('sessionId')) {
            showToast('info', 'No current session', 'Create a session to get started');
            return;
        }

        // Confirm with the teacher
        if (!window.confirm('Are you sure you want to end the session? All students will be disconnected.')) {
            return;
        }

        const teacherId = sessionStorage.getItem('username')?.replace(/^"(.*)"$/, '$1');
        const currentSessionId = sessionStorage.getItem('sessionId');
        
        setIsEndingSession(true);
        
        // Notify server to end session and clean up
        socket?.emit('endSession', {
            teacherId,
            sessionId: currentSessionId
        });

        showToast('success', 'Ending Session', 'Wrapping up session and preparing summary...');
    }

    const closeSummaryAndExit = () => {
        const teacherId = sessionStorage.getItem('username')?.replace(/^"(.*)"$/, '$1');
        const currentSessionId = sessionStorage.getItem('sessionId');

        if (currentSessionId) {
            socket?.emit('leaveSession', {
                sessionCode: currentSessionId,
                userId: teacherId,
            });
        }

        sessionStorage.removeItem('sessionId');
        sessionStorage.removeItem('task');
        sessionStorage.removeItem('students');

        setShowSessionSummary(false);
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
                <div className="session-controls">
                    {sessionMode === 'game' && sessionState === 'lobby' && (
                        <Button 
                            label="Start Session" 
                            onClick={startSession}
                            className="p-button-success"
                            icon="pi pi-play"
                            style={{ marginRight: '10px' }}
                        />
                    )}
                    <Button 
                        label={isEndingSession ? 'Ending...' : 'End Session'} 
                        onClick={endSession}
                        className="p-button-danger"
                        icon="pi pi-times"
                        disabled={isEndingSession}
                    />
                </div>
            </div>
            <div>
                <TerminalViewer />
            </div>

            <Dialog
                header="Session Task Summary"
                visible={showSessionSummary}
                style={{ width: '800px', maxHeight: '90vh' }}
                onHide={closeSummaryAndExit}
                modal
                closable
            >
                <div className="teacher-summary-container">
                    <div className="teacher-summary-header">
                        <h3>Completion Overview</h3>
                        <p>
                            Session: <strong>{sessionSummaryInfo?.code || sessionId}</strong>
                            {' • '}
                            Students: <strong>{sessionSummaryInfo?.totalStudents ?? 0}</strong>
                            {' • '}
                            Tasks: <strong>{sessionSummaryInfo?.totalTasks ?? 0}</strong>
                        </p>
                    </div>

                    {taskAnalytics.length === 0 ? (
                        <div className="teacher-summary-empty">
                            No task analytics available for this session.
                        </div>
                    ) : (
                        <div className="teacher-summary-list">
                            {taskAnalytics.map((taskStat) => {
                                const unsuccessfulRate = taskStat.totalStudents > 0
                                    ? Math.round((taskStat.unsuccessfulCount / taskStat.totalStudents) * 100)
                                    : 0;

                                return (
                                    <div key={taskStat.taskId} className="teacher-summary-item">
                                        <div className="teacher-summary-task-title">
                                            Task {taskStat.taskIndex}: {taskStat.title}
                                        </div>
                                        <div className="teacher-summary-metric success">
                                            Successful: {taskStat.successfulCount}/{taskStat.totalStudents} ({taskStat.completionRate}%)
                                        </div>
                                        <div className="teacher-summary-metric unsuccessful">
                                            Unsuccessful: {taskStat.unsuccessfulCount}/{taskStat.totalStudents} ({unsuccessfulRate}%)
                                        </div>
                                        <div className="teacher-summary-breakdown">
                                            Failed: {taskStat.failedCount} | Not completed: {taskStat.notCompletedCount}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="teacher-summary-actions">
                        <Button
                            label="Return to Dashboard"
                            icon="pi pi-home"
                            onClick={closeSummaryAndExit}
                            className="p-button-primary"
                        />
                    </div>
                </div>
            </Dialog>
        </div>
    )
}