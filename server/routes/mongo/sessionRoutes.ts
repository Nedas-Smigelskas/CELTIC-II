import {Router} from 'express'
import shortid from 'shortid'
import bodyParser from 'body-parser'
import mongoose from 'mongoose'
import { Logger } from '../../utils/logger'

const router = Router();

interface Session {
    code: string;
    teacherName: string;
    task: string;
    students?: string[];
    createdAt?: Date;
}

// MongoDB schema for sessions
const sessionSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    teacherName: { type: String, required: true },
    task: { type: String, required: false, default: '' },
    students: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

// Avoid model overwrite error
const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema, 'Sessions');

router.use(bodyParser.json());

router.post('/api/create-session', async (req, res) => {
    try {
        const sessionId = shortid.generate();
        const teacherName = (req.body as { teacherName: string }).teacherName;
        const task = (req.body as { task: string }).task;

        Logger.debug('Creating session', { sessionId, teacherName, task });

        const newSession = new SessionModel({
            code: sessionId,
            teacherName,
            task,
            students: []
        });

        await newSession.save();
        Logger.info('Session created successfully', { sessionId });
        res.json({ sessionId, teacherName, task });
    } catch (error: any) {
        Logger.error('Error creating session', error);
        res.status(500).json({ error: 'Failed to create session', details: error.message });
    }
});

router.get('/api/session/:sessionId', async (req, res) => {
    try {
        const session = await SessionModel.findOne({ code: req.params.sessionId });
        if (session) {
            res.json({ 
                session: {
                    code: session.code,
                    teacherName: session.teacherName,
                    task: session.task,
                    students: session.students || []
                }
            });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (error) {
        Logger.error('Error fetching session', error);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

router.post('/api/session/:sessionId/join', async (req, res) => {
    try {
        const { studentId } = req.body;
        const session = await SessionModel.findOne({ code: req.params.sessionId });
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (!session.students.includes(studentId)) {
            session.students.push(studentId);
            await session.save();
        }

        res.json({ success: true, students: session.students });
    } catch (error) {
        Logger.error('Error joining session', error);
        res.status(500).json({ error: 'Failed to join session' });
    }
});

router.post('/api/session/:sessionId/leave', async (req, res) => {
    try {
        const { studentId } = req.body;
        const session = await SessionModel.findOne({ code: req.params.sessionId });
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        session.students = session.students.filter((id: string) => id !== studentId);
        await session.save();

        res.json({ success: true, students: session.students });
    } catch (error) {
        Logger.error('Error leaving session', error);
        res.status(500).json({ error: 'Failed to leave session' });
    }
});

router.delete('/api/session/:sessionId', async (req, res) => {
    try {
        await SessionModel.deleteOne({ code: req.params.sessionId });
        res.json({ success: true });
    } catch (error) {
        Logger.error('Error deleting session', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

router.get('/api/create-task/:sessionId', async (req, res) => {
    try {
        const session = await SessionModel.findOne({ code: req.params.sessionId });
        if (session) {
            res.json({ 
                session: {
                    code: session.code,
                    teacherName: session.teacherName,
                    task: session.task,
                    students: session.students || []
                }
            });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (error) {
        Logger.error('Error fetching task', error);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
});

export default router;