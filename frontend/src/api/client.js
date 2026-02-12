const BASE_URL = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) {
    return null;
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return res;
}

export async function getUsers() {
  const data = await request('/users');
  return data.users;
}

export function getUser(id) {
  return request(`/users/${id}`);
}

export function updateUser(id, data) {
  return request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function startAssessment(userId, targetLanguage = 'es') {
  return request('/assessment/start', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, target_language: targetLanguage }),
  });
}

export function sendAssessmentMessage(sessionId, message) {
  return request(`/assessment/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getAssessments(userId) {
  return request(`/assessment/?user_id=${userId}`);
}

export function getAssessment(sessionId) {
  return request(`/assessment/${sessionId}`);
}

export function deleteAssessment(sessionId) {
  return request(`/assessment/${sessionId}`, { method: 'DELETE' });
}

export async function getProjects(userId) {
  const data = await request(`/projects?user_id=${userId}`);
  return data.projects;
}

export function getProject(id) {
  return request(`/projects/${id}`);
}

export function createProject(data) {
  return request('/projects', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteProject(id) {
  return request(`/projects/${id}`, { method: 'DELETE' });
}

export function startTransformation(projectId) {
  return request(`/projects/${projectId}/transform`, { method: 'POST' });
}

export function getJobStatus(jobId) {
  return request(`/jobs/${jobId}`);
}

export function getProjectJob(projectId) {
  return request(`/projects/${projectId}/job`);
}

export async function getChapters(projectId) {
  const data = await request(`/projects/${projectId}/chapters`);
  return data.chapters;
}

export function getChapter(projectId, chapterNum) {
  return request(`/projects/${projectId}/chapters/${chapterNum}`);
}

export function getExportUrl(projectId, format) {
  return `${BASE_URL}/projects/${projectId}/export/${format}`;
}

export function generateComprehension(projectId, level) {
  return request(`/projects/${projectId}/comprehension/generate`, {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

export function evaluateComprehension(projectId, question, answer, level) {
  return request(`/projects/${projectId}/comprehension/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ question, answer, level }),
  });
}

export async function getDictionary(userId) {
  const data = await request(`/dictionary?user_id=${userId}`);
  return data.terms;
}

export function sendReaderChat(projectId, message, level, contextParagraph, history, userCefr) {
  return request(`/projects/${projectId}/chat/message`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      level,
      context_paragraph: contextParagraph || null,
      history: history || [],
      user_cefr: userCefr || null,
    }),
  });
}
