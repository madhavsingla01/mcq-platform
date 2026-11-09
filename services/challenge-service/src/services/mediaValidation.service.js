import { AppError } from '../middleware/error.middleware.js';

// Quiz owns authoring accessibility policy; Challenge retains contest rules.
export async function validateChallengeMedia(req, draft) {
  const questions=req.body.questions;
  if(!Array.isArray(questions) || !questions.some(q=>q.accessibilityMedia?.length || q.options?.some(o=>o.accessibilityMedia?.length))) return;
  const origin=new URL(process.env.QUIZ_SERVICE_URL || 'http://127.0.0.1:5002');
  if(!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new AppError('Quiz service configuration is invalid',503);
  const headers={'content-type':'application/json'};
  for(const key of ['cookie','authorization','x-csrf-token','x-request-id'])if(req.headers[key])headers[key]=req.headers[key];
  let response;
  try {response=await fetch(new URL('/api/v1/quiz/media-validation',origin),{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({questions,draft})});}
  catch {throw new AppError('Question media validation is temporarily unavailable',503);}
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new AppError(body.message || 'Review question media before publishing',response.status,body.errors);
  if(!Array.isArray(body.data?.questions))throw new AppError('Question media validation returned an invalid response',502);
  req.body.questions=body.data.questions;
}
