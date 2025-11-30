import request from 'supertest';
import {App} from '../src/App';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios'
import {StudentPage} from '../src/components/pages/student/student-page'

jest.mock('axios', () => ({
    get: jest.fn(() => Promise.resolve({ data: { taskDescription: 'Implement binary search.', teacherName: 'Mrs. Smith' } })),
}));

describe('Authentication API', () => {
    it('returns a token for valid credentials', async () => {
        const response = await request(App)
            .post('/api/login')
            .send({
                username: 'validUsername',
                password: 'validPassword',
            });

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('token');
    });
});

describe('StudentCodingSpace Component', () => {
    it('renders correctly upon joining session', async () => {
        render(StudentPage());

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalled();
            // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions
            expect(screen.getByText('Implement binary search.')).toBeInTheDocument();
            // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions
            expect(screen.getByText("Teacher: Mrs. Smith")).toBeInTheDocument();

        });
    });
});

describe('MyComponent', () => {
    it('renders without crashing', () => {
        const { container } = render(StudentPage());
        expect(container).toBeInTheDocument();
    });
});

