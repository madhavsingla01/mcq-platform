const axios = require('axios');

async function run() {
  try {
    const email = 'audit' + Date.now() + '@test.com';
    let res = await axios.post('http://localhost:5000/api/v1/auth/register', {
      name: 'Audit User',
      username: 'audituser' + Date.now(),
      email,
      password: 'Password123!',
    });
    const cookies = res.headers['set-cookie'];
    const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
    const csrfToken = cookieString.match(/csrfToken=([^;]+)/)?.[1] || '';

    const headers = { Cookie: cookieString, 'X-CSRF-Token': csrfToken };

    res = await axios.post('http://localhost:5000/api/v1/quizzes', {
      title: 'Audit Quiz',
      questions: [
        {
          questionText: 'What is 2+2?',
          options: [{ text: '3' }, { text: '4', isCorrect: true }, { text: '5' }],
          explanation: 'Math'
        }
      ]
    }, { headers });

    const quizId = res.data.data.quiz._id;
    const firstQuestionId = res.data.data.questions[0]._id;

    res = await axios.post(`http://localhost:5000/api/v1/attempts/start`, { quizId }, { headers });
    const attemptId = res.data.data.attempt._id;
    
    // Answer with the actual label "B"
    await axios.post(`http://localhost:5000/api/v1/attempts/${attemptId}/answer`, {
        questionId: firstQuestionId,
        selectedAnswer: "B",
        timeTaken: 5
    }, { headers });

    res = await axios.post(`http://localhost:5000/api/v1/attempts/${attemptId}/submit`, { force: false }, { headers });
    console.log(res.data.data.attempt.answers[0]);
    console.log('Score:', res.data.data.attempt.score);
  } catch(e) {
    console.error('Error:', e.response?.data || e.message);
  }
}
run();
